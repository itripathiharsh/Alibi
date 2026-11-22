import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { sql } from "drizzle-orm";
import { SyncEngine, type SyncApiClient, type SyncOperation, type SyncStorageAdapter } from "@alibi/sync-core";

export interface LocalTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number | null;
  deadline_at: string | null;
  /** First missed due date, kept after rescheduling (ADR-032). */
  original_deadline_at?: string | null;
  estimate_user_min: number | null;
  estimate_final_min?: number | null;
  actual_min: number;
  reschedule_count?: number;
  category_id?: string | null;
  workspace_id?: string | null;
  version?: number;
  tags: string[];
  subtasks?: { id: string; title: string; completed: boolean }[];
  created_at?: string;
  completed_at?: string | null;
  origin?: string;
  server_seq?: number;
}

type LocalTasksListener = (userId: string) => void;
const localTasksListeners = new Set<LocalTasksListener>();

/** Subscribe to "a task in the on-device cache changed" (widget, check-ins). */
export function onLocalTasksChanged(listener: LocalTasksListener): () => void {
  localTasksListeners.add(listener);
  return () => { localTasksListeners.delete(listener); };
}

function notifyLocalTasksChanged(userId: string): void {
  for (const listener of localTasksListeners) {
    try { listener(userId); } catch { /* a listener must never break a task write */ }
  }
}

/** All cached tasks for the user, including completed ones. */
export async function getAllLocalTasks(userId: string): Promise<LocalTask[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id = ?",
    userId,
  );
  return rows.flatMap((row) => {
    try {
      const task = normalizeTask(JSON.parse(row.data_json) as Record<string, unknown>);
      return task ? [task] : [];
    } catch {
      return [];
    }
  });
}

