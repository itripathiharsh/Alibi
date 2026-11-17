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
  origin?: string;
  server_seq?: number;
}

let database: SQLite.SQLiteDatabase | null = null;
let orm: ReturnType<typeof drizzle> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  database = await SQLite.openDatabaseAsync("alibi-local.db");
  orm = drizzle(database);
  await orm.run(sql`PRAGMA foreign_keys = ON`);
  await database.execAsync(`
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
    CREATE TABLE IF NOT EXISTS offline_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const timerColumns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(local_timers)");
  if (!timerColumns.some((column) => column.name === "source")) {
    await database.execAsync("ALTER TABLE local_timers ADD COLUMN source TEXT NOT NULL DEFAULT 'server'");
  }
  await database.runAsync("UPDATE sync_outbox SET state='pending' WHERE state='inflight'");
  await database.runAsync(
    "INSERT INTO offline_meta(key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value='2'",
  );
  return database;
}

export function makeOfflineId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
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
}): Promise<LocalTask> {
  const db = await getDatabase();
  const task: LocalTask = {
    id: input.id ?? makeOfflineId(),
    title: input.title.trim(),
    status: input.status ?? "pending",
    priority: null,
    deadline_at: input.deadline_at ?? null,
    estimate_user_min: null,
    estimate_final_min: null,
    actual_min: 0,
    reschedule_count: 0,
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
  return getLocalTimers(userId);
}

export async function removeLocalTimer(userId: string, timerId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM local_timers WHERE user_id = ? AND id = ?", userId, timerId);
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
