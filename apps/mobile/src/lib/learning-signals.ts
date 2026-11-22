/**
 * Behaviour signals for the Personal Learning Engine (FR-LEARN-012, ADR-028).
 *
 * Check-in answers, brain-dump review counts and recommendation feedback are queued in
 * the on-device SQLite database first, so nothing is lost offline, and sent to
 * POST /api/v1/learning/signals when the app is online. Signals carry ids and counts,
 * never task text.
 */
import { ensureAuthenticated, getUserProfile } from "./auth";
import { getServerUrl } from "./config";
import { getDatabase, makeOfflineId } from "./offline-sync";

export type LearningSignalType =
  | "checkin_done"
  | "checkin_snoozed"
  | "checkin_moved"
  | "checkin_opened"
  | "brain_dump_review"
  | "recommendation_dismissed"
  | "recommendation_accepted";

export type SignalData = Record<string, string | number | boolean | null>;

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const db = await getDatabase();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_learning_signals (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          task_id TEXT,
          data_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL
        );
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

export async function currentUserId(): Promise<string> {
  const profile = await getUserProfile().catch(() => null);
  return profile?.id ?? "local_user";
}

function isServerTaskId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function recordLearningSignal(
  type: LearningSignalType,
  options: { taskId?: string | null; data?: SignalData } = {},
): Promise<void> {
  try {
    await ensureTable();
    const db = await getDatabase();
    const userId = await currentUserId();
    await db.runAsync(
      "INSERT INTO local_learning_signals(id, user_id, type, task_id, data_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
      makeOfflineId(),
      userId,
      type,
      isServerTaskId(options.taskId) ? options.taskId : null,
      JSON.stringify(options.data ?? {}),
      new Date().toISOString(),
    );
  } catch {
    // Learning is best effort; it must never block the user's action.
  }
  void flushLearningSignals();
}

let flushing = false;

/** Send queued signals in batches of up to 100. Safe to call often. */
export async function flushLearningSignals(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await ensureTable();
    const userId = await currentUserId();
    if (userId === "local_user") return;
    const token = await ensureAuthenticated().catch(() => null);
    if (!token) return;
    const db = await getDatabase();
    for (let round = 0; round < 10; round += 1) {
      const rows = await db.getAllAsync<{ id: string; type: string; task_id: string | null; data_json: string; occurred_at: string }>(
        "SELECT id, type, task_id, data_json, occurred_at FROM local_learning_signals WHERE user_id = ? ORDER BY occurred_at LIMIT 100",
        userId,
      );
      if (!rows.length) return;
      const response = await fetch(`${getServerUrl()}/api/v1/learning/signals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          signals: rows.map((row) => ({
            type: row.type,
            occurred_at: row.occurred_at,
            task_id: row.task_id,
            data: safeParse(row.data_json),
          })),
        }),
      }).catch(() => null);
      if (!response) return;
      if (!response.ok && response.status !== 422) return; // retry later
      // 422 means a malformed row: drop it rather than retrying forever.
      const placeholders = rows.map(() => "?").join(",");
      await db.runAsync(
        `DELETE FROM local_learning_signals WHERE user_id = ? AND id IN (${placeholders})`,
        userId,
        ...rows.map((row) => row.id),
      );
    }
  } catch {
    // Retry on the next app foreground.
  } finally {
    flushing = false;
  }
}

function safeParse(json: string): SignalData {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as SignalData : {};
  } catch {
    return {};
  }
}