let database: SQLite.SQLiteDatabase | null = null;
let orm: ReturnType<typeof drizzle> | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync("alibi-local.db");
      const d = drizzle(db);
      await d.run(sql`PRAGMA foreign_keys = ON`);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_tasks (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          server_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS task_views (
          user_id TEXT NOT NULL,
          view_key TEXT NOT NULL,
          data_json TEXT NOT NULL,
          cached_at TEXT NOT NULL,
          PRIMARY KEY (user_id, view_key)
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          op_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          op_type TEXT NOT NULL,
          base_version INTEGER,
          payload_json TEXT NOT NULL,
          client_ts TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'pending',
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_sync_outbox_user_state_ts
          ON sync_outbox(user_id, state, client_ts);
        CREATE TABLE IF NOT EXISTS sync_state (
          user_id TEXT PRIMARY KEY,
          server_epoch TEXT,
          last_seq INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT,
          in_progress INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS local_timers (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'server',
          PRIMARY KEY (user_id, id),
          UNIQUE (user_id, task_id)
        );
        CREATE TABLE IF NOT EXISTS local_time_entries (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_min INTEGER,
          source TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS local_calendar_events (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          server_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS local_notes (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          server_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          client_data TEXT NOT NULL,
          server_data TEXT NOT NULL,
          resolved INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_projects (
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          data_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          server_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS local_user_preferences (
          user_id TEXT PRIMARY KEY,
          work_start_time TEXT NOT NULL DEFAULT '09:00',
          work_end_time TEXT NOT NULL DEFAULT '18:00',
          planning_style TEXT NOT NULL DEFAULT 'priority',
          learning_paused INTEGER NOT NULL DEFAULT 0,
          timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
          primary_goal TEXT,
          updated_at TEXT NOT NULL
        );
        DROP TABLE IF EXISTS local_subscriptions;
        CREATE TABLE IF NOT EXISTS local_integrations (
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'disconnected',
          account_email TEXT,
          scopes_json TEXT,
          last_synced_at TEXT,
          PRIMARY KEY (user_id, provider)
        );
        CREATE TABLE IF NOT EXISTS offline_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const timerColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(local_timers)");
      if (!timerColumns.some((column) => column.name === "source")) {
        await db.execAsync("ALTER TABLE local_timers ADD COLUMN source TEXT NOT NULL DEFAULT 'server'");
      }
      await db.runAsync("UPDATE sync_outbox SET state='pending' WHERE state='inflight'");
      await db.runAsync(
        "INSERT INTO offline_meta(key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value='2'",
      );
      database = db;
      orm = d;
      return db;
    } catch (error) {
      dbInitPromise = null;
      throw error;
    }
  })();

  return dbInitPromise;
}

export function makeOfflineId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    try {
      const generated = globalThis.crypto.randomUUID();
      if (typeof generated === "string" && generated.length === 36) {
        return generated;
      }
    } catch {
      // Fallback below
    }
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    try {
      globalThis.crypto.getRandomValues(bytes);
    } catch {
      for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  let hex = "";
  for (let i = 0; i < 16; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeTask(value: Record<string, unknown>): LocalTask | null {
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  const status = value.status;
  if (status !== "pending" && status !== "in_progress" && status !== "completed" && status !== "cancelled") return null;
  return {
    id: value.id,
    title: value.title,
    status,
    priority: typeof value.priority === "number" ? value.priority : null,
    deadline_at: typeof value.deadline_at === "string" ? value.deadline_at : null,
    original_deadline_at: typeof value.original_deadline_at === "string" ? value.original_deadline_at : null,
    estimate_user_min: typeof value.estimate_user_min === "number" ? value.estimate_user_min : null,
    estimate_final_min: typeof value.estimate_final_min === "number" ? value.estimate_final_min : null,
    actual_min: typeof value.actual_min === "number" ? value.actual_min : 0,
    reschedule_count: typeof value.reschedule_count === "number" ? value.reschedule_count : 0,
    tags: Array.isArray(value.tags) ? value.tags.filter((item): item is string => typeof item === "string") : [],
    subtasks: Array.isArray(value.subtasks) ? value.subtasks as NonNullable<LocalTask["subtasks"]> : [],
    category_id: typeof value.category_id === "string" ? value.category_id : null,
    workspace_id: typeof value.workspace_id === "string" ? value.workspace_id : null,
    version: typeof value.version === "number" ? value.version : 1,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    completed_at: typeof value.completed_at === "string" ? value.completed_at : null,
  };
}

async function saveTask(db: SQLite.SQLiteDatabase, userId: string, task: LocalTask): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_tasks(user_id, id, data_json, version, server_seq, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET data_json=excluded.data_json,
       version=excluded.version, server_seq=MAX(local_tasks.server_seq, excluded.server_seq),
       updated_at=excluded.updated_at`,
    userId,
    task.id,
    JSON.stringify(task),
    task.version ?? 1,
    typeof task.server_seq === "number" ? task.server_seq : 0,
    new Date().toISOString(),
  );
  notifyLocalTasksChanged(userId);
}

async function enqueue(
  db: SQLite.SQLiteDatabase,
  userId: string,
  entityId: string,
  opType: "create" | "update" | "delete",
  payload: Record<string, unknown>,
  baseVersion: number | null,
  entityType = "task",
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_outbox(op_id, user_id, entity_type, entity_id, op_type, base_version, payload_json, client_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    makeOfflineId(),
    userId,
    entityType,
    entityId,
    opType,
    baseVersion,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

export async function getCachedTaskView(userId: string, view: string): Promise<LocalTask[] | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ data_json: string }>(
    "SELECT data_json FROM task_views WHERE user_id = ? AND view_key = ?",
    userId,
    view,
  );
  if (!row) return getOfflineTaskView(userId, view);
  try {
    return JSON.parse(row.data_json) as LocalTask[];
  } catch {
    return null;
  }
}

export async function getOfflineTaskView(userId: string, view: string): Promise<LocalTask[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id = ?",
    userId,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tasks = rows.flatMap((row) => {
    try {
      const task = normalizeTask(JSON.parse(row.data_json) as Record<string, unknown>);
      return task ? [task] : [];
    } catch {
      return [];
    }
  });
  return tasks
    .filter((task) => {
      const deadline = task.deadline_at ? new Date(task.deadline_at) : null;
      const open = task.status === "pending" || task.status === "in_progress";
      if (view === "completed") return task.status === "completed";
      if (view === "backlog") return task.status === "pending" && !deadline;
      if (view === "upcoming") return open && deadline !== null && deadline >= tomorrow;
      return open && (task.status === "in_progress" || !deadline || deadline < tomorrow);
    })
    .sort((left, right) => {
      if (left.status === "in_progress" && right.status !== "in_progress") return -1;
      if (right.status === "in_progress" && left.status !== "in_progress") return 1;
      return (left.deadline_at ?? "").localeCompare(right.deadline_at ?? "");
    });
}

/** Store server tasks in the device cache without touching any cached list views. */
export async function cacheTasks(userId: string, tasks: Record<string, unknown>[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const raw of tasks) {
      const pending = await db.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ? AND entity_id = ? AND state IN ('pending', 'retry')",
        userId,
        String(raw.id ?? ""),
      );
      if ((pending?.n ?? 0) > 0) continue; // never overwrite an unsynced local edit
      const task = normalizeTask(raw);
      if (task) await saveTask(db, userId, { ...task, server_seq: typeof raw.server_seq === "number" ? raw.server_seq : task.server_seq });
    }
  });
}

export async function cacheTaskView(userId: string, view: string, tasks: LocalTask[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const task of tasks) await saveTask(db, userId, task);
    await db.runAsync(
      `INSERT INTO task_views(user_id, view_key, data_json, cached_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, view_key) DO UPDATE SET data_json=excluded.data_json, cached_at=excluded.cached_at`,
      userId,
      view,
      JSON.stringify(tasks),
      new Date().toISOString(),
    );
  });
}

export async function createTaskOffline(userId: string, input: {
  id?: string;
  title: string;
  status?: LocalTask["status"];
  deadline_at?: string | null;
  origin?: string;
  estimate_user_min?: number | null;
  estimate_final_min?: number | null;
  category_id?: string | null;
}): Promise<LocalTask> {
  const db = await getDatabase();
  const task: LocalTask = {
    id: input.id ?? makeOfflineId(),
    title: input.title.trim(),
    status: input.status ?? "pending",
    priority: null,
    deadline_at: input.deadline_at ?? null,
    estimate_user_min: input.estimate_user_min ?? null,
    estimate_final_min: input.estimate_final_min ?? null,
    actual_min: 0,
    reschedule_count: 0,
    category_id: input.category_id ?? null,
    tags: [],
    subtasks: [],
    origin: input.origin ?? "manual",
    created_at: new Date().toISOString(),
    version: 1,
  };
  await db.withTransactionAsync(async () => {
    await saveTask(db, userId, task);
    await enqueue(db, userId, task.id, "create", {
      title: task.title,
      status: task.status,
      deadline_at: task.deadline_at,
      origin: task.origin,
      estimate_user_min: task.estimate_user_min,
      estimate_final_min: task.estimate_final_min,
      category_id: task.category_id,
    }, null);
    await updateTaskViews(db, userId, task.id, task, true);
  });
  return task;
}

export async function updateTaskOffline(
  userId: string,
  taskId: string,
  patch: Partial<LocalTask>,
): Promise<LocalTask | null> {
  const db = await getDatabase();
  let updated: LocalTask | null = null;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ data_json: string; version: number }>(
      "SELECT data_json, version FROM local_tasks WHERE user_id = ? AND id = ?",
      userId,
      taskId,
    );
    if (!row) return;
    const current = normalizeTask(JSON.parse(row.data_json) as Record<string, unknown>);
    if (!current) return;
    updated = { ...current, ...patch };
    // Moving a due date that already passed: remember the missed date once (the server
    // does the same when the change syncs).
    if (
      patch.deadline_at !== undefined && patch.deadline_at !== current.deadline_at
      && current.deadline_at && !current.original_deadline_at && Date.parse(current.deadline_at) < Date.now()
    ) {
      updated.original_deadline_at = current.deadline_at;
    }
    if (patch.status === "completed" && current.status !== "completed" && patch.completed_at === undefined) {
      updated.completed_at = new Date().toISOString();
    } else if (patch.status !== undefined && patch.status !== "completed") {
      updated.completed_at = null;
    }
    await saveTask(db, userId, updated);
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.priority !== undefined) payload.priority = patch.priority;
    if (patch.deadline_at !== undefined) payload.deadline_at = patch.deadline_at;
    if (patch.estimate_user_min !== undefined) payload.estimate_min = patch.estimate_user_min;
    if (Object.keys(payload).length) await enqueue(db, userId, taskId, "update", payload, row.version);
    await updateTaskViews(db, userId, taskId, updated, false);
  });
  return updated;
}

async function updateTaskViews(
  db: SQLite.SQLiteDatabase,
  userId: string,
  taskId: string,
  task: LocalTask,
  prepend: boolean,
): Promise<void> {
  const rows = await db.getAllAsync<{ view_key: string; data_json: string }>(
    "SELECT view_key, data_json FROM task_views WHERE user_id = ?",
    userId,
  );
  for (const row of rows) {
    let tasks: LocalTask[];
    try { tasks = JSON.parse(row.data_json) as LocalTask[]; } catch { continue; }
    const exists = tasks.some((item) => item.id === taskId);
    const filtered = tasks.filter((item) => item.id !== taskId);
    const next = taskMatchesView(task, row.view_key)
      ? exists || prepend
        ? [task, ...filtered]
        : filtered
      : filtered;
    await db.runAsync(
      "UPDATE task_views SET data_json = ?, cached_at = ? WHERE user_id = ? AND view_key = ?",
      JSON.stringify(next),
      new Date().toISOString(),
      userId,
      row.view_key,
    );
  }
}

function taskMatchesView(task: LocalTask, view: string): boolean {
  const open = task.status === "pending" || task.status === "in_progress";
  const deadline = task.deadline_at ? new Date(task.deadline_at) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (view === "completed") return task.status === "completed";
  if (view === "backlog") return task.status === "pending" && !deadline;
  if (view === "upcoming") return open && deadline !== null && deadline >= tomorrow;
  return open && (task.status === "in_progress" || !deadline || deadline < tomorrow);
}

export async function getLocalTimers(userId: string): Promise<Array<{ id: string; task_id: string; started_at: string; source: string }>> {
  const db = await getDatabase();
  return db.getAllAsync("SELECT id, task_id, started_at, source FROM local_timers WHERE user_id = ? ORDER BY started_at", userId);
}

export async function cacheRunningTimers(
  userId: string,
  timers: Array<{ id: string; task_id: string; started_at: string }>,
): Promise<Array<{ id: string; task_id: string; started_at: string; source: string }>> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM local_timers WHERE user_id = ? AND source = 'server'", userId);
    for (const timer of timers) {
      await db.runAsync(
        "INSERT OR REPLACE INTO local_timers(user_id, id, task_id, started_at, source) VALUES (?, ?, ?, ?, 'server')",
        userId, timer.id, timer.task_id, timer.started_at,
      );
    }
  });
  notifyLocalTasksChanged(userId);
  return getLocalTimers(userId);
}

export async function removeLocalTimer(userId: string, timerId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM local_timers WHERE user_id = ? AND id = ?", userId, timerId);
  notifyLocalTasksChanged(userId);
}

export async function cacheTaskTimeEntries(
  userId: string,
  taskId: string,
  entries: Array<{ id: string; task_id: string; started_at: string; ended_at: string | null; duration_min: number | null; source: string }>,
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM local_time_entries WHERE user_id=? AND task_id=?", userId, taskId);
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO local_time_entries(user_id,id,task_id,started_at,ended_at,duration_min,source)
         VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET ended_at=excluded.ended_at,
         duration_min=excluded.duration_min, source=excluded.source`,
        userId, entry.id, entry.task_id, entry.started_at, entry.ended_at, entry.duration_min, entry.source,
      );
    }
  });
}

export async function getLocalTaskTimeEntries(userId: string, taskId: string): Promise<Array<{
  id: string; task_id: string; started_at: string; ended_at: string | null; duration_min: number | null; source: string;
}>> {
  const db = await getDatabase();
  return db.getAllAsync(
    "SELECT id,task_id,started_at,ended_at,duration_min,source FROM local_time_entries WHERE user_id=? AND task_id=? ORDER BY started_at DESC",
    userId,
    taskId,
  );
}

export async function startTaskTimerOffline(userId: string, taskId: string): Promise<{ id: string; task_id: string; started_at: string; source: string }> {
  const db = await getDatabase();
  // Never two running timers for the same task (a double tap, or a timer started elsewhere).
  const existing = await db.getFirstAsync<{ id: string; task_id: string; started_at: string; source: string }>(
    "SELECT id, task_id, started_at, source FROM local_timers WHERE user_id = ? AND task_id = ?",
    userId,
    taskId,
  );
  if (existing) return existing;
  const timer = { id: makeOfflineId(), task_id: taskId, started_at: new Date().toISOString(), source: "local" };
  await db.runAsync(
    "INSERT INTO local_timers(user_id, id, task_id, started_at, source) VALUES (?, ?, ?, ?, 'local')",
    userId, timer.id, taskId, timer.started_at,
  );
  await updateTaskOffline(userId, taskId, { status: "in_progress" });
  return timer;
}

export async function stopTaskTimerOffline(userId: string, timerId: string): Promise<void> {
  const db = await getDatabase();
  const timer = await db.getFirstAsync<{ id: string; task_id: string; started_at: string }>(
      "SELECT id, task_id, started_at FROM local_timers WHERE user_id = ? AND id = ?",
      userId,
      timerId,
    );
  if (!timer) return;
  const endedAt = new Date();
  const startedAt = new Date(timer.started_at);
  const duration = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
  await enqueue(db, userId, timer.id, "create", {
    task_id: timer.task_id,
    started_at: timer.started_at,
    ended_at: endedAt.toISOString(),
    duration_min: duration,
    source: "timer",
  }, null, "time_entry");
  await db.runAsync(
    `INSERT OR REPLACE INTO local_time_entries(user_id,id,task_id,started_at,ended_at,duration_min,source)
     VALUES (?,?,?,?,?,?,?)`,
    userId, timer.id, timer.task_id, timer.started_at, endedAt.toISOString(), duration, "timer",
  );
  const taskRow = await db.getFirstAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id=? AND id=?",
    userId,
    timer.task_id,
  );
  if (taskRow) {
    const task = normalizeTask(JSON.parse(taskRow.data_json) as Record<string, unknown>);
    if (task) await updateTaskOffline(userId, timer.task_id, { actual_min: task.actual_min + duration });
  }
  await db.runAsync("DELETE FROM local_timers WHERE user_id = ? AND id = ?", userId, timerId);
  notifyLocalTasksChanged(userId);
}

