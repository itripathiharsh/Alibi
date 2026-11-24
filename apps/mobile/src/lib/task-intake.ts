/**
 * The one way the phone adds tasks (ADR-034, logic audit 2026-11-24).
 *
 * The Today page's write line, the Add screen, the widget's "Say a task" and an assistant
 * suggestion the user approves all come through here. Before this, five screens each had
 * their own copy: some posted to the server and fell back to the phone (a slow answer
 * could save the task twice), some dropped the estimate, and one never saved offline.
 *
 * - Every task is written to the on-device store first and uploaded by the sync outbox,
 *   so adding works offline and is saved exactly once.
 * - One line is read for its date words ("kal 5 baje", "shaam ko") by the server's rules
 *   parser when it answers quickly. A slow, offline or signed-out phone keeps the words
 *   exactly as written and never waits long.
 * - Text that holds several tasks is never saved straight away: it goes to the review
 *   list, because a split is a proposal until the user accepts it (AGENTS.md §2).
 * - A date or estimate the user picked beats one read from the words.
 */
import { ensureAuthenticated } from "./auth";
import { splitBrainDump, type BrainDumpResult, type ReviewedItem } from "./brain-dump";
import { getServerUrl } from "./config";
import { looksLikeManyTasks } from "./diary-page";
import { currentUserId, recordLearningSignal } from "./learning-signals";
import { createTaskOffline, syncMobileAccount, type LocalTask } from "./offline-sync";

export type TaskOrigin = "manual" | "voice" | "ai_recommendation";

const MAX_ESTIMATE_MIN = 10080; // the server accepts up to one week
const READ_TIMEOUT_MS = 4000;

export interface NewTask {
  title: string;
  deadlineAt?: string | null;
  estimateMin?: number | null;
  /** Logging something already finished. */
  done?: boolean;
  origin?: TaskOrigin;
}

function cleanEstimate(minutes: number | null | undefined): number | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded >= 1 && rounded <= MAX_ESTIMATE_MIN ? rounded : null;
}

/** Save one task on this phone and queue it for upload. */
export async function addTask(input: NewTask): Promise<LocalTask> {
  const title = input.title.trim();
  if (!title) throw new Error("Write what the task is first.");
  const userId = await currentUserId();
  const estimate = cleanEstimate(input.estimateMin);
  const task = await createTaskOffline(userId, {
    title,
    status: input.done ? "completed" : "pending",
    deadline_at: input.deadlineAt ?? null,
    origin: input.origin ?? "manual",
    estimate_user_min: estimate,
    estimate_final_min: estimate,
  });
  requestSync();
  return task;
}

export type ReadText =
  | { kind: "one"; title: string; deadlineAt: string | null; estimateMin: number | null }
  /** `result` is null when the words alone showed several tasks and nothing was asked yet. */
  | { kind: "many"; result: BrainDumpResult | null };

/** Read one line's date words. Never throws; offline or slow keeps the words as written. */
export async function readTaskText(text: string, timeoutMs = READ_TIMEOUT_MS): Promise<ReadText> {
  const words = text.trim();
  if (looksLikeManyTasks(words)) return { kind: "many", result: null };
  try {
    const parsed = await Promise.race([
      splitBrainDump(words),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (parsed && parsed.items.length > 1) return { kind: "many", result: parsed };
    const item = parsed?.items[0];
    if (item) {
      return {
        kind: "one",
        title: item.title.trim() || words,
        deadlineAt: item.deadline_at,
        estimateMin: item.estimate_minutes,
      };
    }
  } catch {
    // Offline or signed out: keep the words exactly as written.
  }
  return { kind: "one", title: words, deadlineAt: null, estimateMin: null };
}

export type AddOutcome =
  | { kind: "added"; task: LocalTask }
  | { kind: "review"; result: BrainDumpResult | null };

/**
 * One line in, one saved task out. Several tasks come back as "review" and nothing is
 * saved. `deadlineAt` / `estimateMin` are the user's own picks and always win;
 * `defaultDeadlineAt` applies only when the words name no time.
 */
export async function addTaskFromText(
  text: string,
  options: {
    deadlineAt?: string | null;
    defaultDeadlineAt?: string | null;
    estimateMin?: number | null;
    done?: boolean;
    origin?: TaskOrigin;
    timeoutMs?: number;
  } = {},
): Promise<AddOutcome> {
  const read = await readTaskText(text, options.timeoutMs);
  if (read.kind === "many") return { kind: "review", result: read.result };
  const task = await addTask({
    title: read.title,
    deadlineAt: options.deadlineAt ?? read.deadlineAt ?? options.defaultDeadlineAt ?? null,
    estimateMin: options.estimateMin ?? read.estimateMin,
    done: options.done,
    origin: options.origin,
  });
  return { kind: "added", task };
}

const SPLIT_ON = /\s*(?:[\n;,]+|\s(?:aur|phir|fir|then|also)\s)\s*/i;

/** The phone's own split when the server can't be reached: the user's words, no dates. */
export function splitLocally(text: string): BrainDumpResult {
  const parts = text.split(SPLIT_ON).map((part) => part.trim()).filter(Boolean);
  return {
    items: parts.map((part) => ({
      title: part,
      source_text: part,
      deadline_at: null,
      deadline_phrase: null,
      deadline_kind: null,
      bucket: "anytime",
      priority: null,
      estimate_minutes: null,
      category: null,
    })),
    mode: "rules",
    ai_status: "offline",
    provider: null,
  };
}

/** Proposed tasks for the review list: the server's split, or the phone's when offline. */
export async function splitForReview(text: string): Promise<BrainDumpResult> {
  try {
    return await splitBrainDump(text);
  } catch {
    return splitLocally(text);
  }
}

/** Save the tasks the user kept on the review list, and record how the review went. */
export async function addReviewedTasks(
  items: ReviewedItem[],
  context: { proposed: number; mode: BrainDumpResult["mode"]; origin?: TaskOrigin },
): Promise<number> {
  const userId = await currentUserId();
  let saved = 0;
  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    const estimate = cleanEstimate(item.estimate_minutes);
    await createTaskOffline(userId, {
      title,
      status: "pending",
      origin: context.origin ?? "manual",
      deadline_at: item.deadline_at,
      estimate_user_min: estimate,
      estimate_final_min: estimate,
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
  requestSync();
  return saved;
}

/** Upload queued changes now (signed-in phones only). Never throws. */
export async function syncNow(): Promise<void> {
  const userId = await currentUserId();
  if (userId === "local_user") return;
  const token = await ensureAuthenticated().catch(() => null);
  if (token) await syncMobileAccount(userId, token, getServerUrl()).catch(() => undefined);
}

let pendingSync: ReturnType<typeof setTimeout> | null = null;

/** Upload soon; several changes in a row share one sync. */
export function requestSync(delayMs = 1500): void {
  if (pendingSync) clearTimeout(pendingSync);
  pendingSync = setTimeout(() => {
    pendingSync = null;
    void syncNow();
  }, delayMs);
}
