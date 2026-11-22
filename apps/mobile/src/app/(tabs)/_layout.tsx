import React from "react";
import { Tabs } from "expo-router";
import { NotebookPen, CheckSquare, Calendar, BarChart3, Layers, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import theme from "../../lib/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFEFD",
          borderTopColor: theme.colors.border.subtle,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 9,
          paddingTop: 7,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
        },
        tabBarActiveTintColor: theme.colors.text.primary,
        tabBarInactiveTintColor: theme.colors.text.secondary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size, focused }) => <TabIcon Icon={NotebookPen} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size, focused }) => <TabIcon Icon={CheckSquare} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size, focused }) => <TabIcon Icon={Calendar} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size, focused }) => <TabIcon Icon={BarChart3} color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen name="vault" options={{ title: "Vault", tabBarIcon: ({ color, size, focused }) => <TabIcon Icon={Layers} color={color} size={size} focused={focused} /> }} />
      {/* Profile is reached from the initial circle in every header (owner request 2026-11-22). */}
      <Tabs.Screen name="profile" options={{ title: "Profile", href: null }} />
      <Tabs.Screen name="ai" options={{ title: "Assistant", href: null }} />
    </Tabs>
  );
}

function TabIcon({ Icon, color, size, focused }: { Icon: LucideIcon; color: string; size?: number; focused: boolean }) {
  return <View style={{ alignItems: "center", justifyContent: "center", gap: 4 }}><Icon size={size ?? 22} color={color} strokeWidth={focused ? 2.4 : 1.8} /><View style={{ width: focused ? 30 : 6, height: 3, borderRadius: 99, backgroundColor: focused ? theme.colors.accent.amber : "transparent" }} /></View>;
}