class ExpoSyncAdapter implements SyncStorageAdapter {
  constructor(private readonly userId: string) {}

  async getPendingOps(limit = 200): Promise<SyncOperation[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      op_id: string; entity_type: string; entity_id: string; op_type: SyncOperation["op_type"];
      base_version: number | null; payload_json: string; client_ts: string; attempts: number; state: SyncOperation["state"];
    }>(
      "SELECT op_id, entity_type, entity_id, op_type, base_version, payload_json, client_ts, attempts, state FROM sync_outbox WHERE user_id = ? AND state IN ('pending', 'retry') ORDER BY client_ts LIMIT ?",
      this.userId,
      limit,
    );
    return rows.map((row) => ({
      op_id: row.op_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      op_type: row.op_type,
      base_version: row.base_version,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      client_ts: row.client_ts,
      attempts: row.attempts,
      state: "pending",
    }));
  }

  async markOpsInflight(opIds: string[]): Promise<void> { await this.setState(opIds, "inflight"); }
  async markOpsComplete(opIds: string[]): Promise<void> { await this.setState(opIds, "done"); }
  async markOpConflict(opId: string, detail: Record<string, unknown>): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("UPDATE sync_outbox SET state='conflict', error=? WHERE user_id=? AND op_id=?", JSON.stringify(detail), this.userId, opId);
  }
  async markOpFailed(opId: string, error: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync("UPDATE sync_outbox SET state='failed', attempts=attempts+1, error=? WHERE user_id=? AND op_id=?", error, this.userId, opId);
  }
  async markOpsRetryable(opIds: string[], error: string): Promise<void> {
    const db = await getDatabase();
    for (const opId of opIds) {
      await db.runAsync("UPDATE sync_outbox SET state='retry', attempts=attempts+1, error=? WHERE user_id=? AND op_id=?", error, this.userId, opId);
    }
  }
  async getSyncState() {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ server_epoch: string | null; last_seq: number; last_synced_at: string | null; in_progress: number }>(
      "SELECT server_epoch, last_seq, last_synced_at, in_progress FROM sync_state WHERE user_id = ?",
      this.userId,
    );
    return { server_epoch: row?.server_epoch ?? null, last_seq: row?.last_seq ?? 0, last_synced_at: row?.last_synced_at ?? null, in_progress: row?.in_progress === 1 };
  }
  async saveSyncState(state: Partial<{ server_epoch: string | null; last_seq: number; last_synced_at: string | null; in_progress: boolean }>): Promise<void> {
    const current = await this.getSyncState();
    const next = { ...current, ...state };
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO sync_state(user_id, server_epoch, last_seq, last_synced_at, in_progress) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET server_epoch=excluded.server_epoch, last_seq=excluded.last_seq,
       last_synced_at=excluded.last_synced_at, in_progress=excluded.in_progress`,
      this.userId, next.server_epoch, next.last_seq, next.last_synced_at, next.in_progress ? 1 : 0,
    );
  }
  async applyRemoteChanges(changes: unknown[]): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const item of changes) {
        if (!item || typeof item !== "object") continue;
        const value = item as Record<string, unknown>;
        const entityType = String(value.entity_type || (value.kind ? "calendar_event" : "task")).toLowerCase();

        // 1. Calendar Events
        if (entityType === "calendar_event" || entityType === "event") {
          const id = String(value.id);
          if (value.deleted === true) {
            await db.runAsync("DELETE FROM local_calendar_events WHERE user_id=? AND id=?", this.userId, id);
          } else {
            await db.runAsync(
              `INSERT INTO local_calendar_events(user_id, id, data_json, version, server_seq, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, id) DO UPDATE SET
               data_json=excluded.data_json, version=excluded.version, server_seq=excluded.server_seq, updated_at=excluded.updated_at`,
              this.userId,
              id,
              JSON.stringify(value),
              Number(value.version || 1),
              Number(value.server_seq || 0),
              new Date().toISOString(),
            );
          }
          continue;
        }

        // 2. Vault Notes
        if (entityType === "note" || entityType === "vault_note") {
          const id = String(value.id);
          if (value.deleted === true) {
            await db.runAsync("DELETE FROM local_notes WHERE user_id=? AND id=?", this.userId, id);
          } else {
            await db.runAsync(
              `INSERT INTO local_notes(user_id, id, data_json, version, server_seq, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, id) DO UPDATE SET
               data_json=excluded.data_json, version=excluded.version, server_seq=excluded.server_seq, updated_at=excluded.updated_at`,
              this.userId,
              id,
              JSON.stringify(value),
              Number(value.version || 1),
              Number(value.server_seq || 0),
              new Date().toISOString(),
            );
          }
          continue;
        }

        // 3. Projects
        if (entityType === "project") {
          const id = String(value.id);
          if (value.deleted === true) {
            await db.runAsync("DELETE FROM local_projects WHERE user_id=? AND id=?", this.userId, id);
          } else {
            await db.runAsync(
              `INSERT INTO local_projects(user_id, id, data_json, version, server_seq, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, id) DO UPDATE SET
               data_json=excluded.data_json, version=excluded.version, server_seq=excluded.server_seq, updated_at=excluded.updated_at`,
              this.userId,
              id,
              JSON.stringify(value),
              Number(value.version || 1),
              Number(value.server_seq || 0),
              new Date().toISOString(),
            );
          }
          continue;
        }

        // 4. Tasks
        if (value.entity_type && value.entity_type !== "task") continue;
        const task = normalizeTask(value);
        if (!task) continue;
        const pending = await db.getFirstAsync<{ present: number }>(
          "SELECT 1 AS present FROM sync_outbox WHERE user_id=? AND entity_id=? AND state != 'done' LIMIT 1",
          this.userId,
          task.id,
        );
        if (pending) continue;
        if (value.deleted === true) {
          await db.runAsync("DELETE FROM local_tasks WHERE user_id=? AND id=?", this.userId, task.id);
          notifyLocalTasksChanged(this.userId);
          continue;
        }
        await saveTask(db, this.userId, task);
        await updateTaskViews(db, this.userId, task.id, task, false);
      }
    });
  }
  private async setState(opIds: string[], state: string): Promise<void> {
    const db = await getDatabase();
    for (const id of opIds) await db.runAsync("UPDATE sync_outbox SET state=? WHERE user_id=? AND op_id=?", state, this.userId, id);
  }
}

export async function syncMobileAccount(userId: string, token: string, baseUrl: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const api: SyncApiClient = {
    async push(operations) {
      const response = await fetch(`${baseUrl}/api/v1/sync/push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operations }),
      });
      if (!response.ok) throw new Error(`Sync push failed (${response.status})`);
      return response.json();
    },
    async pull(sinceSeq, limit) {
      const response = await fetch(`${baseUrl}/api/v1/sync/pull?since_seq=${sinceSeq}&limit=${limit ?? 200}`, { headers });
      if (!response.ok) throw new Error(`Sync pull failed (${response.status})`);
      return response.json();
    },
    async bootstrap() {
      const response = await fetch(`${baseUrl}/api/v1/sync/bootstrap`, { headers });
      if (!response.ok) throw new Error(`Sync bootstrap failed (${response.status})`);
      return response.json();
    },
  };
  await new SyncEngine(new ExpoSyncAdapter(userId), api).syncCycle();
}

