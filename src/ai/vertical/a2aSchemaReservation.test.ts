import { describe, expect, it } from 'vitest';
import { verifyA2aSchemaReservation } from './a2aSchemaReservation';

describe('verifyA2aSchemaReservation', () => {
  it('returns true for a valid reservation', () => {
    const reservation = {
      agentRoles: [
        { roleId: 'r1', displayName: 'Annotator', capabilities: ['read'], inputSchema: {}, outputSchema: {} },
      ],
      taskReservations: [
        { taskId: 't1', agentRoleId: 'r1', status: 'pending' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(verifyA2aSchemaReservation(reservation)).toBe(true);
  });

  it('returns false for null', () => {
    expect(verifyA2aSchemaReservation(null as unknown as { agentRoles: []; taskReservations: [] })).toBe(false);
  });

  it('returns false when agentRoles is not an array', () => {
    expect(verifyA2aSchemaReservation({ agentRoles: 'bad', taskReservations: [] } as unknown as { agentRoles: []; taskReservations: [] })).toBe(false);
  });

  it('returns false when taskReservations is not an array', () => {
    expect(verifyA2aSchemaReservation({ agentRoles: [], taskReservations: 'bad' } as unknown as { agentRoles: []; taskReservations: [] })).toBe(false);
  });

  it('returns false for invalid role (missing roleId)', () => {
    expect(verifyA2aSchemaReservation({
      agentRoles: [{ roleId: '', displayName: 'X', capabilities: [], inputSchema: {}, outputSchema: {} }],
      taskReservations: [],
    })).toBe(false);
  });

  it('returns false for invalid task status', () => {
    expect(verifyA2aSchemaReservation({
      agentRoles: [],
      taskReservations: [{ taskId: 't1', agentRoleId: 'r1', status: 'unknown' as never, createdAt: '', updatedAt: '' }],
    })).toBe(false);
  });
});
