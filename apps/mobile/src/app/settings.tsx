import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { AlertCircle, ArrowLeft, Check, LogOut, Server, Wifi } from "lucide-react-native";
import theme from "../lib/theme";
import { getServerUrl, setServerUrl, pingServer, autoDetectServer, type ServerMeta } from "../lib/config";
import { logoutMobile, getUserProfile, type MobileUserProfile } from "../lib/auth";

export default function SettingsScreen() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState(getServerUrl());
  const [testing, setTesting] = useState(false);
  const [userProfile, setUserProfile] = useState<MobileUserProfile | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    data?: ServerMeta;
    error?: string;
  } | null>(null);

  React.useEffect(() => {
    getUserProfile().then(setUserProfile);
  }, []);

  const handleTestAndSave = async () => {
    setTesting(true);
    const cleanedUrl = setServerUrl(urlInput);
    setUrlInput(cleanedUrl);
    const res = await pingServer(cleanedUrl);
    setResult(res);
    setTesting(false);
  };

  const handleAutoDetect = async () => {
    setTesting(true);
    const best = await autoDetectServer();
    setUrlInput(best);
    const res = await pingServer(best);
    setResult(res);
    setTesting(false);
  };

  const applyPreset = (preset: string) => {
    setUrlInput(preset);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Server size={18} color={theme.colors.accent.amber} />
        <Text style={styles.sectionTitle}>Backend Connectivity (AC-M0-2 / AC-UI-6)</Text>
      </View>

      <Text style={styles.instructionText}>
        Configure the ALIBI API backend URL for local emulator or physical Android device over Wi-Fi
        LAN.
      </Text>

      {/* Input box */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Server Base URL</Text>
        <TextInput
          style={styles.textInput}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="http://192.168.1.X:8000"
          placeholderTextColor={theme.colors.text.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      {/* Quick Presets */}
      <View style={styles.presetsContainer}>
        <Text style={styles.presetLabel}>Quick Presets:</Text>
        <View style={styles.presetRow}>
          <Pressable
            style={styles.presetBtn}
            onPress={() => applyPreset("http://127.0.0.1:8000")}
          >
            <Text style={styles.presetBtnText}>Localhost (USB)</Text>
          </Pressable>
          <Pressable
            style={styles.presetBtn}
            onPress={() => applyPreset("http://192.168.1.37:8000")}
          >
            <Text style={styles.presetBtnText}>Wi-Fi LAN</Text>
          </Pressable>
          <Pressable
            style={styles.presetBtn}
            onPress={() => applyPreset("http://10.0.2.2:8000")}
          >
            <Text style={styles.presetBtnText}>Emulator</Text>
          </Pressable>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ gap: 8 }}>
        <Pressable
          style={[styles.saveBtn, testing && styles.saveBtnDisabled]}
          onPress={handleTestAndSave}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color="#090D16" />
          ) : (
            <>
              <Wifi size={16} color="#090D16" />
              <Text style={styles.saveBtnText}>Test & Save Server URL</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.autoDetectBtn, testing && styles.saveBtnDisabled]}
          onPress={handleAutoDetect}
          disabled={testing}
        >
          <Text style={styles.autoDetectBtnText}>Auto-Detect Best Connection</Text>
        </Pressable>
      </View>

      {/* Test Feedback Box */}
      {result && (
        <View
          style={[
            styles.resultCard,
            result.success ? styles.resultCardSuccess : styles.resultCardError,
          ]}
        >
          <View style={styles.resultHeader}>
            {result.success ? (
              <Check size={18} color={theme.colors.accent.emerald} />
            ) : (
              <AlertCircle size={18} color="#EF4444" />
            )}
            <Text
              style={[
                styles.resultTitle,
                result.success ? styles.resultTextSuccess : styles.resultTextError,
              ]}
            >
              {result.success ? "Connection Verified!" : "Connection Failed"}
            </Text>
          </View>

          {result.success && result.data && (
            <View style={styles.resultDetails}>
              <Text style={styles.detailRow}>App: {result.data.appName} v{result.data.version}</Text>
              <Text style={styles.detailRow}>Mode: {result.data.mode}</Text>
              <Text style={styles.detailRow}>Database: {result.data.database}</Text>
              <Text style={styles.detailRow}>Latency: {result.data.responseTimeMs} ms</Text>
            </View>
          )}

          {!result.success && (
            <Text style={styles.errorMessage}>{result.error}</Text>
          )}
        </View>
      )}

      {/* Windows Firewall Hint */}
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>LAN Connection Tip:</Text>
        <Text style={styles.hintText}>
          To connect your physical phone over Wi-Fi, run this in an Administrator terminal on your
          PC:
        </Text>
        <Text style={styles.codeText}>
          netsh advfirewall firewall add rule name="ALIBI API" dir=in action=allow protocol=TCP
          localport=8000
        </Text>
      </View>

      {/* App Info */}
      <View style={styles.appInfoCard}>
        <Text style={styles.appInfoTitle}>ALIBI Mobile Client</Text>
        <Text style={styles.appInfoSubtitle}>
          Milestone M1 Database & Authentication · Expo SDK 58 (ADR-021)
        </Text>
      </View>

      {/* Account / Sign Out */}
      <Pressable
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 12,
          backgroundColor: "#1F2937",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#374151",
        }}
        onPress={async () => {
          await logoutMobile();
          router.replace("/login");
        }}
      >
        <LogOut size={16} color="#F87171" />
        <Text style={{ color: "#F87171", fontSize: 13, fontWeight: "600" }}>Sign Out</Text>
      </Pressable>

      {/* Back Button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <ArrowLeft size={16} color={theme.colors.text.secondary} />
        <Text style={styles.backBtnText}>Return to Dashboard</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  instructionText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    color: theme.colors.text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "monospace",
  },
  presetsContainer: {
    gap: 6,
  },
  presetLabel: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetBtn: {
    backgroundColor: theme.colors.surface.card,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  presetBtnText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: theme.colors.accent.amber,
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#090D16",
    fontSize: 13,
    fontWeight: "700",
  },
  autoDetectBtn: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  autoDetectBtnText: {
    color: theme.colors.accent.amber,
    fontSize: 13,
    fontWeight: "600",
  },
  resultCard: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  resultCardSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  resultCardError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  resultTextSuccess: {
    color: theme.colors.accent.emerald,
  },
  resultTextError: {
    color: "#EF4444",
  },
  resultDetails: {
    gap: 2,
    marginTop: 4,
  },
  detailRow: {
    color: theme.colors.text.primary,
    fontSize: 11,
    fontFamily: "monospace",
  },
  errorMessage: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
  },
  hintCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: 6,
  },
  hintTitle: {
    color: theme.colors.accent.amber,
    fontSize: 12,
    fontWeight: "700",
  },
  hintText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  codeText: {
    backgroundColor: theme.colors.background.base,
    borderRadius: 6,
    padding: 8,
    color: theme.colors.text.primary,
    fontSize: 10,
    fontFamily: "monospace",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  appInfoCard: {
    paddingVertical: 12,
    alignItems: "center",
  },
  appInfoTitle: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  appInfoSubtitle: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    marginTop: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  backBtnText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
});

