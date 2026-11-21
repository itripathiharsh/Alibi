/**
 * ALIBI Subscription & Entitlements Engine
 *
 * Implements client-side entitlement enforcement, daily AI query tracking,
 * and defines the server-side Google Play Billing architecture (scheduled for v0.2.0).
 */

import { LocalSubscriptionState, saveLocalSubscription } from "./offline-sync";

export type SubscriptionTier = "free" | "pro" | "ultra";

export interface PlanDetails {
  id: SubscriptionTier;
  name: string;
  priceInr: number;
  period: string;
  dailyAiLimit: number;
  chiefOfStaffFullAccess: boolean;
  pleFullAccess: boolean;
  exportReportsPdf: boolean;
  multiDeviceSync: boolean;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, PlanDetails> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    period: "forever",
    dailyAiLimit: 15,
    chiefOfStaffFullAccess: false,
    pleFullAccess: false,
    exportReportsPdf: false,
    multiDeviceSync: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 149,
    period: "month",
    dailyAiLimit: 100,
    chiefOfStaffFullAccess: true,
    pleFullAccess: true,
    exportReportsPdf: true,
    multiDeviceSync: true,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    priceInr: 299,
    period: "month",
    dailyAiLimit: 1000,
    chiefOfStaffFullAccess: true,
    pleFullAccess: true,
    exportReportsPdf: true,
    multiDeviceSync: true,
  },
};

/**
 * Check whether the user is entitled to perform an AI query based on their active tier and today's usage.
 */
export function canPerformAIQuery(subscription: LocalSubscriptionState): {
  allowed: boolean;
  remaining: number;
  limit: number;
} {
  const tier = subscription.tier as SubscriptionTier;
  const plan = SUBSCRIPTION_PLANS[tier] || SUBSCRIPTION_PLANS.free;
  const limit = plan.dailyAiLimit;

  const todayStr = new Date().toISOString().split("T")[0];
  const countToday = subscription.last_query_date === todayStr ? (subscription.ai_queries_today || 0) : 0;
  const remaining = Math.max(0, limit - countToday);

  return {
    allowed: countToday < limit,
    remaining,
    limit,
  };
}

/**
 * Increment the count of AI queries executed today and persist to local SQLite.
 */
export async function recordAIQueryUsed(
  userId: string,
  current: LocalSubscriptionState,
): Promise<LocalSubscriptionState> {
  const todayStr = new Date().toISOString().split("T")[0];
  const countToday = current.last_query_date === todayStr ? (current.ai_queries_today || 0) + 1 : 1;

  const updated: LocalSubscriptionState = {
    ...current,
    ai_queries_today: countToday,
    last_query_date: todayStr,
  };

  await saveLocalSubscription(userId, updated);
  return updated;
}

/**
 * Architectural specification for Google Play Billing Integration (v0.2.0):
 *
 * 1. Mobile SDK:
 *    - `react-native-iap` or Expo in-app-purchases with Google Play Billing Client 7.x.
 *    - SKUs: `alibi_pro_monthly` (₹149/mo), `alibi_ultra_monthly` (₹299/mo).
 *
 * 2. Server-side Verification:
 *    - Client calls purchaseUpdateListener -> receives purchaseToken.
 *    - Client POSTs purchaseToken, packageName, and subscriptionId to `/api/v1/billing/google-play/verify`.
 *    - Backend validates purchaseToken against Google Play Developer API using Service Account JSON.
 *    - Backend persists subscription record in `subscriptions` table with `expiry_date` and `auto_renewing`.
 *    - Sync engine propagates active subscription tier to all user devices.
 *
 * 3. Real-Time Developer Notifications (RTDN):
 *    - Google Cloud Pub/Sub topic receives subscription state changes (renewals, cancellations, pauses).
 *    - Webhook `/api/v1/billing/google-play/webhook` ingests RTDN events and updates user entitlement state.
 */
