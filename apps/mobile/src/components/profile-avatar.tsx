import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getUserProfile } from "../lib/auth";
import theme from "../lib/theme";

/**
 * The initial circle in every tab header. Profile left the tab bar (owner request
 * 2026-11-22), so this circle is the way to reach it from anywhere.
 */
export function ProfileAvatar() {
  const router = useRouter();
  const [initial, setInitial] = useState("A");

  useFocusEffect(useCallback(() => {
    let active = true;
    void getUserProfile().then((profile) => {
      if (!active) return;
      const source = profile?.display_name?.trim() || profile?.email?.trim() || "";
      setInitial(source && profile?.id !== "local_user" ? source.charAt(0).toUpperCase() : "A");
    }).catch(() => undefined);
    return () => { active = false; };
  }, []));

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/profile")}
      style={({ pressed }) => [styles.circle, pressed && { opacity: 0.7 }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open your profile"
    >
      <Text style={styles.text}>{initial}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  text: { color: theme.colors.accent.amber, fontSize: 15, fontWeight: "800" },
});