export async function getPendingSyncCount(userId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id=? AND state NOT IN ('done', 'failed')",
    userId,
  );
  return row?.count ?? 0;
}

export async function getLocalCalendarEvents(userId: string): Promise<Record<string, unknown>[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_calendar_events WHERE user_id=? ORDER BY updated_at DESC",
    userId,
  );
  return rows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
}

export async function saveLocalCalendarEvent(userId: string, event: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  const id = String(event.id || makeOfflineId());
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO local_calendar_events(user_id, id, data_json, version, server_seq, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
     data_json=excluded.data_json, version=excluded.version, updated_at=excluded.updated_at`,
    userId,
    id,
    JSON.stringify({ ...event, id }),
    Number(event.version || 1),
    Number(event.server_seq || 0),
    now,
  );
  await enqueue(
    db,
    userId,
    id,
    event.deleted ? "delete" : "create",
    event,
    Number(event.version || 1),
    "calendar_event",
  );
}

export async function getLocalNotes(userId: string): Promise<Record<string, unknown>[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_notes WHERE user_id=? ORDER BY updated_at DESC",
    userId,
  );
  return rows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
}

export async function saveLocalNote(userId: string, note: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  const id = String(note.id || makeOfflineId());
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO local_notes(user_id, id, data_json, version, server_seq, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
     data_json=excluded.data_json, version=excluded.version, updated_at=excluded.updated_at`,
    userId,
    id,
    JSON.stringify({ ...note, id }),
    Number(note.version || 1),
    Number(note.server_seq || 0),
    now,
  );
  await enqueue(
    db,
    userId,
    id,
    note.deleted ? "delete" : "create",
    note,
    Number(note.version || 1),
    "vault_note",
  );
}

