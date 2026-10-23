import { describe, expect, it, vi } from 'vitest';
import { applyCollaborationInboundChange } from './collaborationInboundChangeApplier';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import type { CollaborationRecord } from '../../collaboration/collaborationConflictRuntime';

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

function makeRecord(sessionId: string, value: string, updatedAt: number): CollaborationRecord {
  return {
    entityId: 'u-1',
    sessionId,
    version: 1,
    updatedAt,
    fields: { text: value },
  };
}

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
