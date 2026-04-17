import { describe, expect, it } from 'vitest';

import { computeCollaborationDigest, createConflictResolutionLog, detectCollaborationConflicts, duplicateResolvedRecord, evaluateResolutionConsistency, resolveCollaborationConflicts, type CollaborationRecord } from './collaborationConflictRuntime';

function buildRecord(overrides?: Partial<CollaborationRecord>): CollaborationRecord {
  return {
    entityId: 'segment:001',
    sessionId: 'session-A',
    version: 3,
    updatedAt: 1_710_000_000_000,
    fields: {
      text: 'hello',
      confidence: 0.91,
      reviewed: false,
    },
    ...overrides,
  };
}

describe('collaboration conflict runtime', () => {
  it('[detect] detects field-level divergence for same entity', () => {
    const local = buildRecord();
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: local.updatedAt + 8_000,
      fields: {
        ...local.fields,
        text: 'hello world',
      },
    });

    const result = detectCollaborationConflicts(local, remote, { stage: 'async' });
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.some((item) => item.scope === 'field' && item.fieldKey === 'text')).toBe(true);
  });

  it('[detect] detects entity-level delete-update conflict', () => {
    const local = buildRecord({ deleted: true, fields: {} });
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: local.updatedAt + 10,
      fields: {
        text: 'still editing',
        confidence: 0.7,
        reviewed: false,
      },
    });

    const result = detectCollaborationConflicts(local, remote, { stage: 'cross-device' });
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.some((item) => item.scope === 'entity' && item.code === 'delete-update')).toBe(true);
  });

  it('[detect] detects session overlap conflict in realtime stage', () => {
    const local = buildRecord({ updatedAt: 1_000, sessionId: 'session-A' });
    const remote = buildRecord({ updatedAt: 1_400, sessionId: 'session-B' });

    const result = detectCollaborationConflicts(local, remote, {
      stage: 'same-device-realtime',
      sessionOverlapWindowMs: 500,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.some((item) => item.scope === 'session' && item.code === 'session-concurrency-overlap')).toBe(true);
  });

  it('[detect] treats missing field and explicit null as divergent', () => {
    const local = buildRecord({
      fields: {},
      sessionId: 'session-A',
      updatedAt: 1_000,
    });
    const remote = buildRecord({
      fields: { text: null },
      sessionId: 'session-B',
      updatedAt: 2_000,
    });

    const result = detectCollaborationConflicts(local, remote, { stage: 'async' });
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.some((item) => item.scope === 'field' && item.fieldKey === 'text')).toBe(true);
  });

  it('[resolve] resolves with deterministic digest under last-write-wins', () => {
    const local = buildRecord({ updatedAt: 2_000 });
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: 2_050,
      version: 4,
      fields: {
        ...local.fields,
        text: 'hello merged',
        reviewed: true,
      },
    });

    const resolution = resolveCollaborationConflicts(local, remote, { stage: 'cross-device' }, 'last-write-wins');
    expect(resolution.resolved).toBe(true);
    expect(resolution.requiresManual).toBe(false);
    expect(resolution.resolvedRecord?.fields.text).toBe('hello merged');
    expect(resolution.resolutionTraceId).toMatch(/^tr-/);

    const digest = computeCollaborationDigest(resolution.resolvedRecord as CollaborationRecord);
    expect(digest).toBe(resolution.consistencyDigest);
  });

  it('[resolve] marks manual-review strategy as unresolved when conflicts exist', () => {
    const local = buildRecord({ deleted: true, fields: {} });
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: local.updatedAt + 2,
      fields: {
        text: 'keep editing',
        confidence: 0.5,
        reviewed: false,
      },
    });

    const resolution = resolveCollaborationConflicts(local, remote, { stage: 'cross-device' }, 'manual-review');
    expect(resolution.resolved).toBe(false);
    expect(resolution.requiresManual).toBe(true);
    expect(resolution.resolvedRecord).toBeNull();
  });

  it('[rc] keeps resolved replicas digest-consistent across copies', () => {
    const local = buildRecord({ updatedAt: 3_000, fields: { text: 'v1', confidence: 0.4, reviewed: false } });
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: 3_500,
      fields: { text: 'v2', confidence: 0.8, reviewed: true },
    });

    const resolution = resolveCollaborationConflicts(local, remote, { stage: 'cross-device' }, 'last-write-wins');
    const resolved = resolution.resolvedRecord as CollaborationRecord;
    const replicaA = duplicateResolvedRecord(resolved);
    const replicaB = duplicateResolvedRecord(resolved);

    const consistency = evaluateResolutionConsistency(resolved, [replicaA, replicaB]);
    expect(consistency.consistent).toBe(true);
    expect(consistency.mismatchCount).toBe(0);
  });

  it('[oplog] creates structured operation log for resolved conflicts', () => {
    const record = buildRecord({ version: 5, updatedAt: 4_000 });
    const log = createConflictResolutionLog(
      record,
      'last-write-wins',
      [{ scope: 'field', code: 'field-value-diverged', fieldKey: 'text', message: 'Field value diverged on text.' }],
      4_001,
    );

    expect(log.type).toBe('conflict_resolved');
    expect(log.entityId).toBe(record.entityId);
    expect(log.sessionId).toBe(record.sessionId);
    expect(log.at).toBe(4_001);
    expect(log.payloadDigest.length).toBeGreaterThan(0);
  });

  it('[oplog] populates audit fields (strategy, conflictCodes, decisionId)', () => {
    const record = buildRecord({ version: 6, updatedAt: 5_000 });
    const log = createConflictResolutionLog(
      record,
      'last-write-wins',
      [
        { scope: 'field', code: 'field-value-diverged', fieldKey: 'text', message: 'diverged' },
        { scope: 'session', code: 'stale-base-version', message: 'stale' },
      ],
      5_001,
      'arb_abc12345',
    );

    expect(log.strategy).toBe('last-write-wins');
    expect(log.conflictCodes).toEqual(['field:field-value-diverged:text', 'session:stale-base-version:*']);
    expect(log.decisionId).toBe('arb_abc12345');
  });

  it('[oplog] omits decisionId when not provided', () => {
    const record = buildRecord({ version: 7, updatedAt: 6_000 });
    const log = createConflictResolutionLog(
      record,
      'last-write-wins',
      [{ scope: 'field', code: 'field-value-diverged', fieldKey: 'confidence', message: 'diverged' }],
      6_001,
    );

    expect(log.strategy).toBe('last-write-wins');
    expect(log.conflictCodes).toEqual(['field:field-value-diverged:confidence']);
    expect(log.decisionId).toBeUndefined();
  });

  it('[oplog] carries traceId when provided', () => {
    const record = buildRecord({ version: 8, updatedAt: 7_000 });
    const log = createConflictResolutionLog(
      record,
      'last-write-wins',
      [{ scope: 'field', code: 'field-value-diverged', fieldKey: 'text', message: 'diverged' }],
      7_001,
      'decision-xyz',
      'tr-test-trace-id',
    );

    expect(log.traceId).toBe('tr-test-trace-id');
  });

  it('[resolve] omits resolutionTraceId when manual review is required', () => {
    const local = buildRecord({ updatedAt: 2_000 });
    const remote = buildRecord({
      sessionId: 'session-B',
      updatedAt: 2_050,
      version: 4,
      fields: {
        ...local.fields,
        text: 'hello merged',
        reviewed: true,
      },
    });

    const resolution = resolveCollaborationConflicts(local, remote, { stage: 'cross-device' }, 'manual-review');
    expect(resolution.resolved).toBe(false);
    expect(resolution.resolutionTraceId).toBeUndefined();
  });
});
