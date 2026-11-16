import React from "react";
import { Tabs } from "expo-router";
import { Home, CheckSquare, Calendar, BarChart3, Layers } from "lucide-react-native";
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
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: theme.colors.accent.amber,
        tabBarInactiveTintColor: theme.colors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home size={size ?? 22} color={color} />,
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
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <Calendar size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size }) => <BarChart3 size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "Vault",
          tabBarIcon: ({ color, size }) => <Layers size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
