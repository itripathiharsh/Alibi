import React from "react";
import { Tabs } from "expo-router";
import { LayoutDashboard, CheckSquare, Sparkles, BarChart3 } from "lucide-react-native";
import theme from "../../lib/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface.card,
          borderTopColor: theme.colors.border.subtle,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.colors.accent.amber,
        tabBarInactiveTintColor: theme.colors.text.secondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => <CheckSquare size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ color, size }) => <Sparkles size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => <BarChart3 size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
