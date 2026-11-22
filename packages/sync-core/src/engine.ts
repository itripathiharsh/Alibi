import { coalesceOperations } from './coalesce.js';
import type {
  SyncApiClient,
  SyncOperation,
  SyncStorageAdapter,
} from './types.js';

/** Safety bound so a misbehaving server cannot keep one sync cycle running forever. */
const MAX_PULL_PAGES_PER_CYCLE = 50;

export class SyncEngine {
  private adapter: SyncStorageAdapter;
  private api: SyncApiClient;
  private isRunning: boolean = false;

  constructor(adapter: SyncStorageAdapter, api: SyncApiClient) {
    this.adapter = adapter;
    this.api = api;
  }

  /**
   * Run a full sync cycle: push local outbox then pull server changes (doc 11 §4.3).
   */
  async syncCycle(): Promise<{ pushed: number; pulled: number }> {
    if (this.isRunning) {
      return { pushed: 0, pulled: 0 };
    }
    this.isRunning = true;
    try {
      await this.adapter.saveSyncState({ in_progress: true });
      const pushed = await this.push();
      const pulled = await this.pull();
      await this.adapter.saveSyncState({
        in_progress: false,
        last_synced_at: new Date().toISOString(),
      });
      return { pushed, pulled };
    } finally {
      this.isRunning = false;
      await this.adapter.saveSyncState({ in_progress: false });
    }
  }

  /**
   * Push pending outbox operations to the server (doc 11 §4.2).
   */
  async push(): Promise<number> {
    const rawOps = await this.adapter.getPendingOps(200);
    if (rawOps.length === 0) {
      return 0;
    }

    const coalescedOps = coalesceOperations(rawOps);
    const opIds = coalescedOps.map((op) => op.op_id);
    await this.adapter.markOpsInflight(opIds);

    try {
      const response = await this.api.push(coalescedOps);
      const appliedOrDupIds: string[] = [];

      for (const res of response.results) {
        if (res.result === 'applied' || res.result === 'duplicate' || res.result === 'merged') {
          appliedOrDupIds.push(res.op_id);
        } else if (res.result === 'conflict') {
          await this.adapter.markOpConflict(res.op_id, res.detail ?? {});
        } else if (res.result === 'rejected') {
          await this.adapter.markOpFailed(res.op_id, JSON.stringify(res.detail ?? {}));
        }
      }

      if (appliedOrDupIds.length > 0) {
        await this.adapter.markOpsComplete(appliedOrDupIds);
      }

      return response.results.length;
    } catch (err) {
      // Revert inflight status or let backoff handle retry
      await this.adapter.markOpsRetryable(
        opIds,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /**
   * Pull server changes incrementally using sequence cursor (doc 11 §4.3).
   */
  async pull(): Promise<number> {
    const state = await this.adapter.getSyncState();
    const pullResult = await this.api.pull(state.last_seq);

    // Server epoch check (doc 11 §4.3 step 51):
    if (!state.server_epoch || state.server_epoch !== pullResult.server_epoch) {
      // Server was restored from backup! Trigger bootstrap re-sync while preserving local outbox
      const bootstrapData = await this.api.bootstrap();
      await this.adapter.applyRemoteChanges([
        ...(bootstrapData.tasks as Record<string, unknown>[]).map((item) => ({ ...item, entity_type: 'task' })),
        ...(bootstrapData.categories as Record<string, unknown>[]).map((item) => ({ ...item, entity_type: 'category' })),
        ...(bootstrapData.projects as Record<string, unknown>[]).map((item) => ({ ...item, entity_type: 'project' })),
        ...(bootstrapData.tags as Record<string, unknown>[]).map((item) => ({ ...item, entity_type: 'tag' })),
        ...((bootstrapData.notes ?? []) as Record<string, unknown>[]).map((item) => ({ ...item, entity_type: 'vault_note' })),
      ]);
      await this.adapter.saveSyncState({
        server_epoch: pullResult.server_epoch,
        last_seq: 0,
      });
      return pullResult.changes.length;
    }

    // Page through the server log until it reports no more rows. The cursor is saved after
    // each page, so an interrupted cycle resumes where it stopped and never skips changes.
    let page = pullResult;
    let pulled = 0;
    for (let pageCount = 0; pageCount < MAX_PULL_PAGES_PER_CYCLE; pageCount += 1) {
      if (page.changes.length > 0) {
        await this.adapter.applyRemoteChanges(page.changes);
        pulled += page.changes.length;
      }
      await this.adapter.saveSyncState({
        server_epoch: page.server_epoch,
        last_seq: page.next_seq,
      });
      if (!page.has_more || page.next_seq <= page.since_seq) break;
      page = await this.api.pull(page.next_seq);
    }

    return pulled;
  }
}

