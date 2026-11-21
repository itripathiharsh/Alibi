import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Check,
  Crown,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
  X,
} from "lucide-react-native";
import theme from "../lib/theme";
import {
  LocalSubscriptionState,
  saveLocalSubscription,
} from "../lib/offline-sync";

export interface UpgradeModalProps {
  visible: boolean;
  userId: string;
  currentSubscription: LocalSubscriptionState;
  onSubscriptionUpdated: (updated: LocalSubscriptionState) => void;
  onClose: () => void;
}

const TIERS = [
  {
    id: "free" as const,
    name: "FREE",
    price: "₹0",
    period: "forever",
    description: "Core productivity, local-first offline storage, and privacy by default.",
    features: [
      "Offline task management & categories",
      "Basic projects & health indicators",
      "Day schedule & calendar views",
      "SQLite knowledge vault & notes",
      "Focus timer with notifications",
      "Local SQL-grounded analytics",
      "15 AI queries / day",
    ],
  },
  {
    id: "pro" as const,
    name: "PRO",
    price: "₹149",
    period: "/ month",
    badge: "RECOMMENDED",
    description: "Your AI Chief of Staff and advanced personal productivity intelligence.",
    features: [
      "Everything in Free",
      "AI Daily Chief of Staff morning briefings",
      "Personal Learning Engine (duration learning)",
      "OR-Tools CP-SAT smart day scheduling",
      "Work Memory second brain with grounded RAG",
      "Weekly and monthly verified report snapshots",
      "Connected integrations (Google, GitHub)",
      "100 AI queries / day",
    ],
  },
  {
    id: "ultra" as const,
    name: "ULTRA",
    price: "₹299",
    period: "/ month",
    badge: "FOUNDER & POWER USER",
    description: "Uncapped AI intelligence, automated project reviews, and advanced workflows.",
    features: [
      "Everything in Pro",
      "Advanced multi-model provider selection",
      "Automated weekly project risk alerts",
      "Deep email and calendar action extraction",
      "Priority AI Gateway routing",
      "1,000 AI queries / day (effectively unlimited)",
    ],
  },
];

