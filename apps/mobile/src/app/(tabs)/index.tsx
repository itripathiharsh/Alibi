/**
 * Today — the diary page (owner request 2026-11-22).
 *
 * One page per day, like a paper diary: the day and date at the top, tasks in time order,
 * finished tasks struck out with a pen line (never removed), unfinished tasks from earlier
 * days carried to the top of today's page, and one "write a task…" line at the bottom.
 * Everything reads from and writes to the on-device task store, so the page works offline.
 * The dashboard (focus score, Chief of Staff, kickoff, plan) now lives in Insights.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft, ChevronRight, CloudOff, Mic, PenLine } from "lucide-react-native";
import theme from "../../lib/theme";
import { ProfileAvatar } from "../../components/profile-avatar";
import { ensureAuthenticated, getUserProfile, setCachedIsOffline, useOfflineStatus } from "../../lib/auth";
import { getServerUrl } from "../../lib/config";
import {
  cacheTasks,
  createTaskOffline,
  getAllLocalTasks,
  onLocalTasksChanged,
  syncMobileAccount,
  updateTaskOffline,
  type LocalTask,
} from "../../lib/offline-sync";
import { currentUserId } from "../../lib/learning-signals";
import { addDays, buildDiaryPage, looksLikeManyTasks, startOfDay, timeLabel, type DiaryEntry } from "../../lib/diary-page";
import { DEFAULT_DEADLINE_REMINDER_LEAD_MIN, syncTaskDeadlineReminders } from "../../lib/task-deadline-reminders";
import { triggerHaptic } from "../../lib/focus-session-notification";
import { splitBrainDump } from "../../lib/brain-dump";

const PAPER = "#F8F4EE";
const RULE = "#EDE3D6";
const INK = "#1F2A37";
const PEN = "#E0612A";
const SERIF = Platform.select({ android: "serif", ios: "Georgia", default: undefined });

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function TodayDiaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOffline } = useOfflineStatus();
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const day = useMemo(() => addDays(startOfDay(new Date()), dayOffset), [dayOffset]);
  const page = useMemo(() => buildDiaryPage(tasks, day), [tasks, day]);

  const readLocal = useCallback(async () => {
    const userId = await currentUserId();
    setTasks(await getAllLocalTasks(userId));
  }, []);

  /** Pull fresh tasks from the server into the device store, then push local edits. */
  const refreshFromServer = useCallback(async () => {
    const userId = await currentUserId();
    if (userId === "local_user") { setCachedIsOffline(true); return; }
    const token = await ensureAuthenticated().catch(() => null); // refreshes an expired token
    if (!token) { setCachedIsOffline(true); return; }
    const baseUrl = getServerUrl();
    try {
      await syncMobileAccount(userId, token, baseUrl).catch(() => undefined);
      const response = await fetch(`${baseUrl}/api/v1/tasks?view=all&limit=200`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[];
        if (Array.isArray(data)) await cacheTasks(userId, data);
        setCachedIsOffline(false);
      }
    } catch {
      setCachedIsOffline(true);
    }
  }, []);

  const keepRemindersInStep = useCallback(async () => {
    const userId = await currentUserId();
    const profile = await getUserProfile().catch(() => null);
    const lead = profile?.settings?.reminder_lead_min;
    void syncTaskDeadlineReminders(
      await getAllLocalTasks(userId),
      typeof lead === "number" ? lead : DEFAULT_DEADLINE_REMINDER_LEAD_MIN,
    );
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      await readLocal();
      if (active) setLoading(false);
      await refreshFromServer();
      if (active) await readLocal();
      void keepRemindersInStep();
    })();
    return () => { active = false; };
  }, [readLocal, refreshFromServer, keepRemindersInStep]));

  useEffect(() => onLocalTasksChanged(() => { void readLocal(); }), [readLocal]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void (async () => {
        const userId = await currentUserId();
        const token = await ensureAuthenticated().catch(() => null);
        if (token && userId !== "local_user") await syncMobileAccount(userId, token, getServerUrl()).catch(() => undefined);
      })();
    }, 1500);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFromServer();
    await readLocal();
    setRefreshing(false);
  }, [refreshFromServer, readLocal]);

  const toggle = useCallback(async (entry: DiaryEntry) => {
    triggerHaptic(entry.done ? "tap" : "complete");
    const userId = await currentUserId();
    await updateTaskOffline(userId, entry.task.id, { status: entry.done ? "pending" : "completed" });
    scheduleSync();
  }, [scheduleSync]);

  const addLine = useCallback(async () => {
    const text = draft.trim();
    if (!text || adding) return;
    if (looksLikeManyTasks(text)) {
      setDraft("");
      router.push({ pathname: "/capture", params: { mode: "dump", prefill: text } });
      return;
    }
    setAdding(true);
    try {
      // A page other than today gives the task that day (18:00, the usual "by end of day").
      let deadline: string | null = null;
      if (dayOffset !== 0) {
        const due = new Date(day);
        due.setHours(18, 0, 0, 0);
        deadline = due.toISOString();
      }
      let title = text;
      // Times written on the line ("shaam ko", "kal 5 baje") are read by the server's rules
      // parser. A sleeping or unreachable server never blocks writing the line.
      try {
        const parsed = await Promise.race([
          splitBrainDump(text),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
        const item = parsed?.items.length === 1 ? parsed.items[0] : null;
        if (item) {
          title = item.title || text;
          if (item.deadline_at) deadline = item.deadline_at;
        }
      } catch {
        // Offline: keep the words exactly as written.
      }
      const userId = await currentUserId();
      await createTaskOffline(userId, { title, status: "pending", origin: "manual", deadline_at: deadline });
      triggerHaptic("tap");
      setDraft("");
      scheduleSync();
    } finally {
      setAdding(false);
    }
  }, [adding, day, dayOffset, draft, router, scheduleSync]);

  const isToday = dayOffset === 0;
  const topInset = Platform.OS === "android" ? Math.max(insets.top, StatusBar.currentHeight ?? 0) : insets.top;
  const openTask = (id: string) => router.push({ pathname: "/(tabs)/tasks", params: { taskId: id } });
  const progress = page.total > 0 ? page.done / page.total : 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 12 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh(); }} tintColor={PEN} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{isToday ? "TODAY" : dayOffset === 1 ? "TOMORROW" : dayOffset === -1 ? "YESTERDAY" : " "}</Text>
            <Text style={styles.dayName} accessibilityRole="header">{WEEKDAYS[day.getDay()]}</Text>
            <View style={styles.dateRow}>
              <Pressable onPress={() => setDayOffset((v) => v - 1)} hitSlop={12} style={styles.dayArrow} accessibilityRole="button" accessibilityLabel="Previous day">
                <ChevronLeft size={16} color={theme.colors.text.secondary} />
              </Pressable>
              <Text style={styles.dateText}>{day.getDate()} {MONTHS[day.getMonth()]} {day.getFullYear()}</Text>
              <Pressable onPress={() => setDayOffset((v) => v + 1)} hitSlop={12} style={styles.dayArrow} accessibilityRole="button" accessibilityLabel="Next day">
                <ChevronRight size={16} color={theme.colors.text.secondary} />
              </Pressable>
              {!isToday ? (
                <Pressable onPress={() => setDayOffset(0)} style={styles.todayPill} accessibilityRole="button">
                  <Text style={styles.todayPillText}>Back to today</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            {isOffline ? (
              <Pressable onPress={() => router.push("/login")} style={styles.offlineChip} accessibilityRole="button" accessibilityLabel="Offline. Sign in to sync">
                <CloudOff size={12} color={theme.colors.brand.peachText} />
                <Text style={styles.offlineChipText}>Offline</Text>
              </Pressable>
            ) : null}
            <ProfileAvatar />
          </View>
        </View>

        {page.total > 0 ? (
          <View style={styles.progressBlock}>
            <Text style={styles.progressText}>
              <Text style={styles.progressStrong}>{page.done} of {page.total}</Text> done
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={PEN} style={{ marginTop: 24 }} /> : null}

        <DiarySection title="From earlier days" tone="warn" entries={page.carried} onToggle={toggle} onOpen={openTask} labelFor={() => "late"} />
        <DiarySection title={isToday ? "Planned" : "On this day"} entries={page.timed} onToggle={toggle} onOpen={openTask} labelFor={(entry) => timeLabel(entry.dueAt)} />
        <DiarySection title="Anytime" entries={page.anytime} onToggle={toggle} onOpen={openTask} labelFor={() => ""} />

        {page.total === 0 && !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{isToday ? "A fresh page" : "Nothing written for this day"}</Text>
            <Text style={styles.emptyBody}>Write one thing per line below, or tap the mic and say everything at once.</Text>
          </View>
        ) : null}

        <View style={styles.writeCard}>
          <PenLine size={18} color={PEN} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => { void addLine(); }}
            placeholder={isToday ? "Write a task…" : "Write a task for this day…"}
            placeholderTextColor="#A8A29E"
            style={styles.writeInput}
            returnKeyType="done"
            blurOnSubmit={false}
            editable={!adding}
            accessibilityLabel="Write a task"
          />
          {adding ? <ActivityIndicator size="small" color={PEN} /> : (
            <Pressable onPress={() => router.push({ pathname: "/capture", params: { mode: "dump", voice: "1" } })} hitSlop={10} style={styles.micButton} accessibilityRole="button" accessibilityLabel="Say your tasks">
              <Mic size={18} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
        <Text style={styles.hint}>Tap a task to strike it out. Long-press to open it.</Text>
      </ScrollView>
    </View>
  );
}

function DiarySection({
  title,
  entries,
  tone,
  onToggle,
  onOpen,
  labelFor,
}: {
  title: string;
  entries: DiaryEntry[];
  tone?: "warn";
  onToggle: (entry: DiaryEntry) => void;
  onOpen: (taskId: string) => void;
  labelFor: (entry: DiaryEntry) => string;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, tone === "warn" && { color: "#B45309" }]}>{title}</Text>
      <View style={styles.card}>
        {entries.map((entry, index) => (
          <DiaryLine key={entry.task.id} entry={entry} label={labelFor(entry)} first={index === 0} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
}

interface TextLine { x: number; y: number; width: number; height: number }

function DiaryLine({
  entry,
  label,
  first,
  onToggle,
  onOpen,
}: {
  entry: DiaryEntry;
  label: string;
  first: boolean;
  onToggle: (entry: DiaryEntry) => void;
  onOpen: (taskId: string) => void;
}) {
  const progress = useRef(new Animated.Value(entry.done ? 1 : 0)).current;
  const [lines, setLines] = useState<TextLine[]>([]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: entry.done ? 1 : 0,
      duration: entry.done ? 380 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [entry.done, progress]);

  const shown = lines.slice(0, 2);
  return (
    <Pressable
      onPress={() => onToggle(entry)}
      onLongPress={() => onOpen(entry.task.id)}
      style={({ pressed }) => [styles.line, !first && styles.lineDivider, pressed && { backgroundColor: "#FBF8F4" }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: entry.done }}
      accessibilityLabel={`${entry.task.title}${label ? `, ${label}` : ""}`}
      accessibilityHint="Tap to strike out or bring back. Long-press to open."
    >
      <Text style={[styles.time, label === "late" && styles.timeLate, entry.done && styles.timeDone]}>{label}</Text>
      <View style={styles.titleWrap}>
        <Text
          style={[styles.title, entry.done && styles.titleDone]}
          numberOfLines={2}
          onTextLayout={(event) => setLines(event.nativeEvent.lines.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height })))}
        >
          {entry.task.title}
        </Text>
        {shown.map((line, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.strike,
              {
                left: line.x - 3,
                top: line.y + line.height * 0.52,
                width: progress.interpolate({
                  inputRange: [i / shown.length, (i + 1) / shown.length],
                  outputRange: [0, line.width + 6],
                  extrapolate: "clamp",
                }),
              },
            ]}
          />
        ))}
      </View>
      <View style={[styles.circle, entry.done && styles.circleDone]}>
        {entry.done ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  scroll: { paddingHorizontal: 18, paddingBottom: 48, gap: 18 },
  header: { flexDirection: "row", alignItems: "flex-start" },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: PEN },
  dayName: { fontFamily: SERIF, fontSize: 38, lineHeight: 46, color: INK, fontWeight: "700", letterSpacing: -0.5 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dayArrow: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EFE8DF" },
  dateText: { fontSize: 14, color: theme.colors.text.secondary, fontWeight: "600", marginHorizontal: 2 },
  todayPill: { marginLeft: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FDE7DA" },
  todayPillText: { color: "#B84E0B", fontSize: 12, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 18 },
  offlineChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FDEBDD" },
  offlineChipText: { color: theme.colors.brand.peachText, fontSize: 11, fontWeight: "700" },
  progressBlock: { gap: 8 },
  progressText: { fontSize: 13, color: theme.colors.text.secondary },
  progressStrong: { fontWeight: "800", color: INK },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#EAE2D7", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: PEN },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 1.1, color: theme.colors.text.muted, textTransform: "uppercase", marginLeft: 4 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: RULE, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 15, minHeight: 58 },
  lineDivider: { borderTopWidth: 1, borderTopColor: "#F3EDE5" },
  time: { width: 46, fontSize: 13, fontWeight: "700", color: INK },
  timeLate: { color: "#B45309", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  timeDone: { color: "#B8B0A6" },
  titleWrap: { flex: 1, justifyContent: "center" },
  title: { fontSize: 16, lineHeight: 22, color: INK, fontWeight: "500" },
  titleDone: { color: "#A8A29E" },
  strike: { position: "absolute", height: 2.2, borderRadius: 2, backgroundColor: PEN, transform: [{ rotate: "-1deg" }] },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#D6CEC4", alignItems: "center", justifyContent: "center" },
  circleDone: { backgroundColor: PEN, borderColor: PEN },
  empty: { paddingVertical: 28, alignItems: "center", gap: 6 },
  emptyTitle: { fontFamily: SERIF, fontSize: 22, color: INK, fontWeight: "700" },
  emptyBody: { fontSize: 13, lineHeight: 19, color: theme.colors.text.secondary, textAlign: "center", maxWidth: 280 },
  writeCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: RULE, paddingLeft: 16, paddingRight: 8, minHeight: 58 },
  writeInput: { flex: 1, fontSize: 16, color: INK, paddingVertical: 12 },
  micButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: PEN, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 12, color: theme.colors.text.muted, textAlign: "center", marginTop: -8 },
});
