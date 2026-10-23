import { describe, expect, it, vi } from 'vitest';
import type { CollaborationRecord } from '../collaborationConflictRuntime';
import { applyCollaborationInboundChange } from './collaborationInboundChangeApplier';
import type { CollaborationProjectChangeRecord } from './syncTypes';

function makeRemoteChange(
  value: string,
  createdAtMs: number,
): CollaborationProjectChangeRecord {
  return {
    id: `change-${value}`,
    projectId: 'project-1',
    actorId: 'remote-user',
    clientId: 'remote-client',
    clientOpId: `op-${value}`,
    protocolVersion: 1,
    projectRevision: 12,
    baseRevision: 11,
    entityType: 'layer_unit_content',
    entityId: 'u-1',
    opType: 'upsert_unit_content',
    payload: { unitId: 'u-1', value },
    sourceKind: 'user',
    createdAt: new Date(createdAtMs).toISOString(),
  };
}

function makeChange(
  overrides: Partial<CollaborationProjectChangeRecord> = {},
): CollaborationProjectChangeRecord {
  return {
    id: 'ch-1',
    projectId: 'project-1',
    actorId: 'remote-user',
    clientId: 'remote-client',
    clientOpId: 'op-1',
    protocolVersion: 1,
    projectRevision: 12,
    baseRevision: 11,
    entityType: 'layer_unit_content',
    entityId: 'u-1',
    opType: 'upsert_unit_content',
    payload: { unitId: 'u-1', value: 'remote' },
    sourceKind: 'user',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLocalRecord(value: string, updatedAtMs: number): CollaborationRecord {
  return {
    entityId: 'u-1',
    sessionId: 'local-session',
    version: 5,
    updatedAt: updatedAtMs,
    fields: {
      entityType: 'layer_unit_content',
      unitId: 'u-1',
      value,
      text: value,
    },
  };
}

function makeRecord(sessionId: string, value: string, updatedAt: number): CollaborationRecord {
  return {
    entityId: 'u-1',
    sessionId,
    version: 1,
    updatedAt,
    fields: { text: value },
  };
}

describe('applyCollaborationInboundChange (#364 LWW write path)', () => {
  it('LWW 选本地时不写远端、不删 shadow | local win skips remote mutation and keeps shadow', async () => {
    const now = Date.UTC(2026, 9, 23, 1, 0, 0);
    const applyRemoteMutation = vi.fn(async () => true);
    const deleteLocalShadow = vi.fn();
    const appendConflictLogs = vi.fn();
    const enqueueConflictReviewTicket = vi.fn();
    const localRecord = makeLocalRecord('new local', now);

    const result = await applyCollaborationInboundChange(
      makeRemoteChange('old remote', now - 10_000),
      undefined,
      {
        applyRemoteMutation,
        resolveLocalConflictRecord: () => localRecord,
        appendConflictLogs,
        enqueueConflictReviewTicket,
        deleteLocalShadow,
      },
    );

    expect(enqueueConflictReviewTicket).not.toHaveBeenCalled();
    expect(applyRemoteMutation).not.toHaveBeenCalled();
    expect(deleteLocalShadow).not.toHaveBeenCalled();
    expect(appendConflictLogs.mock.calls.flat(2).some((log) => log.type === 'conflict_resolved')).toBe(
      true,
    );
    expect(result.commitRevision).toBe(true);
  });

  it('LWW 选远端时仍应用远端并清 shadow | remote win applies mutation and clears shadow', async () => {
    const now = Date.UTC(2026, 9, 23, 1, 0, 0);
    const applyRemoteMutation = vi.fn(async () => true);
    const deleteLocalShadow = vi.fn();
    const appendConflictLogs = vi.fn();
    const localRecord = makeLocalRecord('old local', now - 10_000);

    const result = await applyCollaborationInboundChange(makeRemoteChange('new remote', now), undefined, {
      applyRemoteMutation,
      resolveLocalConflictRecord: () => localRecord,
      appendConflictLogs,
      enqueueConflictReviewTicket: vi.fn(),
      deleteLocalShadow,
    });

    expect(applyRemoteMutation).toHaveBeenCalledTimes(1);
    expect(deleteLocalShadow).toHaveBeenCalledTimes(1);
    expect(appendConflictLogs.mock.calls.flat(2).some((log) => log.type === 'conflict_resolved')).toBe(
      true,
    );
    expect(result.commitRevision).toBe(true);
  });
});

describe('applyCollaborationInboundChange #363', () => {
  it('returns commitRevision:false when parked for manual-review', async () => {
    const now = Date.now();
    const applyRemoteMutation = vi.fn(async () => true);
    const enqueueConflictReviewTicket = vi.fn();
    const appendConflictLogs = vi.fn();

    const result = await applyCollaborationInboundChange(makeChange(), undefined, {
      applyRemoteMutation,
      resolveLocalConflictRecord: () => makeRecord('local-session', 'local', now),
      appendConflictLogs,
      enqueueConflictReviewTicket,
      deleteLocalShadow: vi.fn(),
    });

    expect(enqueueConflictReviewTicket).toHaveBeenCalledTimes(1);
    expect(applyRemoteMutation).not.toHaveBeenCalled();
    expect(result.commitRevision).toBe(false);
  });

  it('returns commitRevision:true after a successful apply without manual review', async () => {
    const applyRemoteMutation = vi.fn(async () => true);
    const result = await applyCollaborationInboundChange(
      makeChange(),
      { skipConflictGovernance: true },
      {
        applyRemoteMutation,
        resolveLocalConflictRecord: () => makeRecord('local', 'x', Date.now()),
        appendConflictLogs: vi.fn(),
        enqueueConflictReviewTicket: vi.fn(),
        deleteLocalShadow: vi.fn(),
      },
    );

    expect(applyRemoteMutation).toHaveBeenCalledTimes(1);
    expect(result.commitRevision).toBe(true);
  });
});
