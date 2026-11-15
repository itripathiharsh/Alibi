import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceOperations, calculateBackoff, SyncEngine } from '../dist/index.js';

test('coalesceOperations: multiple consecutive updates coalesce', () => {
  const ops = [
    {
      op_id: 'op-1',
      entity_type: 'task',
      entity_id: 'task-100',
      op_type: 'update',
      base_version: 1,
      payload: { title: 'First Update', status: 'pending' },
      client_ts: '2026-11-16T00:00:00Z',
      attempts: 0,
      state: 'pending',
    },
    {
      op_id: 'op-2',
      entity_type: 'task',
      entity_id: 'task-100',
      op_type: 'update',
      base_version: 2,
      payload: { title: 'Second Update', priority: 2 },
      client_ts: '2026-11-16T00:01:00Z',
      attempts: 0,
      state: 'pending',
    },
  ];

  const coalesced = coalesceOperations(ops);
  assert.equal(coalesced.length, 1);
  assert.equal(coalesced[0].base_version, 1); // Earliest base_version kept
  assert.equal(coalesced[0].payload.title, 'Second Update'); // Latest title
  assert.equal(coalesced[0].payload.status, 'pending'); // Preserved from op-1
  assert.equal(coalesced[0].payload.priority, 2); // Preserved from op-2
});

test('coalesceOperations: create then update coalesces into create', () => {
  const ops = [
    {
      op_id: 'op-1',
      entity_type: 'task',
      entity_id: 'task-200',
      op_type: 'create',
      base_version: null,
      payload: { title: 'Created Offline' },
      client_ts: '2026-11-16T00:00:00Z',
      attempts: 0,
      state: 'pending',
    },
    {
      op_id: 'op-2',
      entity_type: 'task',
      entity_id: 'task-200',
      op_type: 'update',
      base_version: 1,
      payload: { title: 'Edited Before Push' },
      client_ts: '2026-11-16T00:01:00Z',
      attempts: 0,
      state: 'pending',
    },
  ];

  const coalesced = coalesceOperations(ops);
  assert.equal(coalesced.length, 1);
  assert.equal(coalesced[0].op_type, 'create');
  assert.equal(coalesced[0].payload.title, 'Edited Before Push');
});

test('coalesceOperations: create then delete cancels out', () => {
  const ops = [
    {
      op_id: 'op-1',
      entity_type: 'task',
      entity_id: 'task-300',
      op_type: 'create',
      base_version: null,
      payload: { title: 'Ephemeral' },
      client_ts: '2026-11-16T00:00:00Z',
      attempts: 0,
      state: 'pending',
    },
    {
      op_id: 'op-2',
      entity_type: 'task',
      entity_id: 'task-300',
      op_type: 'delete',
      base_version: 1,
      payload: {},
      client_ts: '2026-11-16T00:01:00Z',
      attempts: 0,
      state: 'pending',
    },
  ];

  const coalesced = coalesceOperations(ops);
  assert.equal(coalesced.length, 0); // Completely dropped!
});

test('calculateBackoff: increases with attempts and stays within bounds', () => {
  const b0 = calculateBackoff(0, 2000, 300000, 0);
  const b1 = calculateBackoff(1, 2000, 300000, 0);
  const b2 = calculateBackoff(2, 2000, 300000, 0);
  assert.equal(b0, 2000);
  assert.equal(b1, 4000);
  assert.equal(b2, 8000);
});

test('SyncEngine: push and pull cycle', async () => {
  const pendingOps = [
    {
      op_id: 'op-test-1',
      entity_type: 'task',
      entity_id: 'task-test-1',
      op_type: 'create',
      base_version: null,
      payload: { title: 'Sync Task' },
      client_ts: '2026-11-16T00:00:00Z',
      attempts: 0,
      state: 'pending',
    },
  ];

  const completedOps = [];
  const appliedChanges = [];

  const mockAdapter = {
    async getPendingOps() {
      return [...pendingOps];
    },
    async markOpsInflight() {},
    async markOpsComplete(ids) {
      completedOps.push(...ids);
    },
    async markOpConflict() {},
    async markOpFailed() {},
    async getSyncState() {
      return { server_epoch: 'epoch-1', last_seq: 10, last_synced_at: null, in_progress: false };
    },
    async saveSyncState() {},
    async applyRemoteChanges(changes) {
      appliedChanges.push(...changes);
    },
  };

  const mockApi = {
    async push(ops) {
      return {
        results: ops.map((op) => ({
          op_id: op.op_id,
          result: 'applied',
          entity_id: op.entity_id,
        })),
      };
    },
    async pull(sinceSeq) {
      return {
        server_epoch: 'epoch-1',
        since_seq: sinceSeq,
        next_seq: sinceSeq + 5,
        changes: [{ entity_type: 'task', id: 'server-task-1', title: 'From Server' }],
      };
    },
    async bootstrap() {
      return { server_epoch: 'epoch-1', tasks: [], categories: [], projects: [], tags: [] };
    },
  };

  const engine = new SyncEngine(mockAdapter, mockApi);
  const { pushed, pulled } = await engine.syncCycle();

  assert.equal(pushed, 1);
  assert.equal(pulled, 1);
  assert.deepEqual(completedOps, ['op-test-1']);
  assert.equal(appliedChanges.length, 1);
});