export async function deleteTaskOffline(userId: string, taskId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM local_tasks WHERE user_id = ? AND id = ?",
      userId,
      taskId,
    );
    await db.runAsync("DELETE FROM local_tasks WHERE user_id = ? AND id = ?", userId, taskId);
    notifyLocalTasksChanged(userId);
    await enqueue(db, userId, taskId, "delete", {}, row?.version ?? null, "task");
    const rows = await db.getAllAsync<{ view_key: string; data_json: string }>(
      "SELECT view_key, data_json FROM task_views WHERE user_id = ?",
      userId,
    );
    for (const r of rows) {
      try {
        const tasks = JSON.parse(r.data_json) as LocalTask[];
        const next = tasks.filter((t) => t.id !== taskId);
        await db.runAsync(
          "UPDATE task_views SET data_json = ?, cached_at = ? WHERE user_id = ? AND view_key = ?",
          JSON.stringify(next),
          new Date().toISOString(),
          userId,
          r.view_key,
        );
      } catch {
        continue;
      }
    }
  });
}

export async function deleteLocalNote(userId: string, noteId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM local_notes WHERE user_id = ? AND id = ?",
      userId,
      noteId,
    );
    await db.runAsync("DELETE FROM local_notes WHERE user_id = ? AND id = ?", userId, noteId);
    await enqueue(db, userId, noteId, "delete", {}, row?.version ?? null, "vault_note");
  });
}

export async function deleteLocalCalendarEvent(userId: string, eventId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM local_calendar_events WHERE user_id = ? AND id = ?",
      userId,
      eventId,
    );
    await db.runAsync("DELETE FROM local_calendar_events WHERE user_id = ? AND id = ?", userId, eventId);
    await enqueue(db, userId, eventId, "delete", {}, row?.version ?? null, "calendar_event");
  });
}

