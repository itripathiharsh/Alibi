import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Mic, Save, Square } from "lucide-react-native";
import { BrandHeader } from "../components/brand-ui";
import { ensureAuthenticated, getUserProfile } from "../lib/auth";
import { getServerUrl } from "../lib/config";
import { createTaskOffline } from "../lib/offline-sync";
import { startSpeechRecognition, stopSpeechRecognition } from "../lib/speech";
import { triggerHaptic } from "../lib/focus-session-notification";
import theme from "../lib/theme";

export default function QuickCaptureScreen() {
  const router = useRouter();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceStarted = useRef(false);

  const startVoice = async () => {
    setVoiceError(null);
    const started = await startSpeechRecognition({
      onStart: () => setListening(true),
      onResults: (transcript) => setText((current) => `${current.trim()}${current.trim() ? " " : ""}${transcript}`),
      onError: (message) => { setVoiceError(message); setListening(false); },
      onEnd: () => setListening(false),
    });
    if (!started) setListening(false);
  };

  useEffect(() => {
    if (voice === "1" && !voiceStarted.current) {
      voiceStarted.current = true;
      const timer = setTimeout(() => { void startVoice(); }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [voice]);

  useEffect(() => () => { void stopSpeechRecognition(); }, []);

  const saveTask = async () => {
    const title = text.trim();
    if (!title || saving) return;
    setSaving(true);
    triggerHaptic("complete");
    try {
      const token = await ensureAuthenticated();
      if (!token) throw new Error("Sign in to save a task.");
      const response = await fetch(`${getServerUrl()}/api/v1/tasks/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: title, origin: listening ? "voice" : "manual", status: "pending" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(data.detail ?? "Task could not be saved.");
      }
      router.replace("/(tabs)");
    } catch (error) {
      if (error instanceof TypeError) {
        const profile = await getUserProfile();
        if (profile) {
          await createTaskOffline(profile.id, { title, status: "pending", origin: listening ? "voice" : "manual" });
          Alert.alert("Saved on this device", "This task will sync when ALIBI is back online.");
          router.replace("/(tabs)");
          return;
        }
      }
      Alert.alert("Could not save task", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BrandHeader right={<Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Close quick capture"><ArrowLeft size={19} color={theme.colors.text.primary} /></Pressable>} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>QUICK CAPTURE</Text>
        <Text style={styles.title}>Get it out of your head.</Text>
        <Text style={styles.subtitle}>A short phrase is enough. You can add details later.</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What do you need to do?"
          placeholderTextColor={theme.colors.text.muted}
          style={styles.input}
          multiline
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Task to capture"
        />
        {voiceError ? <Text style={styles.error}>{voiceError}</Text> : null}
        <Pressable onPress={() => { if (listening) { void stopSpeechRecognition(); setListening(false); } else { void startVoice(); } }} style={[styles.voiceButton, listening && styles.voiceActive]} accessibilityRole="button" accessibilityLabel={listening ? "Stop voice capture" : "Start voice capture"}>
          {listening ? <Square size={17} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={18} color={theme.colors.accent.amber} />}
          <Text style={[styles.voiceLabel, listening && styles.voiceLabelActive]}>{listening ? "Listening · tap to finish" : "Dictate instead"}</Text>
        </Pressable>
        <Pressable onPress={() => { void saveTask(); }} disabled={!text.trim() || saving || listening} style={[styles.saveButton, (!text.trim() || saving || listening) && styles.disabled]} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Save size={18} color="#FFFFFF" />}
          <Text style={styles.saveLabel}>{saving ? "Saving task…" : "Save task"}</Text>
        </Pressable>
        <Text style={styles.privateHint}>Captured to your private ALIBI task list.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: 22, paddingTop: 32, gap: 15 },
  eyebrow: { color: theme.colors.accent.amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: theme.colors.text.primary, fontSize: 29, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 170, maxHeight: 260, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", color: theme.colors.text.primary, textAlignVertical: "top", fontSize: 17, lineHeight: 24 },
  error: { color: "#B42318", fontSize: 12 },
  voiceButton: { minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, borderColor: "#F4C7A8", backgroundColor: "#FFF7F1" },
  voiceActive: { backgroundColor: "#102E42", borderColor: "#102E42" },
  voiceLabel: { color: "#B84E0B", fontSize: 14, fontWeight: "700" },
  voiceLabelActive: { color: "#FFFFFF" },
  saveButton: { minHeight: 54, borderRadius: 17, backgroundColor: "#F97316", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  disabled: { opacity: 0.52 },
  saveLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  privateHint: { textAlign: "center", color: theme.colors.text.muted, fontSize: 12, marginTop: 2 },
});