export function UpgradeModal({
  visible,
  userId,
  currentSubscription,
  onSubscriptionUpdated,
  onClose,
}: UpgradeModalProps) {
  const [selectedTier, setSelectedTier] = useState<"free" | "pro" | "ultra">(
    currentSubscription.tier === "free" ? "pro" : currentSubscription.tier,
  );
  const [updating, setUpdating] = useState(false);

  const handleSelectPlan = async (tier: "free" | "pro" | "ultra") => {
    setUpdating(true);
    const updated: LocalSubscriptionState = {
      ...currentSubscription,
      tier,
      status: "active",
      valid_until: tier === "free" ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };

    await saveLocalSubscription(userId, updated);
    setUpdating(false);
    onSubscriptionUpdated(updated);
    Alert.alert(
      "Entitlements Activated (Developer Preview)",
      tier === "free"
        ? "You are now on the Free tier. Your local data remains completely accessible."
        : `Google Play In-App Billing is scheduled for v0.2.0. ${tier.toUpperCase()} entitlements are active in developer preview mode on this device.`,
      [{ text: "Continue", onPress: onClose }],
    );
  };

  const handleRestore = () => {
    Alert.alert(
      "Google Play Restore Purchases",
      "Google Play In-App Billing is scheduled for v0.2.0. Current active preview entitlement: " +
        currentSubscription.tier.toUpperCase(),
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.headerRow}>
            <View style={styles.crownBadge}>
              <Crown size={15} color="#D97706" />
              <Text style={styles.crownBadgeText}>COMMERCIAL PLANS</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={theme.colors.text.secondary} />
            </Pressable>
          </View>

          <Text style={styles.title}>Supercharge Your Operating System</Text>
          <Text style={styles.subtitle}>
            Choose the plan that fits your workflow. Core tasks and offline storage will always remain free.
          </Text>

          {/* Billing Roadmap Notice */}
          <View style={styles.billingNoticeBox}>
            <Sparkles size={14} color={theme.colors.brand.orange} />
            <Text style={styles.billingNoticeText}>
              Google Play In-App Billing coming in v0.2.0. Plan selection below operates in Developer Preview mode to evaluate Pro & Ultra entitlements.
            </Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {TIERS.map((tier) => {
              const isCurrent = currentSubscription.tier === tier.id;
              const isSelected = selectedTier === tier.id;

              return (
                <Pressable
                  key={tier.id}
                  style={[
                    styles.tierCard,
                    isSelected && styles.tierCardSelected,
                    isCurrent && styles.tierCardCurrent,
                  ]}
                  onPress={() => setSelectedTier(tier.id)}
                >
                  {tier.badge && (
                    <View style={styles.badgeWrapper}>
                      <Text style={styles.badgeText}>{tier.badge}</Text>
                    </View>
                  )}

                  <View style={styles.tierHeader}>
                    <View>
                      <Text style={styles.tierName}>{tier.name}</Text>
                      <Text style={styles.tierDesc}>{tier.description}</Text>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.tierPrice}>{tier.price}</Text>
                      <Text style={styles.tierPeriod}>{tier.period}</Text>
                    </View>
                  </View>

                  <View style={styles.featureList}>
                    {tier.features.map((feat, idx) => (
                      <View key={idx} style={styles.featureItem}>
                        <Check size={14} color={isSelected ? theme.colors.accent.primary : theme.colors.accent.emerald} />
                        <Text style={styles.featureText}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    style={[
                      styles.planButton,
                      isCurrent && styles.planButtonCurrent,
                      isSelected && !isCurrent && styles.planButtonSelected,
                    ]}
                    onPress={() => handleSelectPlan(tier.id)}
                    disabled={updating}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        isCurrent && styles.planButtonTextCurrent,
                      ]}
                    >
                      {isCurrent ? "Current Plan" : `Switch to ${tier.name}`}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}

            {/* Zero Lock-in & Privacy Guarantee */}
            <View style={styles.guaranteeBox}>
              <ShieldCheck size={18} color={theme.colors.accent.emerald} />
              <View style={styles.guaranteeCopy}>
                <Text style={styles.guaranteeTitle}>Honest Commercialization Guarantee</Text>
                <Text style={styles.guaranteeText}>
                  ALIBI never blocks access to your personal data or export tools when a subscription ends. Your tasks, calendar, notes, and timers always reside safely in your offline SQLite database.
                </Text>
              </View>
            </View>

            <Pressable style={styles.restoreBtn} onPress={handleRestore}>
              <RotateCcw size={13} color={theme.colors.text.secondary} />
              <Text style={styles.restoreBtnText}>Restore Purchases</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11,32,48,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "92%",
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border.subtle,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  crownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.control,
  },
  crownBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  scroll: {
    maxHeight: 520,
  },
  tierCard: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.radius.card,
    borderWidth: 1.5,
    borderColor: theme.colors.border.subtle,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  tierCardSelected: {
    borderColor: theme.colors.accent.primary,
    backgroundColor: "#FFFAF6",
  },
  tierCardCurrent: {
    borderColor: theme.colors.brand.navy,
  },
  badgeWrapper: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.brand.navy,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tierName: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  tierDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.text.secondary,
    marginTop: 2,
    maxWidth: 220,
  },
  priceCol: {
    alignItems: "flex-end",
  },
  tierPrice: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text.primary,
  },
  tierPeriod: {
    fontSize: 10,
    color: theme.colors.text.secondary,
  },
  featureList: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    paddingTop: 10,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 12,
    color: theme.colors.text.primary,
    flex: 1,
  },
  planButton: {
    minHeight: 46,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  planButtonSelected: {
    backgroundColor: theme.colors.accent.primary,
  },
  planButtonCurrent: {
    backgroundColor: "#E2E8F0",
  },
  planButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  planButtonTextCurrent: {
    color: theme.colors.text.secondary,
  },
  guaranteeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: theme.radius.cardSecondary,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    marginVertical: 10,
  },
  guaranteeCopy: {
    flex: 1,
    gap: 2,
  },
  guaranteeTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166534",
  },
  guaranteeText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#15803D",
  },
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  restoreBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text.secondary,
  },
  billingNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 116, 31, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 116, 31, 0.25)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  billingNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.brand.navy,
    fontWeight: "500",
  },
});
