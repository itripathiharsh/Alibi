/**
 * The Add screen: the one place to add tasks and notes (ADR-034).
 *
 * The Tasks button, the Insights shortcuts, the Today mic and a "several tasks" line from
 * Today all open this screen; the Today write line and the widget use the same save path
 * (lib/task-intake.ts). One task is saved at once. Several tasks go to the review list
 * first, because a split is a proposal until the user accepts it.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BookOpen, CalendarClock, Check, CheckSquare, Mic, Square } from "lucide-react-native";
import { BrandHeader } from "../components/brand-ui";
import BrainDumpReview from "../components/brain-dump-review";
import { DateChooser, FieldLabel, Sheet, TimeChooser } from "../components/time-pickers";
import { setCloudAiOptIn, splitBrainDump, type BrainDumpResult, type ReviewedItem } from "../lib/brain-dump";
import { ensureAuthenticated } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { looksLikeManyTasks } from "../lib/diary-page";
import { currentUserId } from "../lib/learning-signals";
import { loadLearnedTaskRoutines, type LearnedTaskRoutine } from "../lib/learned-routines";
import { saveLocalNote } from "../lib/offline-sync";
import { predictTaskDuration } from "../lib/personal-learning-engine";
import { startSpeechRecognition, stopSpeechRecognition } from "../lib/speech";
import { addReviewedTasks, addTaskFromText, requestSync, splitForReview } from "../lib/task-intake";
import { formatMinutes, formatShortDay, formatClock } from "../lib/time-format";
import { triggerHaptic } from "../lib/focus-session-notification";
import theme from "../lib/theme";

const ESTIMATES = [15, 30, 60, 120];

function toast(message: string): void {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
}

export default function AddScreen() {
  const router = useRouter();
  const { mode, voice, prefill } = useLocalSearchParams<{ mode?: string; voice?: string; prefill?: string }>();
  const [kind, setKind] = useState<"task" | "note">(mode === "idea" || mode === "note" ? "note" : "task");
  const [text, setText] = useState(typeof prefill === "string" ? prefill : "");
  const [review, setReview] = useState<BrainDumpResult | null>(null);
  const [busy, setBusy] = useState<"saving" | "sorting" | null>(null);
  const [enablingAi, setEnablingAi] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const usedVoice = useRef(false);
  // Text already in the box when listening began. Android repeats the whole sentence with
  // every update, so each update replaces the spoken part instead of adding to it (KI-041).
  const voiceBase = useRef("");

  // Optional details for a single task. What the user picks beats what is read from text.
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [dueMinutes, setDueMinutes] = useState(18 * 60);
  const [whenOpen, setWhenOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [draftMinutes, setDraftMinutes] = useState(18 * 60);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [routines, setRoutines] = useState<LearnedTaskRoutine[]>([]);

  const many = looksLikeManyTasks(text);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const startVoice = async () => {
    setVoiceError(null);
    usedVoice.current = true;
    setText((current) => { voiceBase.current = current.trim(); return current; });
    const started = await startSpeechRecognition({
      onStart: () => setListening(true),
      onResults: (transcript) => {
        const base = voiceBase.current;
        setText(`${base}${base && transcript ? " " : ""}${transcript}`);
      },
      onError: (message) => { setVoiceError(message); setListening(false); },
      onEnd: () => setListening(false),
    });
    if (!started) setListening(false);
  };

  useEffect(() => {
    if (voice === "1" || mode === "voice") {
      const timer = setTimeout(() => { void startVoice(); }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { void stopSpeechRecognition(); }, []);

  // Opened with several tasks already written (Today's write line, the widget's review
  // notification): go straight to the review list.
  useEffect(() => {
    if (typeof prefill === "string" && prefill.trim() && (mode === "dump" || looksLikeManyTasks(prefill))) {
      void sortForReview(prefill.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Routines learned from the user's own history, offered as one-tap titles.
  useEffect(() => {
    void (async () => {
      const token = await ensureAuthenticated().catch(() => null);
      if (token) setRoutines((await loadLearnedTaskRoutines(getServerUrl(), token)).slice(0, 4));
    })();
  }, []);

  // How long similar tasks took this user, from the server's records. Shown only once
  // the learning engine has data (maturity above 0); never a guess.
  useEffect(() => {
    const title = text.trim();
    if (kind !== "task" || many || title.length < 3) {
      setSuggested(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const token = await ensureAuthenticated().catch(() => null);
        if (!token) return;
        const prediction = await predictTaskDuration(getServerUrl(), token, title).catch(() => null);
        setSuggested(prediction && prediction.maturity_level > 0 && prediction.p50_min > 0 ? Math.round(prediction.p50_min) : null);
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [text, kind, many]);

  const sortForReview = async (content: string) => {
    setBusy("sorting");
    try {
      setReview(await splitForReview(content));
    } finally {
      setBusy(null);
    }
  };

  const enableSmartSorting = async () => {
    setEnablingAi(true);
    try {
      await setCloudAiOptIn(true);
      setReview(await splitBrainDump(text.trim()));
    } catch (error) {
      Alert.alert("Smart sorting", error instanceof Error ? error.message : "Try again.");
    } finally {
      setEnablingAi(false);
    }
  };

  const pickedDeadline = (): string | null => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    due.setHours(Math.floor(dueMinutes / 60), dueMinutes % 60, 0, 0);
    return due.toISOString();
  };

  const saveTask = async () => {
    const content = text.trim();
    if (!content || busy) return;
    if (listening) { await stopSpeechRecognition(); setListening(false); }
    if (many) {
      await sortForReview(content);
      return;
    }
    setBusy("saving");
    try {
      const outcome = await addTaskFromText(content, {
        deadlineAt: pickedDeadline(),
        estimateMin: estimate,
        done,
        origin: usedVoice.current ? "voice" : "manual",
      });
      if (outcome.kind === "review") {
        setReview(outcome.result ?? await splitForReview(content));
        return;
      }
      triggerHaptic("complete");
      const due = outcome.task.deadline_at ? ` · ${formatShortDay(new Date(outcome.task.deadline_at))} ${formatClock(outcome.task.deadline_at)}` : "";
      toast(`Added: ${outcome.task.title}${due}`);
      close();
    } catch (error) {
      Alert.alert("Could not add the task", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const saveReviewed = async (items: ReviewedItem[]) => {
    if (!review) return;
    setBusy("saving");
    try {
      const saved = await addReviewedTasks(items, {
        proposed: review.items.length,
        mode: review.mode,
        origin: usedVoice.current || voice === "1" ? "voice" : "manual",
      });
      triggerHaptic("complete");
      toast(`${saved} ${saved === 1 ? "task" : "tasks"} added`);
      close();
    } catch (error) {
      Alert.alert("Could not add the tasks", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    const content = text.trim();
    if (!content || busy) return;
    if (listening) { await stopSpeechRecognition(); setListening(false); }
    setBusy("saving");
    try {
      const [first, ...rest] = content.split("\n");
      const today = new Date();
      const occurredOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // Saved on the phone; the outbox uploads it. A second, direct upload here used to
      // create the same note twice on the server (logic audit).
      await saveLocalNote(await currentUserId(), {
        title: first.trim() || "Note",
        body: rest.join("\n").trim() || first.trim(),
        source_type: usedVoice.current ? "voice" : "manual",
        privacy_class: "personal",
        occurred_on: occurredOn,
      });
      requestSync();
      triggerHaptic("complete");
      toast("Note saved to your Vault");
      close();
    } catch (error) {
      Alert.alert("Could not save the note", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const whenLabel = dueDate ? `${formatShortDay(dueDate)}, ${formatClock(new Date(dueDate).setHours(Math.floor(dueMinutes / 60), dueMinutes % 60, 0, 0))}` : "No date";
  const canSave = Boolean(text.trim()) && !busy;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BrandHeader right={<Pressable onPress={close} style={styles.back} accessibilityRole="button" accessibilityLabel="Close"><ArrowLeft size={19} color={theme.colors.text.primary} /></Pressable>} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {review ? (
          <BrainDumpReview
            result={review}
            saving={busy === "saving"}
            onSave={(items) => { void saveReviewed(items); }}
            onBack={() => setReview(null)}
            onEnableAi={() => { void enableSmartSorting(); }}
            enablingAi={enablingAi}
          />
        ) : (
          <>
            <View style={styles.segments}>
              <Segment label="Task" icon={<CheckSquare size={16} color={kind === "task" ? "#FFFFFF" : theme.colors.text.secondary} />} active={kind === "task"} onPress={() => setKind("task")} />
              <Segment label="Note" icon={<BookOpen size={16} color={kind === "note" ? "#FFFFFF" : theme.colors.text.secondary} />} active={kind === "note"} onPress={() => setKind("note")} />
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={kind === "task" ? "What needs doing? One per line for several" : "Write or say your note"}
              placeholderTextColor={theme.colors.text.muted}
              style={styles.input}
              multiline
              autoFocus={voice !== "1"}
              accessibilityLabel={kind === "task" ? "Task" : "Note"}
            />
            {voiceError ? <Text style={styles.error}>{voiceError}</Text> : null}
            <Pressable
              onPress={() => { if (listening) { void stopSpeechRecognition(); setListening(false); } else { void startVoice(); } }}
              style={[styles.voiceButton, listening && styles.voiceActive]}
              accessibilityRole="button"
              accessibilityLabel={listening ? "Stop listening" : "Speak"}
            >
              {listening ? <Square size={17} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={18} color={theme.colors.accent.amber} />}
              <Text style={[styles.voiceLabel, listening && styles.voiceLabelActive]}>{listening ? "Listening · tap to stop" : "Speak"}</Text>
            </Pressable>

            {kind === "task" && !text.trim() && routines.length ? (
              <View style={styles.chips}>
                {routines.map((routine) => (
                  <Chip key={routine.label} label={routine.label} active={false} onPress={() => setText(routine.label)} />
                ))}
              </View>
            ) : null}

            {kind === "task" && !many ? (
              <View style={styles.details}>
                <Pressable
                  onPress={() => { setDraftDate(dueDate ?? new Date()); setDraftMinutes(dueMinutes); setWhenOpen(true); }}
                  style={styles.whenRow}
                  accessibilityRole="button"
                  accessibilityLabel={`When: ${whenLabel}`}
                >
                  <CalendarClock size={18} color={theme.colors.text.secondary} />
                  <Text style={styles.whenText}>{whenLabel}</Text>
                  {dueDate ? (
                    <Pressable onPress={() => setDueDate(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove the date">
                      <Text style={styles.clear}>Clear</Text>
                    </Pressable>
                  ) : null}
                </Pressable>

                <FieldLabel>How long</FieldLabel>
                <View style={styles.chips}>
                  {ESTIMATES.map((minutes) => (
                    <Chip key={minutes} label={formatMinutes(minutes)} active={estimate === minutes} onPress={() => setEstimate(estimate === minutes ? null : minutes)} />
                  ))}
                  {suggested && !ESTIMATES.includes(suggested) ? (
                    <Chip label={`${formatMinutes(suggested)} · like before`} active={estimate === suggested} onPress={() => setEstimate(estimate === suggested ? null : suggested)} />
                  ) : null}
                </View>

                <Pressable onPress={() => setDone(!done)} style={styles.doneRow} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
                  <View style={[styles.box, done && styles.boxOn]}>{done ? <Check size={14} color="#FFFFFF" /> : null}</View>
                  <Text style={styles.doneText}>Already done</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              onPress={() => { void (kind === "note" ? saveNote() : saveTask()); }}
              disabled={!canSave}
              style={[styles.saveButton, !canSave && styles.disabled]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.saveLabel}>
                {busy === "sorting" ? "Reading your list…" : busy === "saving" ? "Saving…" : kind === "note" ? "Save note" : many ? "Review tasks" : "Add task"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={whenOpen}
        title="When"
        primaryLabel="Set"
        onClose={() => setWhenOpen(false)}
        onPrimary={() => { setDueDate(draftDate); setDueMinutes(draftMinutes); setWhenOpen(false); }}
      >
        <DateChooser value={draftDate} onChange={setDraftDate} allowNone />
        {draftDate ? <TimeChooser minutes={draftMinutes} onChange={setDraftMinutes} /> : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Segment({ label, icon, active, onPress }: { label: string; icon: React.ReactNode; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {icon}
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  back: { width: 44, height: 44, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 13 },
  segments: { flexDirection: "row", backgroundColor: "#F1F3F5", borderRadius: theme.radius.control, padding: 3, minHeight: 46 },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 6, paddingVertical: 9 },
  segmentActive: { backgroundColor: theme.colors.brand.navy },
  segmentLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  segmentLabelActive: { color: "#FFFFFF" },
  input: {
    minHeight: 130,
    maxHeight: 230,
    padding: 15,
    borderRadius: theme.radius.cardSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: "#FFFFFF",
    color: theme.colors.text.primary,
    textAlignVertical: "top",
    fontSize: 16,
    lineHeight: 23,
  },
  error: { color: "#B42318", fontSize: 12 },
  voiceButton: { minHeight: 46, borderRadius: theme.radius.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, borderColor: "#F4C7A8", backgroundColor: "#FFF7F1" },
  voiceActive: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy },
  voiceLabel: { color: "#B84E0B", fontSize: 14, fontWeight: "700" },
  voiceLabelActive: { color: "#FFFFFF" },
  details: { gap: 10 },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF" },
  whenText: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.colors.text.primary },
  clear: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1F3F5", maxWidth: "100%" },
  chipActive: { backgroundColor: theme.colors.brand.navy },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.colors.text.secondary },
  chipTextActive: { color: "#FFFFFF" },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border.subtle, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  boxOn: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy },
  doneText: { fontSize: 15, fontWeight: "600", color: theme.colors.text.primary },
  saveButton: { minHeight: 50, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4 },
  disabled: { opacity: 0.52 },
  saveLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
