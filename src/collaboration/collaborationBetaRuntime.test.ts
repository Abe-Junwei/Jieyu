import { describe, expect, it } from 'vitest';

import type { CollaborationRecord } from './collaborationConflictRuntime';
import {
  applyMultiLayerBatchEdits,
  buildCollaboratorHints,
  createStabilityValidationLog,
  evaluateContinuousEditingStability,
  planBatchProcessing,
  type LayerEditOperation,
  type LayerObjectState,
} from './collaborationBetaRuntime';

function buildObjectState(overrides?: Partial<LayerObjectState>): LayerObjectState {
  return {
    layerId: 'transcription-main',
    objectId: 'segment:001',
    version: 1,
    updatedAt: 1_710_000_000_000,
    fields: {
      text: 'hello',
      reviewed: false,
    },
    lastActorId: 'editor-a',
    lastSessionId: 'session-a',
    ...overrides,
  };
}

function buildOperation(overrides?: Partial<LayerEditOperation>): LayerEditOperation {
  return {
    layerId: 'transcription-main',
    objectId: 'segment:001',
    actorId: 'editor-a',
    sessionId: 'session-a',
    editedAt: 1_710_000_001_000,
    baseVersion: 1,
    patch: {
      text: 'hello updated',
    },
    ...overrides,
  };
}

function buildRecord(overrides?: Partial<CollaborationRecord>): CollaborationRecord {
  return {
    entityId: 'segment:001',
    sessionId: 'session-a',
    version: 2,
    updatedAt: 1_710_000_002_000,
    fields: {
      text: 'hello updated',
      reviewed: true,
    },
    ...overrides,
  };
}

describe('collaboration beta runtime', () => {
  it('[multi-layer] applies edits across layers with deterministic ordering', () => {
    const base = [buildObjectState()];
    const operations: LayerEditOperation[] = [
      buildOperation({
        layerId: 'translation-en',
        objectId: 'segment:010',
        actorId: 'editor-b',
        sessionId: 'session-b',
        editedAt: 1_710_000_001_500,
        baseVersion: 0,
        patch: { text: 'translated' },
      }),
      buildOperation({
        layerId: 'transcription-main',
        objectId: 'segment:001',
        editedAt: 1_710_000_001_200,
        patch: { text: 'hello world' },
      }),
    ];

    const result = applyMultiLayerBatchEdits(base, operations);
    expect(result.appliedCount).toBe(2);
    expect(result.unresolvedTickets).toHaveLength(0);
    expect(result.objects.map((item) => `${item.layerId}:${item.objectId}`)).toEqual([
      'transcription-main:segment:001',
      'translation-en:segment:010',
    ]);
  });

  it('[multi-layer] records arbitration logs when overlapping concurrent edits occur', () => {
    const base = [buildObjectState()];
    const operations: LayerEditOperation[] = [
      buildOperation({
        actorId: 'editor-b',
        sessionId: 'session-b',
        editedAt: 1_710_000_000_500,
        baseVersion: 0,
      }),
    ];

    const result = applyMultiLayerBatchEdits(base, operations);
    expect(result.operationLogs.some((item) => item.type === 'arbitration_requested')).toBe(true);
    expect(result.operationLogs.some((item) => item.type === 'arbitration_decided')).toBe(true);
  });

  it('[perf] plans processing chunks to meet frame budget', () => {
    const plan = planBatchProcessing(120, [0.5, 0.8, 1, 1.2, 1.5], 16);
    expect(plan.chunkSize).toBeGreaterThan(0);
    expect(plan.chunkCount).toBeGreaterThan(0);
    expect(plan.meetsFrameBudget).toBe(true);
  });

  it('[hint] summarizes collaborator changes by actor and layer', () => {
    const operations: LayerEditOperation[] = [
      buildOperation({ actorId: 'editor-a', layerId: 'transcription-main', objectId: 'segment:001', editedAt: 2_000 }),
      buildOperation({ actorId: 'editor-a', layerId: 'transcription-main', objectId: 'segment:002', editedAt: 2_100 }),
      buildOperation({ actorId: 'editor-b', layerId: 'translation-en', objectId: 'segment:001', editedAt: 2_200 }),
    ];

    const hints = buildCollaboratorHints(operations, 3_000);
    expect(hints[0]?.actorId).toBe('editor-b');
    expect(hints.some((item) => item.actorId === 'editor-a' && item.objectCount === 2)).toBe(true);
  });

  it('[stability] marks continuous editing as stable when snapshots stay consistent', () => {
    const baseline = [buildRecord()];
    const snapshots = [[buildRecord({ sessionId: 'session-b' })]];

    const result = evaluateContinuousEditingStability(baseline, snapshots);
    expect(result.stable).toBe(true);
    expect(result.brokenObjectCount).toBe(0);

    const log = createStabilityValidationLog('segment:001', 'session-a', result, 9_001);
    expect(log.type).toBe('reconnect_validated');
  });

  it('[stability] treats duplicate entity snapshots as structural damage', () => {
    const baseline = [buildRecord()];
    const snapshots = [[
      buildRecord({ sessionId: 'session-a' }),
      buildRecord({ sessionId: 'session-b' }),
    ]];

    const result = evaluateContinuousEditingStability(baseline, snapshots);
    expect(result.stable).toBe(false);
    expect(result.structuralDamageCount).toBeGreaterThan(0);
  });

  it('[stability] flags malformed snapshots as unstable', () => {
    const baseline = [buildRecord()];
    const snapshots = [[{ ...buildRecord(), entityId: null } as unknown as CollaborationRecord]];

    const result = evaluateContinuousEditingStability(baseline, snapshots);
    expect(result.stable).toBe(false);
    expect(result.structuralDamageCount).toBeGreaterThan(0);
  });
});
