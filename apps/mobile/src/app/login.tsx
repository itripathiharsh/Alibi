import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { loginMobile } from "../lib/auth";
import theme from "../lib/theme";

export default function MobileLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
});

