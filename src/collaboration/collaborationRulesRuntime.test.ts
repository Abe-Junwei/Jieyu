import { describe, expect, it } from 'vitest';

import { duplicateResolvedRecord, type CollaborationRecord, type ConflictDescriptor } from './collaborationConflictRuntime';
import {
  appendOperationLog,
  createReconnectValidationLog,
  openArbitrationTicket,
  prioritizeConflicts,
  toArbitrationOperationLogs,
  validateReconnectConsistency,
} from './collaborationRulesRuntime';

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

function buildConflict(overrides?: Partial<ConflictDescriptor>): ConflictDescriptor {
  return {
    scope: 'field',
    code: 'field-value-diverged',
    message: 'Field value diverged.',
    ...overrides,
  };
}

describe('collaboration rules runtime', () => {
  it('[priority] prioritizes entity and session conflicts ahead of field conflicts', () => {
    const conflicts: ConflictDescriptor[] = [
      buildConflict({ scope: 'field', code: 'field-value-diverged', fieldKey: 'text' }),
      buildConflict({ scope: 'session', code: 'session-concurrency-overlap' }),
      buildConflict({ scope: 'entity', code: 'delete-update' }),
    ];

    const prioritized = prioritizeConflicts(conflicts);
    expect(prioritized.map((item) => item.priority)).toEqual(['critical', 'high', 'medium']);
    expect(prioritized[0]!.conflict.code).toBe('delete-update');
  });

  it('[priority] treats entity-id-mismatch as critical even when scope is session', () => {
    const conflicts: ConflictDescriptor[] = [
      buildConflict({ scope: 'session', code: 'entity-id-mismatch' }),
      buildConflict({ scope: 'field', code: 'field-value-diverged', fieldKey: 'confidence' }),
    ];

    const prioritized = prioritizeConflicts(conflicts);
    expect(prioritized[0]!.priority).toBe('critical');
    expect(prioritized[0]!.conflict.code).toBe('entity-id-mismatch');
  });

  it('[arbitration] escalates to manual-review when critical conflicts exist', () => {
    const ticket = openArbitrationTicket({
      entityId: 'segment:001',
      operatorId: 'reviewer-1',
      localSessionId: 'session-A',
      remoteSessionId: 'session-B',
      conflicts: [buildConflict({ scope: 'entity', code: 'delete-update' })],
      preferredStrategy: 'last-write-wins',
      at: 1_234,
    });

    expect(ticket.ticketId.startsWith('arb_')).toBe(true);
    expect(ticket.decision.selectedStrategy).toBe('manual-review');
    expect(ticket.decision.accepted).toBe(false);

    const logs = toArbitrationOperationLogs(ticket);
    expect(logs).toHaveLength(2);
    expect(logs[0]!.type).toBe('arbitration_requested');
    expect(logs[1]!.type).toBe('arbitration_decided');
  });

  it('[arbitration] appends operation logs in chronological order', () => {
    const existing = [
      {
        logId: 'log-late',
        type: 'arbitration_requested' as const,
        entityId: 'segment:001',
        sessionId: 'session-A',
        at: 20,
        payloadDigest: 'x',
      },
    ];

    const merged = appendOperationLog(existing, {
      logId: 'log-early',
      type: 'arbitration_decided',
      entityId: 'segment:001',
      sessionId: 'session-A',
      at: 10,
      payloadDigest: 'y',
    });

    expect(merged.map((item) => item.logId)).toEqual(['log-early', 'log-late']);
  });

  it('[reconnect] validates consistency after reconnect for structurally valid replicas', () => {
    const resolved = buildRecord();
    const replicaA = duplicateResolvedRecord(resolved);
    const replicaB = duplicateResolvedRecord(resolved);

    const result = validateReconnectConsistency(resolved, [replicaA, replicaB]);
    expect(result.hasStructuralDamage).toBe(false);
    expect(result.consistent).toBe(true);
    expect(result.mismatchCount).toBe(0);

    const log = createReconnectValidationLog(resolved.entityId, resolved.sessionId, result, 9_999);
    expect(log.type).toBe('reconnect_validated');
    expect(log.payloadDigest.length).toBeGreaterThan(0);
  });

  it('[reconnect] marks malformed replicas as structural damage', () => {
    const resolved = buildRecord();
    const malformedReplica = {
      ...buildRecord({ sessionId: 'session-B' }),
      fields: {
        text: undefined,
      },
    } as unknown as CollaborationRecord;

    const result = validateReconnectConsistency(resolved, [malformedReplica]);
    expect(result.hasStructuralDamage).toBe(true);
    expect(result.consistent).toBe(false);
  });

  it('[reconnect] marks non-string identity fields as structural damage', () => {
    const resolved = buildRecord();
    const malformedReplica = {
      ...buildRecord({ sessionId: 'session-B' }),
      entityId: null,
    } as unknown as CollaborationRecord;

    const result = validateReconnectConsistency(resolved, [malformedReplica]);
    expect(result.hasStructuralDamage).toBe(true);
    expect(result.consistent).toBe(false);
  });
});
