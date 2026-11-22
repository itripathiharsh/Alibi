/**
 * Brain dump client (FR-TASK-022, ADR-028).
 *
 * The server splits the text and resolves dates; it saves nothing. Accepted items are
 * saved on the device with createTaskOffline so they work offline and sync later.
 */
import { ensureAuthenticated } from "./auth";
import { getServerUrl } from "./config";
import { createTaskOffline } from "./offline-sync";
import { currentUserId, recordLearningSignal } from "./learning-signals";

export type BrainDumpBucket = "today" | "this_week" | "later" | "anytime";

export interface BrainDumpItem {
  title: string;
  source_text: string;
  deadline_at: string | null;
  deadline_phrase: string | null;
  deadline_kind: "hard" | "soft" | null;
  bucket: BrainDumpBucket;
  priority: number | null;
  estimate_minutes: number | null;
  category: string | null;
  /** A planner-suggested slot when no time was said (the user can drop it). */
  suggested_at?: string | null;
  time_source?: "said" | "suggested" | null;
}

export interface BrainDumpResult {
  items: BrainDumpItem[];
  mode: "ai" | "rules";
  ai_status: "used" | "not_opted_in" | "server_disabled" | "unavailable";
  provider: string | null;
}

export interface CloudAiConfig {
  ai_external_enabled: boolean;
  server_external_enabled: boolean;
  server_keys_available: boolean;
}

async function authorizedFetch(path: string, init: RequestInit): Promise<Response> {
  let token = await ensureAuthenticated();
  if (!token) throw new Error("Sign in and connect to the internet to use brain dump.");
  const send = (accessToken: string) => fetch(`${getServerUrl()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  let response = await send(token);
  if (response.status === 401) {
    token = await ensureAuthenticated(true);
    if (token) response = await send(token);
  }
  return response;
}

export async function splitBrainDump(text: string): Promise<BrainDumpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await authorizedFetch("/api/v1/tasks/brain-dump", {
      method: "POST",
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({})) as { detail?: string; title?: string };
      throw new Error(problem.detail ?? problem.title ?? "Could not sort your list. Try again.");
    }
    return await response.json() as BrainDumpResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("ALIBI took too long to answer. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCloudAiConfig(): Promise<CloudAiConfig | null> {
  try {
    const response = await authorizedFetch("/api/v1/ai/config", { method: "GET" });
    return response.ok ? await response.json() as CloudAiConfig : null;
  } catch {
    return null;
  }
}

export async function setCloudAiOptIn(enabled: boolean): Promise<CloudAiConfig> {
  const response = await authorizedFetch("/api/v1/ai/config", {
    method: "PUT",
    body: JSON.stringify({ ai_external_enabled: enabled }),
  });
  if (!response.ok) throw new Error("Could not update the AI setting.");
  return await response.json() as CloudAiConfig;
}

export interface ReviewedItem {
  title: string;
  deadline_at: string | null;
  estimate_minutes: number | null;
  edited: boolean;
}

/** Save the items the user kept, then record review counts for learning. */
export async function saveBrainDumpItems(
  items: ReviewedItem[],
  context: { proposed: number; mode: BrainDumpResult["mode"] },
): Promise<number> {
  const userId = await currentUserId();
  let saved = 0;
  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    await createTaskOffline(userId, {
      title,
      status: "pending",
      origin: "manual",
      deadline_at: item.deadline_at,
      estimate_user_min: item.estimate_minutes,
      estimate_final_min: item.estimate_minutes,
    });
    saved += 1;
  }
  void recordLearningSignal("brain_dump_review", {
    data: {
      proposed: context.proposed,
      accepted: saved,
      edited: items.filter((item) => item.edited).length,
      removed: Math.max(0, context.proposed - items.length),
      mode: context.mode,
    },
  });
  return saved;
}
