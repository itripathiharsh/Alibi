import "../polyfills";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";
import { User } from "lucide-react-native";
import theme from "../lib/theme";
import { getAccessToken, getRefreshToken, getUserProfile, setCachedIsOffline } from "../lib/auth";
import FirstLaunchIntro from "../components/first-launch-intro";
import { completeFirstLaunchIntro, shouldShowFirstLaunchIntro } from "../lib/first-launch";
import { registerNotificationHandler, scheduleDailyWittyReminders, scheduleInactivityNudge } from "../lib/notification-witty-engine";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Ensure Expo notifications can play sounds and show heads-up banners across the entire app
registerNotificationHandler();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const firstSegment = segments[0];
  const [launchState, setLaunchState] = useState<"checking" | "intro" | "ready">("checking");
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void shouldShowFirstLaunchIntro().then((showIntro) => {
      if (!cancelled) setLaunchState(showIntro ? "intro" : "ready");
    });
    return () => { cancelled = true; };
  }, []);

  const finishIntro = useCallback(() => {
    void completeFirstLaunchIntro().finally(() => {
      setLaunchState("ready");
    });
  }, []);

  useEffect(() => {
    if (launchState !== "ready") return;
    let cancelled = false;
    const guardRoute = async () => {
      const isAuthRoute = firstSegment === "login" || firstSegment === "signup";
      // Route from local session state immediately. Refresh/auth API calls happen
      // in the screen data loaders so a sleeping hosted backend cannot block the shell.
      const [accessToken, refreshToken, profile] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
        getUserProfile(),
      ]);
      if (cancelled) return;
      const isOffline = profile?.id === "local_user" || (!accessToken && !refreshToken);
      setCachedIsOffline(isOffline);
      const isAuthenticated = Boolean(accessToken || refreshToken || profile);
      if (isAuthenticated) {
        void scheduleDailyWittyReminders();
        void scheduleInactivityNudge();
        if (isAuthRoute && !isNavigatingRef.current) {
          isNavigatingRef.current = true;
          router.replace("/(tabs)");
          setTimeout(() => { isNavigatingRef.current = false; }, 400);
        }
        return;
      }
      if (!isAuthRoute && !isNavigatingRef.current) {
        isNavigatingRef.current = true;
        router.replace("/login");
        setTimeout(() => { isNavigatingRef.current = false; }, 400);
      }
    };
    void guardRoute();
    return () => { cancelled = true; };
  }, [firstSegment, launchState, router]);

  if (launchState === "checking") {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={theme.colors.background.base} />
        <View style={styles.launchCover}>
          <Image
            source={require("../../assets/icon_mark.png")}
            style={styles.launchMark}
            resizeMode="contain"
          />
        </View>
      </SafeAreaProvider>
    );
  }

  if (launchState === "intro") {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={theme.colors.background.base} />
        <View style={styles.root}>
          <FirstLaunchIntro onFinish={finishIntro} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={theme.colors.background.base} />
      <View style={styles.root}>
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
              headerShown: false,
              headerTitle: () => (
                <View style={styles.brandContainer}>
                  <Image
                    source={require("../../assets/icon_mark.png")}
                    style={styles.headerLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.brandTitle}>ALIBI</Text>
                </View>
              ),
              headerRight: () => (
                <Pressable
                  onPress={() => router.push("/(tabs)/profile" as const)}
                  style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.7 }]}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel="Open your ALIBI profile"
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
              headerShown: false,
            }}
          />
          <Stack.Screen name="capture" options={{ presentation: "modal", headerShown: false }} />
          <Stack.Screen name="focus" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="login"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="signup"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background.base },
  launchCover: { ...StyleSheet.absoluteFillObject, zIndex: 100, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background.base },
  launchMark: { width: 62, height: 62 },
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

