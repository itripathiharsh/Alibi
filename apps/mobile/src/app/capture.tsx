import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BookOpen, CheckSquare, ListChecks, Mic, Save, Square } from "lucide-react-native";
import { BrandHeader } from "../components/brand-ui";
import BrainDumpReview from "../components/brain-dump-review";
import { saveBrainDumpItems, setCloudAiOptIn, splitBrainDump, type BrainDumpResult, type ReviewedItem } from "../lib/brain-dump";
import { ensureAuthenticated, getUserProfile } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { createTaskOffline, saveLocalNote } from "../lib/offline-sync";
import { startSpeechRecognition, stopSpeechRecognition } from "../lib/speech";
import { triggerHaptic } from "../lib/focus-session-notification";
import theme from "../lib/theme";

export default function QuickCaptureScreen() {
  const router = useRouter();
  const { mode, voice, prefill } = useLocalSearchParams<{ mode?: "task" | "idea" | "voice" | "dump"; voice?: string; prefill?: string }>();
  const [captureType, setCaptureType] = useState<"task" | "dump" | "idea">(
    mode === "idea" ? "idea" : mode === "dump" ? "dump" : "task",
  );
  const [dumpResult, setDumpResult] = useState<BrainDumpResult | null>(null);
  const [enablingAi, setEnablingAi] = useState(false);
  const [text, setText] = useState(typeof prefill === "string" ? prefill : "");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceStarted = useRef(false);
  // Text that was already in the box when this listening session began. Android sends the
  // whole sentence again with every update ("hello", "hello nahin", …), so each update must
  // replace the spoken part, not be added to it (that caused repeated words).
  const voiceBase = useRef("");

  const startVoice = async () => {
    setVoiceError(null);
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
    if ((voice === "1" || mode === "voice") && !voiceStarted.current) {
      voiceStarted.current = true;
      const timer = setTimeout(() => { void startVoice(); }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [voice, mode]);

  useEffect(() => () => { void stopSpeechRecognition(); }, []);

  const handleSave = async () => {
    const raw = text.trim();
    if (!raw || saving) return;
    setSaving(true);
    triggerHaptic("complete");

    if (captureType === "idea") {
      await saveIdea(raw);
    } else if (captureType === "dump") {
      await sortDump(raw);
    } else {
      await saveTask(raw);
    }
    setSaving(false);
  };

  const sortDump = async (content: string) => {
    try {
      setDumpResult(await splitBrainDump(content));
    } catch (error) {
      Alert.alert("Could not sort your list", error instanceof Error ? error.message : "Try again.");
    }
  };

  const enableSmartSorting = async () => {
    setEnablingAi(true);
    try {
      await setCloudAiOptIn(true);
      setDumpResult(await splitBrainDump(text.trim()));
    } catch (error) {
      Alert.alert("Smart sorting", error instanceof Error ? error.message : "Try again.");
    } finally {
      setEnablingAi(false);
    }
  };

  const saveDumpItems = async (items: ReviewedItem[]) => {
    if (!dumpResult) return;
    setSaving(true);
    try {
      const saved = await saveBrainDumpItems(items, { proposed: dumpResult.items.length, mode: dumpResult.mode });
      triggerHaptic("complete");
      Alert.alert("Added", `${saved} ${saved === 1 ? "task" : "tasks"} added to your list.`);
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Could not save tasks", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveIdea = async (content: string) => {
    try {
      const profile = await getUserProfile().catch(() => null);
      const userId = profile?.id ?? "local_user";
      const lines = content.split("\n");
      const title = lines[0].trim();
      const body = lines.length > 1 ? lines.slice(1).join("\n").trim() : title;
      const today = new Date();
      const occurredOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const notePayload = {
        title: title || "Captured Idea",
        body: body || content,
        source_type: listening ? "voice" : "manual",
        privacy_class: "personal",
        occurred_on: occurredOn,
      };

      // 1. Local SQLite save guarantee (offline-first)
      await saveLocalNote(userId, notePayload);

      // 2. Best-effort online push if authenticated
      const token = await ensureAuthenticated().catch(() => null);
      if (token) {
        try {
          await fetch(`${getServerUrl()}/api/v1/vault/notes`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(notePayload),
          });
        } catch {
          // Sync outbox / local note handles offline
        }
      }

      Alert.alert(
        "Idea Captured",
        "Saved to your personal Knowledge Vault. You can convert it into an actionable task anytime from the Vault."
      );
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Could not save idea", error instanceof Error ? error.message : "Try again.");
    }
  };

  const saveTask = async (title: string) => {
    try {
      const profile = await getUserProfile().catch(() => null);
      let savedOnline = false;

      // 1. Try online first if authenticated
      const token = await ensureAuthenticated().catch(() => null);
      if (token) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(`${getServerUrl()}/api/v1/tasks/capture`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw_input: title, origin: listening ? "voice" : "manual", status: "pending" }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            savedOnline = true;
          }
        } catch {
          // Fall back to offline
        }
      }

      // 2. If online save succeeded, navigate back
      if (savedOnline) {
        router.replace("/(tabs)");
        return;
      }

      // 3. Local-first offline save guarantee (never drop user tasks)
      const userId = profile?.id ?? "local_user";
      await createTaskOffline(userId, {
        title,
        status: "pending",
        origin: listening ? "voice" : "manual",
      });
      Alert.alert("Saved on this device", "This task is saved locally and will sync when ALIBI is online.");
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Could not save task", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BrandHeader right={<Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Close quick capture"><ArrowLeft size={19} color={theme.colors.text.primary} /></Pressable>} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.segmentContainer}>
          <Pressable
            onPress={() => setCaptureType("task")}
            style={[styles.segmentButton, captureType === "task" && styles.segmentButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Capture task"
          >
            <CheckSquare size={16} color={captureType === "task" ? "#FFFFFF" : theme.colors.text.secondary} />
            <Text style={[styles.segmentLabel, captureType === "task" && styles.segmentLabelActive]}>Task</Text>
          </Pressable>
          <Pressable
            onPress={() => { setCaptureType("dump"); setDumpResult(null); }}
            style={[styles.segmentButton, captureType === "dump" && styles.segmentButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Brain dump: add many tasks at once"
          >
            <ListChecks size={16} color={captureType === "dump" ? "#FFFFFF" : theme.colors.text.secondary} />
            <Text style={[styles.segmentLabel, captureType === "dump" && styles.segmentLabelActive]}>Brain dump</Text>
          </Pressable>
          <Pressable
            onPress={() => setCaptureType("idea")}
            style={[styles.segmentButton, captureType === "idea" && styles.segmentButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Capture idea note"
          >
            <BookOpen size={16} color={captureType === "idea" ? "#FFFFFF" : theme.colors.text.secondary} />
            <Text style={[styles.segmentLabel, captureType === "idea" && styles.segmentLabelActive]}>Note</Text>
          </Pressable>
        </View>

        {captureType === "dump" && dumpResult ? (
          <BrainDumpReview
            result={dumpResult}
            saving={saving}
            onSave={(items) => { void saveDumpItems(items); }}
            onBack={() => setDumpResult(null)}
            onEnableAi={() => { void enableSmartSorting(); }}
            enablingAi={enablingAi}
          />
        ) : (
        <>
        <Text style={styles.eyebrow}>{captureType === "task" ? "QUICK TASK CAPTURE" : captureType === "dump" ? "BRAIN DUMP" : "QUICK IDEA CAPTURE"}</Text>
        <Text style={styles.title}>{captureType === "task" ? "Get it out of your head." : captureType === "dump" ? "Empty your head." : "Capture the thought."}</Text>
        <Text style={styles.subtitle}>
          {captureType === "task"
            ? "A short phrase is enough. You can add deadlines or tags later."
            : captureType === "dump"
              ? "Type or say everything on your mind, in any language. ALIBI splits it into tasks and sorts them by day. You review before anything is saved."
              : "Save notes, raw thoughts and ideas directly to your private Vault."}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={captureType === "task" ? "What do you need to do?" : captureType === "dump" ? "mandir jana hai shaam ko, sabzi lena, assignment kal tak dena hai…" : "Write or dictate your idea..."}
          placeholderTextColor={theme.colors.text.muted}
          style={styles.input}
          multiline
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Content to capture"
        />
        {voiceError ? <Text style={styles.error}>{voiceError}</Text> : null}
        <Pressable
          onPress={() => { if (listening) { void stopSpeechRecognition(); setListening(false); } else { void startVoice(); } }}
          style={[styles.voiceButton, listening && styles.voiceActive]}
          accessibilityRole="button"
          accessibilityLabel={listening ? "Stop voice capture" : "Start voice capture"}
        >
          {listening ? <Square size={17} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={18} color={theme.colors.accent.amber} />}
          <Text style={[styles.voiceLabel, listening && styles.voiceLabelActive]}>{listening ? "Listening · tap to finish" : "Dictate in real time"}</Text>
        </Pressable>
        <Pressable
          onPress={() => { void handleSave(); }}
          disabled={!text.trim() || saving || listening}
          style={[styles.saveButton, (!text.trim() || saving || listening) && styles.disabled]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Save size={18} color="#FFFFFF" />}
          <Text style={styles.saveLabel}>
            {saving
              ? captureType === "dump" ? "Sorting…" : "Saving…"
              : captureType === "task"
                ? "Save Task"
                : captureType === "dump"
                  ? "Sort into tasks"
                  : "Save to Vault"}
          </Text>
        </Pressable>
        <Text style={styles.privateHint}>
          {captureType === "task"
            ? "Captured to your private ALIBI task list."
            : captureType === "dump"
              ? "Needs internet. Nothing is saved until you tap Add."
              : "Saved locally in SQLite. Convert to a task anytime in Vault."}
        </Text>
        </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  back: { width: 44, height: 44, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 13 },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F3F5",
    borderRadius: theme.radius.control,
    padding: 3,
    minHeight: 46,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 6,
    paddingVertical: 9,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.brand.navy,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.secondary,
  },
  segmentLabelActive: {
    color: "#FFFFFF",
  },
  eyebrow: { color: theme.colors.accent.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: theme.colors.text.primary, fontSize: 27, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19 },
  input: {
    minHeight: 150,
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
  voiceButton: {
    minHeight: 48,
    borderRadius: theme.radius.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#F4C7A8",
    backgroundColor: "#FFF7F1",
  },
  voiceActive: { backgroundColor: theme.colors.brand.navy, borderColor: theme.colors.brand.navy },
  voiceLabel: { color: "#B84E0B", fontSize: 14, fontWeight: "700" },
  voiceLabelActive: { color: "#FFFFFF" },
  saveButton: {
    minHeight: 50,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.accent.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  disabled: { opacity: 0.52 },
  saveLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  privateHint: { textAlign: "center", color: theme.colors.text.muted, fontSize: 12, marginTop: 2 },
});