export async function getLocalCalendarData(
  userId: string,
  startIso?: string,
  endIso?: string,
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    deadline_at: string | null;
    estimate_user_min: number | null;
    tags: string[];
  }>;
  events: Array<{
    id: string;
    title: string;
    kind: string;
    source: string;
    start_at: string;
    end_at: string;
    is_all_day: boolean;
    task_id: string | null;
  }>;
}> {
  const db = await getDatabase();
  const taskRows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id = ?",
    userId,
  );
  const tasks = taskRows.flatMap((r) => {
    try {
      const t = normalizeTask(JSON.parse(r.data_json) as Record<string, unknown>);
      if (!t || !t.deadline_at) return [];
      if (startIso && t.deadline_at < startIso) return [];
      if (endIso && t.deadline_at > endIso) return [];
      return [{
        id: t.id,
        title: t.title,
        status: t.status,
        deadline_at: t.deadline_at,
        estimate_user_min: t.estimate_user_min ?? null,
        tags: t.tags ?? [],
      }];
    } catch {
      return [];
    }
  });

  const eventRows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_calendar_events WHERE user_id = ?",
    userId,
  );
  const events = eventRows.flatMap((r) => {
    try {
      const e = JSON.parse(r.data_json) as Record<string, unknown>;
      if (e.deleted === true) return [];
      const startAt = String(e.start_at || e.start || "");
      const endAt = String(e.end_at || e.end || startAt);
      if (!startAt) return [];
      if (endIso && startAt > endIso) return [];
      if (startIso && endAt < startIso) return [];
      return [{
        id: String(e.id),
        title: String(e.title || "Untitled Event"),
        kind: String(e.kind || "event"),
        source: String(e.source || "local"),
        start_at: startAt,
        end_at: endAt,
        is_all_day: Boolean(e.is_all_day),
        task_id: typeof e.task_id === "string" ? e.task_id : null,
      }];
    } catch {
      return [];
    }
  });

  return { tasks, events };
}

export async function getLocalAnalyticsSummary(userId: string): Promise<{
  total_time_min: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  efficiency: number | null;
}> {
  const db = await getDatabase();
  const taskRows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id = ?",
    userId,
  );
  const nowIso = new Date().toISOString();
  let completed = 0;
  let pending = 0;
  let overdue = 0;

  for (const r of taskRows) {
    try {
      const t = JSON.parse(r.data_json) as LocalTask;
      if (t.status === "completed") {
        completed++;
      } else {
        pending++;
        if (t.deadline_at && t.deadline_at < nowIso) {
          overdue++;
        }
      }
    } catch {
      // skip unparseable
    }
  }

  const timeRow = await db.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(duration_min), 0) AS total FROM local_time_entries WHERE user_id = ?",
    userId,
  );
  const totalMin = timeRow?.total ?? 0;
  const totalTasks = completed + pending;
  const completionRate = totalTasks > 0 ? completed / totalTasks : null;
  const onTimeRate = completed > 0 ? Math.max(0, (completed - overdue) / completed) : null;

  return {
    total_time_min: totalMin,
    tasks_completed: completed,
    tasks_pending: pending,
    tasks_overdue: overdue,
    completion_rate: completionRate,
    on_time_rate: onTimeRate,
    efficiency: null,
  };
}

export async function migrateOfflineUserToAccount(newUserId: string): Promise<void> {
  if (!newUserId || newUserId === "local_user") return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // 1. Tasks
    const localTasks = await db.getAllAsync<{ id: string; data_json: string; version: number; server_seq: number; updated_at: string }>(
      "SELECT id, data_json, version, server_seq, updated_at FROM local_tasks WHERE user_id = 'local_user'",
    );
    for (const task of localTasks) {
      await db.runAsync(
        `INSERT INTO local_tasks(user_id, id, data_json, version, server_seq, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           data_json = excluded.data_json, version = excluded.version, updated_at = excluded.updated_at`,
        newUserId, task.id, task.data_json, task.version, task.server_seq, task.updated_at,
      );
    }
    await db.runAsync("DELETE FROM local_tasks WHERE user_id = 'local_user'");

    // 2. Task Views
    const localViews = await db.getAllAsync<{ view_key: string; data_json: string; cached_at: string }>(
      "SELECT view_key, data_json, cached_at FROM task_views WHERE user_id = 'local_user'",
    );
    for (const view of localViews) {
      await db.runAsync(
        `INSERT INTO task_views(user_id, view_key, data_json, cached_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, view_key) DO UPDATE SET
           data_json = excluded.data_json, cached_at = excluded.cached_at`,
        newUserId, view.view_key, view.data_json, view.cached_at,
      );
    }
    await db.runAsync("DELETE FROM task_views WHERE user_id = 'local_user'");

    // 3. Notes
    const localNotes = await db.getAllAsync<{ id: string; data_json: string; version: number; server_seq: number; updated_at: string }>(
      "SELECT id, data_json, version, server_seq, updated_at FROM local_notes WHERE user_id = 'local_user'",
    );
    for (const note of localNotes) {
      await db.runAsync(
        `INSERT INTO local_notes(user_id, id, data_json, version, server_seq, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           data_json = excluded.data_json, version = excluded.version, updated_at = excluded.updated_at`,
        newUserId, note.id, note.data_json, note.version, note.server_seq, note.updated_at,
      );
    }
    await db.runAsync("DELETE FROM local_notes WHERE user_id = 'local_user'");

    // 4. Calendar Events
    const localEvents = await db.getAllAsync<{ id: string; data_json: string; version: number; server_seq: number; updated_at: string }>(
      "SELECT id, data_json, version, server_seq, updated_at FROM local_calendar_events WHERE user_id = 'local_user'",
    );
    for (const event of localEvents) {
      await db.runAsync(
        `INSERT INTO local_calendar_events(user_id, id, data_json, version, server_seq, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           data_json = excluded.data_json, version = excluded.version, updated_at = excluded.updated_at`,
        newUserId, event.id, event.data_json, event.version, event.server_seq, event.updated_at,
      );
    }
    await db.runAsync("DELETE FROM local_calendar_events WHERE user_id = 'local_user'");

    // 5. Timers & Time entries
    await db.runAsync("UPDATE local_timers SET user_id = ? WHERE user_id = 'local_user'", newUserId);
    await db.runAsync("UPDATE local_time_entries SET user_id = ? WHERE user_id = 'local_user'", newUserId);

    // 6. Projects
    const localProjects = await db.getAllAsync<{ id: string; data_json: string; version: number; server_seq: number; updated_at: string }>(
      "SELECT id, data_json, version, server_seq, updated_at FROM local_projects WHERE user_id = 'local_user'",
    );
    for (const proj of localProjects) {
      await db.runAsync(
        `INSERT INTO local_projects(user_id, id, data_json, version, server_seq, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           data_json = excluded.data_json, version = excluded.version, updated_at = excluded.updated_at`,
        newUserId, proj.id, proj.data_json, proj.version, proj.server_seq, proj.updated_at,
      );
    }
    await db.runAsync("DELETE FROM local_projects WHERE user_id = 'local_user'");

    // 7. User Preferences & Integrations
    await db.runAsync(
      `INSERT INTO local_user_preferences(user_id, work_start_time, work_end_time, planning_style, learning_paused, timezone, primary_goal, updated_at)
       SELECT ?, work_start_time, work_end_time, planning_style, learning_paused, timezone, primary_goal, updated_at
       FROM local_user_preferences WHERE user_id = 'local_user'
       ON CONFLICT(user_id) DO UPDATE SET
         work_start_time = excluded.work_start_time, work_end_time = excluded.work_end_time,
         planning_style = excluded.planning_style, learning_paused = excluded.learning_paused,
         timezone = excluded.timezone, primary_goal = excluded.primary_goal, updated_at = excluded.updated_at`,
      newUserId,
    );
    await db.runAsync("DELETE FROM local_user_preferences WHERE user_id = 'local_user'");

    await db.runAsync("UPDATE local_integrations SET user_id = ? WHERE user_id = 'local_user'", newUserId);

    // 8. Sync Outbox - update user_id so pending items get pushed for the new user!
    await db.runAsync("UPDATE sync_outbox SET user_id = ? WHERE user_id = 'local_user'", newUserId);

    // 9. Sync Conflicts
    await db.runAsync("UPDATE sync_conflicts SET user_id = ? WHERE user_id = 'local_user'", newUserId);
  });
}

