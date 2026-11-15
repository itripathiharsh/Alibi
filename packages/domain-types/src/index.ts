/**
 * ALIBI Shared Domain Types
 * Used across @alibi/api-client, apps/web, and apps/mobile.
 */

export type UUIDv7 = string;

export type RuntimeMode = "local" | "hosted";
export type Environment = "local" | "cloud" | "test";

export interface SyncableFields {
  id: UUIDv7;
  version: number;
  server_seq?: number;
  deleted_at?: string | null;
  field_versions?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskCategory = "professional" | "academic" | "personal" | "learning";

export interface Task extends SyncableFields {
  user_id: UUIDv7;
  title: string;
  notes?: string | null;
  status: TaskStatus;
  category: TaskCategory;
  priority: TaskPriority;
  estimate_minutes?: number | null;
  actual_minutes?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  deadline?: string | null;
  completed_at?: string | null;
  project_id?: UUIDv7 | null;
  parent_id?: UUIDv7 | null;
}

export interface AppMeta {
  name: string;
  version: string;
  environment: Environment;
  mode: RuntimeMode;
  timestamp: string;
  timezone: string;
}

export interface RFC7807Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  invalid_params?: Array<{
    name: string;
    reason: string;
  }>;
}

export interface User {
  id: UUIDv7;
  email: string;
  timezone: string;
  created_at: string;
}

export interface Device {
  id: UUIDv7;
  user_id: UUIDv7;
  device_name: string;
  platform: "android" | "web" | "desktop";
  last_seen_at: string;
}

export interface ProductivityScore {
  score: number;
  completion_rate: number;
  on_time_rate: number;
  estimate_accuracy: number;
  period_start: string;
  period_end: string;
}
