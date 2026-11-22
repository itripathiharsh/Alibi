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
import { ChevronLeft, ChevronRight, CloudOff, Mic, PenLine } from "lucide-react-native";
import theme from "../../lib/theme";
import { ProfileAvatar } from "../../components/profile-avatar";
import { ensureAuthenticated, getAccessToken, getUserProfile, setCachedIsOffline, useOfflineStatus } from "../../lib/auth";
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

const PAPER = "#FFFCF6";
const RULE = "#EDE3D6";
const MARGIN = "#F3C9B5";
const INK = "#1F2A37";
const PEN = "#E0612A";
const HAND = Platform.select({ android: "casual", ios: "Noteworthy", default: undefined });

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
    const token = (await getAccessToken()) || (await ensureAuthenticated().catch(() => null));
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
        const token = await getAccessToken();
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

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName} accessibilityRole="header">{WEEKDAYS[day.getDay()]}</Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => setDayOffset((v) => v - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous day">
              <ChevronLeft size={18} color={theme.colors.text.secondary} />
            </Pressable>
            <Text style={styles.dateText}>{day.getDate()} {MONTHS[day.getMonth()]} {day.getFullYear()}</Text>
            <Pressable onPress={() => setDayOffset((v) => v + 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next day">
              <ChevronRight size={18} color={theme.colors.text.secondary} />
            </Pressable>
            {!isToday ? (
              <Pressable onPress={() => setDayOffset(0)} style={styles.todayPill} accessibilityRole="button">
                <Text style={styles.todayPillText}>Today</Text>
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

      <ScrollView
        style={styles.paper}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh(); }} tintColor={PEN} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.marginLine} pointerEvents="none" />
        <Text style={styles.count}>
          {page.total === 0 ? (isToday ? "A fresh page" : "Nothing written for this day") : `${page.done} of ${page.total} done`}
        </Text>

        {loading ? <ActivityIndicator color={PEN} style={{ marginTop: 24 }} /> : null}

        {page.carried.length > 0 ? (
          <>
            <Text style={[styles.section, { color: "#B45309" }]}>From earlier days</Text>
            {page.carried.map((entry) => (
              <DiaryLine key={entry.task.id} entry={entry} label="" onToggle={toggle} onOpen={(id) => router.push({ pathname: "/(tabs)/tasks", params: { taskId: id } })} />
            ))}
          </>
        ) : null}

        {page.timed.length > 0 && (page.carried.length > 0 || page.anytime.length > 0) ? <Text style={styles.section}>By time</Text> : null}
        {page.timed.map((entry) => (
          <DiaryLine key={entry.task.id} entry={entry} label={timeLabel(entry.dueAt)} onToggle={toggle} onOpen={(id) => router.push({ pathname: "/(tabs)/tasks", params: { taskId: id } })} />
        ))}

        {page.anytime.length > 0 ? <Text style={styles.section}>Anytime</Text> : null}
        {page.anytime.map((entry) => (
          <DiaryLine key={entry.task.id} entry={entry} label="" onToggle={toggle} onOpen={(id) => router.push({ pathname: "/(tabs)/tasks", params: { taskId: id } })} />
        ))}

        <View style={styles.writeLine}>
          <PenLine size={16} color={theme.colors.text.muted} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => { void addLine(); }}
            placeholder={isToday ? "write a task…" : "write a task for this day…"}
            placeholderTextColor="#B7AFA6"
            style={styles.writeInput}
            returnKeyType="done"
            blurOnSubmit={false}
            editable={!adding}
            accessibilityLabel="Write a task"
          />
          {adding ? <ActivityIndicator size="small" color={PEN} /> : (
            <Pressable onPress={() => router.push({ pathname: "/capture", params: { mode: "dump", voice: "1" } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Say your tasks">
              <Mic size={18} color={PEN} />
            </Pressable>
          )}
        </View>
        {page.total === 0 && isToday && !loading ? (
          <Text style={styles.hint}>Write one thing per line. Tap a line when it's done to strike it out. Long-press to open it.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DiaryLine({
  entry,
  label,
  onToggle,
  onOpen,
}: {
  entry: DiaryEntry;
  label: string;
  onToggle: (entry: DiaryEntry) => void;
  onOpen: (taskId: string) => void;
}) {
  const progress = useRef(new Animated.Value(entry.done ? 1 : 0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: entry.done ? 1 : 0,
      duration: entry.done ? 320 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [entry.done, progress]);

  return (
    <Pressable
      onPress={() => onToggle(entry)}
      onLongPress={() => onOpen(entry.task.id)}
      style={styles.line}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: entry.done }}
      accessibilityLabel={`${entry.task.title}${label ? `, ${label}` : ""}`}
      accessibilityHint="Tap to strike out or bring back. Long-press to open."
    >
      <Text style={styles.time}>{label}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ alignSelf: "flex-start" }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <Text style={[styles.title, entry.done && styles.titleDone]}>{entry.task.title}</Text>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.strike,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width + 6] }) },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: PAPER,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  dayName: { fontFamily: HAND, fontSize: 38, lineHeight: 46, color: INK, fontWeight: Platform.OS === "ios" ? "700" : "400" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  dateText: { fontSize: 14, color: theme.colors.text.secondary, fontWeight: "600" },
  todayPill: { marginLeft: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: "#FDE7DA" },
  todayPillText: { color: "#B84E0B", fontSize: 12, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6 },
  offlineChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FDEBDD" },
  offlineChipText: { color: theme.colors.brand.peachText, fontSize: 11, fontWeight: "700" },
  paper: { flex: 1, backgroundColor: PAPER },
  marginLine: { position: "absolute", left: 66, top: 0, bottom: 0, width: 1.5, backgroundColor: MARGIN },
  count: { marginLeft: 78, marginTop: 14, marginBottom: 6, fontSize: 13, color: theme.colors.text.secondary, fontWeight: "600" },
  section: { marginLeft: 78, marginTop: 14, marginBottom: 2, fontSize: 12, color: theme.colors.text.muted, fontWeight: "700", letterSpacing: 0.4 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingRight: 20,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  time: { width: 66, paddingLeft: 12, fontSize: 12, color: theme.colors.text.muted, fontWeight: "600" },
  title: { fontFamily: HAND, fontSize: 21, lineHeight: 28, color: INK, paddingLeft: 12, paddingRight: 4 },
  titleDone: { color: "#A39B92" },
  strike: {
    position: "absolute",
    left: 9,
    top: "54%",
    height: 2.4,
    borderRadius: 2,
    backgroundColor: PEN,
    transform: [{ rotate: "-1.2deg" }],
  },
  writeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingLeft: 78,
    paddingRight: 20,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  writeInput: { flex: 1, fontFamily: HAND, fontSize: 20, color: INK, paddingVertical: 8 },
  hint: { marginLeft: 78, marginRight: 20, marginTop: 14, fontSize: 12, lineHeight: 18, color: theme.colors.text.muted },
});
