import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gift, Sparkles } from "lucide-react-native";
import theme from "../lib/theme";
import { checkForUpdate, installUpdate, snoozeUpdate, type ReleaseInfo } from "../lib/app-update";

/**
 * Pops up "ALIBI x.y is here" whenever the app opens or comes back to the screen and a
 * newer APK is published (ADR-031). "Later" hides that version for a day.
 */
export function UpdatePrompt() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const showing = useRef(false);

  const look = useCallback(() => {
    if (showing.current) return;
    void checkForUpdate().then((found) => {
      if (found && !showing.current) {
        showing.current = true;
        setRelease(found);
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(look, 2500); // let the first screen draw first
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") look(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [look]);

  if (!release) return null;
  return <UpdateDialog release={release} onClose={() => { showing.current = false; setRelease(null); }} />;
}

export function UpdateDialog({ release, onClose }: { release: ReleaseInfo; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await installUpdate(release, setProgress);
      setMessage(outcome === "needs_permission"
        ? "One-time step: allow ALIBI to install apps on the screen that just opened, then tap Download update again."
        : "Almost there. Tap Update on Android's screen to finish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The download didn't finish. Check your connection and try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const later = () => {
    void snoozeUpdate(release);
    onClose();
  };

  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={later} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Gift size={26} color="#FFFFFF" /></View>
            <Text style={styles.kicker}>NEW UPDATE</Text>
            <Text style={styles.title}>ALIBI {release.versionName} is here</Text>
            <Text style={styles.headline}>
              {release.headline ?? "Download it now and check out what's new."}
            </Text>
          </View>

          {release.highlights.length > 0 ? (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.listLabel}>What's new</Text>
              {release.highlights.map((item) => (
                <View key={item.title} style={styles.item}>
                  <View style={styles.itemIcon}><Sparkles size={15} color={theme.colors.accent.amber} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          {busy ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percent ?? 15}%` }]} />
              </View>
              <View style={styles.progressRow}>
                {percent === null ? <ActivityIndicator size="small" color={theme.colors.accent.amber} /> : null}
                <Text style={styles.progressText}>{percent === null ? "Starting download…" : `Downloading… ${percent}%`}</Text>
              </View>
            </View>
          ) : (
            <>
              <Pressable onPress={() => { void update(); }} style={styles.primary} accessibilityRole="button">
                <Text style={styles.primaryText}>Download update</Text>
              </Pressable>
              <Pressable onPress={later} style={styles.later} accessibilityRole="button">
                <Text style={styles.laterText}>Later</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.fine}>Your tasks and notes stay safe on this phone. Android asks you to confirm the install.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,21,34,0.55)", alignItems: "center", justifyContent: "center", padding: 22 },
  card: { width: "100%", maxWidth: 390, backgroundColor: "#FFFFFF", borderRadius: 22, overflow: "hidden", paddingBottom: 18 },
  hero: { backgroundColor: theme.colors.brand.navy, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20, gap: 6 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.accent.primary, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  kicker: { color: "#F6B48A", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  headline: { color: "#D9E1E8", fontSize: 14, lineHeight: 20 },
  list: { maxHeight: 260, paddingHorizontal: 20, marginTop: 16 },
  listLabel: { fontSize: 12, fontWeight: "800", color: theme.colors.text.muted, letterSpacing: 0.6 },
  item: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
  itemIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFF2E8", alignItems: "center", justifyContent: "center", marginTop: 1 },
  itemTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text.primary },
  itemBody: { fontSize: 13, lineHeight: 19, color: theme.colors.text.secondary, marginTop: 1 },
  message: { fontSize: 13, lineHeight: 19, color: "#9A3412", marginHorizontal: 20, marginTop: 12 },
  progressWrap: { marginHorizontal: 20, marginTop: 16, gap: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "#F1ECE7", overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: theme.colors.accent.primary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressText: { fontSize: 13, color: theme.colors.text.secondary, fontWeight: "600" },
  primary: { marginHorizontal: 20, marginTop: 18, minHeight: 50, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  later: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
  laterText: { fontSize: 14, fontWeight: "700", color: theme.colors.text.secondary },
  fine: { fontSize: 11, lineHeight: 16, color: theme.colors.text.muted, marginHorizontal: 20, marginTop: 6, textAlign: "center" },
});