export async function getSyncConflicts(userId: string): Promise<{ id: string; entity_type: string; entity_id: string; resolved: boolean }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; entity_type: string; entity_id: string; resolved: number }>(
    "SELECT id, entity_type, entity_id, resolved FROM sync_conflicts WHERE user_id=? AND resolved=0",
    userId,
  );
  return rows.map((r) => ({ ...r, resolved: Boolean(r.resolved) }));
}

export async function resolveSyncConflict(userId: string, conflictId: string, resolution: "client" | "server"): Promise<void> {
  const db = await getDatabase();
  const conflict = await db.getFirstAsync<{ entity_type: string; entity_id: string; client_data: string; server_data: string }>(
    "SELECT entity_type, entity_id, client_data, server_data FROM sync_conflicts WHERE user_id=? AND id=?",
    userId,
    conflictId,
  );
  if (!conflict) return;

  if (resolution === "client") {
    // Re-queue client data with latest client_ts
    await enqueue(
      db,
      userId,
      conflict.entity_id,
      "update",
      JSON.parse(conflict.client_data) as Record<string, unknown>,
      1,
      conflict.entity_type,
    );
  }
  await db.runAsync("UPDATE sync_conflicts SET resolved=1 WHERE user_id=? AND id=?", userId, conflictId);
}

// -------------------------------------------------------------
// MODULE D: Project Intelligence Helpers (Offline-First)
// -------------------------------------------------------------

export interface LocalProjectRecord {
  id: string;
  name: string;
  description?: string;
  objective?: string;
  status: "active" | "paused" | "done" | "archived";
  color: string;
  target_date?: string | null;
  tasks_count?: number;
  completed_tasks_count?: number;
  health_status?: "on_track" | "at_risk" | "needs_attention" | "completed";
  version?: number;
  server_seq?: number;
  updated_at?: string;
}

export async function getLocalProjects(userId: string): Promise<LocalProjectRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_projects WHERE user_id=? ORDER BY updated_at DESC",
    userId,
  );
  const projects = rows.map((r) => JSON.parse(r.data_json) as LocalProjectRecord);

  // Calculate project task counts & health indicators dynamically from local_tasks
  const taskRows = await db.getAllAsync<{ data_json: string }>(
    "SELECT data_json FROM local_tasks WHERE user_id=?",
    userId,
  );
  const tasks = taskRows.map((r) => {
    try {
      return JSON.parse(r.data_json) as { project_id?: string; status?: string; deadline_at?: string };
    } catch {
      return null;
    }
  }).filter(Boolean);

  const nowMs = Date.now();
  return projects.map((p) => {
    const projectTasks = tasks.filter((t) => t?.project_id === p.id);
    const total = projectTasks.length;
    const completed = projectTasks.filter((t) => t?.status === "completed").length;
    const overdue = projectTasks.filter((t) => t?.status !== "completed" && t?.deadline_at && Date.parse(t.deadline_at) < nowMs).length;

    let health: "on_track" | "at_risk" | "needs_attention" | "completed" = "on_track";
    if (p.status === "done" || (total > 0 && completed === total)) {
      health = "completed";
    } else if (overdue > 0) {
      health = "needs_attention";
    } else if (p.target_date && Date.parse(p.target_date) < nowMs && completed < total) {
      health = "at_risk";
    }

    return {
      ...p,
      tasks_count: total,
      completed_tasks_count: completed,
      health_status: health,
    };
  });
}

