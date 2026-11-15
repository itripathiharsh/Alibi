import type { SyncOperation } from './types.js';

/**
 * Coalesce consecutive operations for the same entity in the outbox (doc 11 §4.1).
 *
 * Rules:
 * 1. Multiple consecutive 'update' ops on the same entity are merged:
 *    - Base version is preserved from the earliest update.
 *    - Payloads are shallow merged (later updates overwrite earlier fields).
 *    - field_base_versions preserved appropriately.
 * 2. 'create' followed by 'update' on the same entity merges payload directly into 'create'.
 * 3. 'create' followed by 'delete' drops both operations (transient item never hit server).
 */
export function coalesceOperations(operations: SyncOperation[]): SyncOperation[] {
  if (operations.length <= 1) {
    return operations;
  }

  const result: SyncOperation[] = [];

  for (const op of operations) {
    const prevIndex = result.findIndex(
      (existing) =>
        existing.entity_type === op.entity_type &&
        existing.entity_id === op.entity_id
    );

    if (prevIndex === -1) {
      result.push({ ...op, payload: { ...op.payload } });
      continue;
    }

    const prev = result[prevIndex];

    // Case 1: create + update -> merge into create
    if (prev.op_type === 'create' && op.op_type === 'update') {
      prev.payload = { ...prev.payload, ...op.payload };
      prev.client_ts = op.client_ts;
      continue;
    }

    // Case 2: create + delete -> drop both entirely
    if (prev.op_type === 'create' && op.op_type === 'delete') {
      result.splice(prevIndex, 1);
      continue;
    }

    // Case 3: update + update -> merge into single update
    if (prev.op_type === 'update' && op.op_type === 'update') {
      prev.payload = { ...prev.payload, ...op.payload };
      prev.client_ts = op.client_ts;
      // keep earliest base_version
      continue;
    }

    // Case 4: update + delete -> turn into delete (preserving update's base_version)
    if (prev.op_type === 'update' && op.op_type === 'delete') {
      prev.op_type = 'delete';
      prev.payload = {};
      prev.client_ts = op.client_ts;
      continue;
    }

    // Fallback: append if non-mergeable transition
    result.push({ ...op, payload: { ...op.payload } });
  }

  return result;
}
