import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Check, CheckCircle2, CloudOff, Info, Square, CheckSquare, X } from "lucide-react-native";
import { loginMobile, saveUserProfile, setCachedIsOffline } from "../lib/auth";
import theme from "../lib/theme";

const SKIP_OFFLINE_INTRO_KEY = "alibi_skip_offline_intro_v1";

export default function MobileLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offlineModalVisible, setOfflineModalVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const proceedOffline = async () => {
    if (dontShowAgain) {
      try {
        await SecureStore.setItemAsync(SKIP_OFFLINE_INTRO_KEY, "true");
      } catch {
        // Storage fail should not block offline usage
      }
    }
    setCachedIsOffline(true);
    await saveUserProfile({
      id: "local_user",
      email: "local@device.user",
      display_name: "Local User",
      timezone: "Asia/Kolkata",
    });
    setOfflineModalVisible(false);
    router.replace("/(tabs)");
  };

  const handleOfflineMode = async () => {
    try {
      const skip = await SecureStore.getItemAsync(SKIP_OFFLINE_INTRO_KEY);
      if (skip === "true") {
        await proceedOffline();
        return;
      }
    } catch {
      // Fall through to show modal
    }
    setOfflineModalVisible(true);
  };

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    const result = await loginMobile(email, password);
    setIsSubmitting(false);

    if (result.success) {
      router.replace("/(tabs)");
    } else {
      setErrorMessage(result.error || "Login failed.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Image
            source={require("../../assets/logo_dark.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.title}>Sign in to ALIBI</Text>
          <Text style={styles.subtitle}>Your tasks and notes stay with your account.</Text>
        </View>

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Credentials Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Credentials</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>Sign In</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/signup")} style={styles.signupLink} accessibilityRole="button"><Text style={styles.signupText}>Create your ALIBI account</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleOfflineMode} style={styles.offlineLink} accessibilityRole="button"><Text style={styles.offlineText}>Continue in offline mode</Text></TouchableOpacity>
        </View>
      </ScrollView>

      {/* Offline Mode Introduction Modal */}
      <Modal
        visible={offlineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOfflineModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalBadge}>
                <CloudOff size={22} color="#C65B17" />
              </View>
              <Text style={styles.modalTitle}>Welcome to ALIBI Offline Mode</Text>
              <Text style={styles.modalSubtitle}>
                ALIBI operates as a local-first productivity tool on this device without requiring an active internet connection.
              </Text>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionHeading}>AVAILABLE OFFLINE</Text>
              
              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Tasks & Planning</Text>
                  <Text style={styles.featureDescription}>
                    Create, edit, schedule, and complete tasks with full local SQLite persistence.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Voice Capture & Dictation</Text>
                  <Text style={styles.featureDescription}>
                    Capture tasks and notes using on-device speech recognition where supported.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Focus & Timer Controls</Text>
                  <Text style={styles.featureDescription}>
                    Run deep work sessions and track focused time locally on this device.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Knowledge Vault</Text>
                  <Text style={styles.featureDescription}>
                    Write, view, search, and store notes locally on your device.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Calendar & Deadlines</Text>
                  <Text style={styles.featureDescription}>
                    View task deadlines and schedule local events for your week.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <CheckCircle2 size={16} color="#16A34A" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Insights & Analytics</Text>
                  <Text style={styles.featureDescription}>
                    View real metrics measured strictly from your locally recorded work.
                  </Text>
                </View>
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 14 }]}>REQUIRES LOGIN & CLOUD</Text>

              <View style={styles.featureItem}>
                <Info size={16} color="#C65B17" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Cloud Sync & Multi-Device Backup</Text>
                  <Text style={styles.featureDescription}>
                    Syncing across web and mobile requires an authenticated account. Local changes will sync when you log in.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Info size={16} color="#C65B17" style={styles.featureIcon} />
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>Ask ALIBI Grounded Assistant</Text>
                  <Text style={styles.featureDescription}>
                    Cloud AI model inference requires an active connection and server credentials.
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Checkbox: Don't show again */}
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setDontShowAgain(!dontShowAgain)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowAgain }}
            >
              {dontShowAgain ? (
                <CheckSquare size={18} color="#C65B17" />
              ) : (
                <Square size={18} color={theme.colors.text.muted} />
              )}
              <Text style={styles.checkboxLabel}>Don't show this introduction again</Text>
            </Pressable>

            {/* Action buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.continueOfflineButton}
                onPress={proceedOffline}
                accessibilityRole="button"
                accessibilityLabel="Continue to ALIBI in offline mode"
              >
                <Text style={styles.continueOfflineText}>Continue Offline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setOfflineModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Return to sign in screen"
              >
                <Text style={styles.modalCancelText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 38, 57, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    shadowColor: "#0B2639",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  modalBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF1E6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(244, 123, 37, 0.25)",
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.colors.text.primary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
  },
  modalScroll: {
    maxHeight: 290,
    marginVertical: 10,
    paddingRight: 4,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.colors.text.muted,
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  featureDescription: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    lineHeight: 16,
    marginTop: 1,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  checkboxLabel: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    fontWeight: "500",
  },
  modalActions: {
    marginTop: 6,
    gap: 8,
  },
  continueOfflineButton: {
    backgroundColor: "#F47B25",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  continueOfflineText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalCancelButton: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  modalCancelText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  scroll: {
    padding: 20,
    justifyContent: "center",
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoImage: {
    width: 220,
    height: 56,
    marginBottom: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: theme.colors.text.primary,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: "#FFF1F0",
    borderWidth: 1,
    borderColor: "#F4B0A9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#B42318",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: "#102E42",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  signupLink: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 6 },
  signupText: { color: theme.colors.accent.amber, fontSize: 14, fontWeight: "700" },
  offlineLink: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  offlineText: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: "600" },
});