export async function saveLocalProject(
  userId: string,
  project: Partial<LocalProjectRecord> & { name: string; id?: string },
): Promise<LocalProjectRecord> {
  const db = await getDatabase();
  const id = String(project.id || makeOfflineId());
  const now = new Date().toISOString();
  const full: LocalProjectRecord = {
    id,
    name: project.name.trim(),
    description: project.description?.trim(),
    objective: project.objective?.trim(),
    status: project.status || "active",
    color: project.color || "#FF741F",
    target_date: project.target_date || null,
    version: Number(project.version || 1),
    server_seq: Number(project.server_seq || 0),
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO local_projects(user_id, id, data_json, version, server_seq, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
     data_json=excluded.data_json, version=excluded.version, updated_at=excluded.updated_at`,
    userId,
    id,
    JSON.stringify(full),
    full.version || 1,
    full.server_seq || 0,
    now,
  );

  await enqueue(
    db,
    userId,
    id,
    "create",
    full as unknown as Record<string, unknown>,
    full.version || 1,
    "project",
  );

  return full;
}

export async function deleteLocalProject(userId: string, projectId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM local_projects WHERE user_id = ? AND id = ?",
      userId,
      projectId,
    );
    await db.runAsync("DELETE FROM local_projects WHERE user_id = ? AND id = ?", userId, projectId);
    await enqueue(db, userId, projectId, "delete", {}, row?.version ?? null, "project");
  });
}

// -------------------------------------------------------------
// MODULE C: Vault Note Updating & Pinning
// -------------------------------------------------------------

export async function updateLocalNote(
  userId: string,
  noteId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ data_json: string; version: number }>(
      "SELECT data_json, version FROM local_notes WHERE user_id = ? AND id = ?",
      userId,
      noteId,
    );
    if (!existing) return;
    const current = JSON.parse(existing.data_json) as Record<string, unknown>;
    const updated = {
      ...current,
      ...updates,
      version: (existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    await db.runAsync(
      "UPDATE local_notes SET data_json = ?, version = ?, updated_at = ? WHERE user_id = ? AND id = ?",
      JSON.stringify(updated),
      updated.version,
      updated.updated_at,
      userId,
      noteId,
    );

    await enqueue(db, userId, noteId, "update", updated, updated.version, "vault_note");
  });
}

// -------------------------------------------------------------
// MODULE I: Onboarding & User Preferences
// -------------------------------------------------------------

export interface LocalUserPreferences {
  work_start_time: string;
  work_end_time: string;
  planning_style: "priority" | "time_blocking";
  learning_paused: boolean;
  timezone: string;
  primary_goal: string | null;
}

export async function getLocalUserPreferences(userId: string): Promise<LocalUserPreferences> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    work_start_time: string;
    work_end_time: string;
    planning_style: string;
    learning_paused: number;
    timezone: string;
    primary_goal: string | null;
  }>("SELECT * FROM local_user_preferences WHERE user_id = ?", userId);

  if (!row) {
    return {
      work_start_time: "09:00",
      work_end_time: "18:00",
      planning_style: "priority",
      learning_paused: false,
      timezone: "Asia/Kolkata",
      primary_goal: null,
    };
  }

  return {
    work_start_time: row.work_start_time || "09:00",
    work_end_time: row.work_end_time || "18:00",
    planning_style: (row.planning_style === "time_blocking" ? "time_blocking" : "priority"),
    learning_paused: Boolean(row.learning_paused),
    timezone: row.timezone || "Asia/Kolkata",
    primary_goal: row.primary_goal,
  };
}

export async function saveLocalUserPreferences(
  userId: string,
  prefs: Partial<LocalUserPreferences>,
): Promise<void> {
  const db = await getDatabase();
  const current = await getLocalUserPreferences(userId);
  const next = { ...current, ...prefs };
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO local_user_preferences(user_id, work_start_time, work_end_time, planning_style, learning_paused, timezone, primary_goal, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       work_start_time = excluded.work_start_time,
       work_end_time = excluded.work_end_time,
       planning_style = excluded.planning_style,
       learning_paused = excluded.learning_paused,
       timezone = excluded.timezone,
       primary_goal = excluded.primary_goal,
       updated_at = excluded.updated_at`,
    userId,
    next.work_start_time,
    next.work_end_time,
    next.planning_style,
    next.learning_paused ? 1 : 0,
    next.timezone,
    next.primary_goal,
    now,
  );
}

// -------------------------------------------------------------
// MODULE G: Connected ALIBI (Integrations Hub)
// -------------------------------------------------------------

export interface LocalIntegrationRecord {
  provider: "google_calendar" | "gmail" | "google_drive" | "github";
  status: "connected" | "disconnected" | "needs_credentials" | "syncing" | "error";
  account_email?: string;
  scopes?: string[];
  last_synced_at?: string;
}

export async function getLocalIntegrations(userId: string): Promise<LocalIntegrationRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    provider: string;
    status: string;
    account_email: string | null;
    scopes_json: string | null;
    last_synced_at: string | null;
  }>("SELECT * FROM local_integrations WHERE user_id = ?", userId);

  const existingMap = new Map(rows.map((r) => [r.provider, r]));
  const providers: Array<"google_calendar" | "gmail" | "google_drive" | "github"> = [
    "google_calendar",
    "gmail",
    "google_drive",
    "github",
  ];

  return providers.map((p) => {
    const record = existingMap.get(p);
    return {
      provider: p,
      status: (record?.status as LocalIntegrationRecord["status"]) || "disconnected",
      account_email: record?.account_email || undefined,
      scopes: record?.scopes_json ? JSON.parse(record.scopes_json) : [],
      last_synced_at: record?.last_synced_at || undefined,
    };
  });
}

export async function saveLocalIntegration(
  userId: string,
  integration: LocalIntegrationRecord,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO local_integrations(user_id, provider, status, account_email, scopes_json, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       status = excluded.status,
       account_email = excluded.account_email,
       scopes_json = excluded.scopes_json,
       last_synced_at = excluded.last_synced_at`,
    userId,
    integration.provider,
    integration.status,
    integration.account_email || null,
    JSON.stringify(integration.scopes || []),
    integration.last_synced_at || new Date().toISOString(),
  );
}

export async function disconnectLocalIntegration(
  userId: string,
  provider: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE local_integrations SET status='disconnected', account_email=NULL, last_synced_at=NULL WHERE user_id=? AND provider=?",
    userId,
    provider,
  );
}
