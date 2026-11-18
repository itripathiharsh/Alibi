import React, { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, UserPlus } from "lucide-react-native";
import { signupMobile } from "../lib/auth";
import theme from "../lib/theme";

export default function SignupScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 6) { setError("Use a password with at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setSaving(true);
    const result = await signupMobile(email, password, displayName);
    setSaving(false);
    if (result.success) router.replace("/(tabs)");
    else setError(result.error || "Could not create the account.");
  };

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.backButton} onPress={() => router.replace("/login")} accessibilityRole="button" accessibilityLabel="Back to sign in"><ArrowLeft size={19} color={theme.colors.text.primary} /></Pressable>
      <View style={styles.brand}><Image source={require("../../assets/logo_dark.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="ALIBI" /><Text style={styles.title}>Create your ALIBI account</Text><Text style={styles.subtitle}>Your workspace and records are private to your account.</Text></View>
      {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
      <View style={styles.form}>
        <Text style={styles.formTitle}>Your private account</Text>
        <Text style={styles.formHint}>Use this account on your devices to access the same private workspace.</Text>
        <Text style={styles.label}>Display name</Text><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={theme.colors.text.muted} style={styles.input} autoCapitalize="words" />
        <Text style={styles.label}>Email address</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={theme.colors.text.muted} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.label}>Password</Text><TextInput value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={theme.colors.text.muted} style={styles.input} secureTextEntry autoCapitalize="none" />
        <Text style={styles.label}>Confirm password</Text><TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter password again" placeholderTextColor={theme.colors.text.muted} style={styles.input} secureTextEntry autoCapitalize="none" />
        <Pressable onPress={submit} disabled={saving || !email.trim() || !password || !confirmPassword} style={[styles.primaryButton, (saving || !email.trim() || !password || !confirmPassword) && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><UserPlus size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Create account</Text></>}</Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.base },
  scroll: { flexGrow: 1, padding: 22, paddingTop: 18, paddingBottom: 30, justifyContent: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border.subtle, marginBottom: 14 },
  brand: { alignItems: "center", marginBottom: 22 }, logo: { width: 180, height: 52 }, title: { color: theme.colors.text.primary, fontSize: 25, lineHeight: 31, textAlign: "center", fontWeight: "800", marginTop: 14 }, subtitle: { color: theme.colors.text.secondary, fontSize: 14, textAlign: "center", marginTop: 6 },
  form: { padding: 18, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 10 }, formTitle: { color: theme.colors.text.primary, fontSize: 18, fontWeight: "800" }, formHint: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 4 }, label: { color: theme.colors.text.primary, fontSize: 12, fontWeight: "700", marginTop: 3 }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.border.subtle, backgroundColor: "#FFFFFF", color: theme.colors.text.primary, fontSize: 14 },
  primaryButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, backgroundColor: "#102E42", borderRadius: 15 }, primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" }, disabled: { opacity: .5 },
  notice: { padding: 20, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: theme.colors.border.subtle, gap: 10 }, noticeTitle: { color: theme.colors.text.primary, fontSize: 17, fontWeight: "800" }, noticeText: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19 }, secondaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border.subtle, marginTop: 5 }, secondaryText: { color: theme.colors.text.primary, fontWeight: "700" },
  errorBox: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#F4B0A9", borderRadius: 13, padding: 12, marginBottom: 14 }, errorText: { color: "#B42318", fontSize: 13, lineHeight: 18 },
});
