import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Sparkles, ShieldCheck, Lock, Cpu, Database } from "lucide-react-native";
import theme from "../../lib/theme";

export default function AIScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Privacy Guarantee Card */}
      <View style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <ShieldCheck size={20} color={theme.colors.accent.emerald} />
          <Text style={styles.privacyTitle}>Private by Default (ADR-020)</Text>
        </View>
        <Text style={styles.privacyText}>
          External Cloud AI is strictly opt-in and disabled by default. On-device Android speech
          recognition and deterministic rules-based extraction are the primary intelligence engines.
        </Text>
      </View>

      {/* Feature Architecture Cards */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Lock size={18} color={theme.colors.accent.amber} />
          <Text style={styles.cardTitle}>Grounding Validator (ADR-009)</Text>
        </View>
        <Text style={styles.cardText}>
          AI cannot fabricate deadlines or projects. Any parsed entity must strictly match text
          present in the user's input or existing workspace databases.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Cpu size={18} color="#818CF8" />
          <Text style={styles.cardTitle}>Personal Learning Engine (M5)</Text>
        </View>
        <Text style={styles.cardText}>
          Learns estimation biases and habitual completion times locally using scikit-learn models.
          All training weights stay local.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Database size={18} color="#EC4899" />
          <Text style={styles.cardTitle}>Zero Metric Fabrication Rule</Text>
        </View>
        <Text style={styles.cardText}>
          LLMs are never the source of numbers or productivity scores shown to the user. All metrics
          are computed via verified SQL queries.
        </Text>
      </View>
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
    gap: 14,
  },
  privacyCard: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  privacyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  privacyTitle: {
    color: theme.colors.accent.emerald,
    fontSize: 14,
    fontWeight: "700",
  },
  privacyText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: theme.colors.text.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  cardText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});

