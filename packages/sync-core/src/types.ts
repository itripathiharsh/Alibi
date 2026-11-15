/**
 * Synchronization Protocol Types (doc 11 §4.1).
 */

export type SyncOpType = 'create' | 'update' | 'delete' | 'command';
export type SyncOpState = 'pending' | 'inflight' | 'done' | 'failed' | 'conflict';

export interface SyncOperation {
  op_id: string;
  entity_type: string;
  entity_id: string;
  op_type: SyncOpType;
  base_version: number | null;
  payload: Record<string, unknown>;
  field_base_versions?: Record<string, number>;
  command?: string | null;
  client_ts: string;
  attempts: number;
  state: SyncOpState;
  error?: string;
}

export interface SyncPushResult {
  op_id: string;
  result: 'applied' | 'duplicate' | 'merged' | 'conflict' | 'rejected';
  entity_id: string;
  new_version?: number;
  detail?: Record<string, unknown>;
}

export interface SyncState {
  server_epoch: string | null;
  last_seq: number;
  last_synced_at: string | null;
  in_progress: boolean;
}

export interface SyncStorageAdapter {
  getPendingOps(limit?: number): Promise<SyncOperation[]>;
  markOpsInflight(opIds: string[]): Promise<void>;
  markOpsComplete(opIds: string[]): Promise<void>;
  markOpConflict(opId: string, detail: Record<string, unknown>): Promise<void>;
  markOpFailed(opId: string, error: string): Promise<void>;
  getSyncState(): Promise<SyncState>;
  saveSyncState(state: Partial<SyncState>): Promise<void>;
  applyRemoteChanges(changes: unknown[]): Promise<void>;
}

export interface SyncApiClient {
  push(operations: SyncOperation[]): Promise<{ results: SyncPushResult[] }>;
  pull(sinceSeq: number, limit?: number): Promise<{
    server_epoch: string;
    since_seq: number;
    next_seq: number;
    changes: unknown[];
  }>;
  bootstrap(): Promise<{
    server_epoch: string;
    tasks: unknown[];
    categories: unknown[];
    projects: unknown[];
    tags: unknown[];
  }>;
}

