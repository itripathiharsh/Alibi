import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";
import { User, Shield } from "lucide-react-native";
import theme from "../lib/theme";
import { autoDetectServer } from "../lib/config";
import { ensureAuthenticated } from "../lib/auth";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Proactively connect to backend and ensure authenticated session
    autoDetectServer().then(() => {
      ensureAuthenticated();
    });
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor={theme.colors.background.base} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background.base,
          },
          headerTintColor: theme.colors.text.primary,
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 18,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: theme.colors.background.base,
          },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerTitle: () => (
              <View style={styles.brandContainer}>
                <Image
                  source={require("../../assets/icon_mark.png")}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
                <Text style={styles.brandTitle}>ALIBI</Text>
                <View style={styles.versionBadge}>
                  <Text style={styles.versionText}>M0</Text>
                </View>
              </View>
            ),
            headerRight: () => (
              <Pressable
                onPress={() => router.push("/settings" as const)}
                style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.7 }]}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Open settings and server configuration"
              >
                <User size={20} color={theme.colors.accent.amber} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: "modal",
            headerTitle: "Settings & Connectivity",
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            presentation: "modal",
            headerTitle: "Sign In",
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLogo: {
    width: 24,
    height: 24,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  versionBadge: {
    backgroundColor: theme.colors.surface.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  versionText: {
    color: theme.colors.accent.amber,
    fontSize: 10,
    fontWeight: "700",
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface.card,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
});

