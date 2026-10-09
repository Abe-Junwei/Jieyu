import { describe, expect, it } from 'vitest';
import { evaluateCollaborationProtocolGuard } from './collaborationProtocolGuard';
import {
  classifyCollaborationServerRejection,
  isOutdatedClientRejection,
} from './collaborationServerRejection';

describe('classifyCollaborationServerRejection (rev5 9.2 / 9.3)', () => {
  it.each([
    ['JYDEL', 'project-deleted'],
    ['JYPRT', 'protocol-mismatch'],
    ['JYVER', 'client-version-too-old'],
    ['JYIMM', 'immutable-column'],
    ['JYOWN', 'owner-only'],
    ['JYNOP', 'unknown-project'],
  ])('maps SQLSTATE %s', (code, expected) => {
    expect(classifyCollaborationServerRejection({ code, message: 'x' })).toBe(expected);
  });

  it('falls back to the message marker and ignores unrelated errors', () => {
    expect(
      classifyCollaborationServerRejection({ message: 'JIEYU_CLIENT_TOO_OLD: 0.9.0 < 1.1.0' }),
    ).toBe('client-version-too-old');
    expect(classifyCollaborationServerRejection({ code: '42501', message: 'rls' })).toBeNull();
    expect(classifyCollaborationServerRejection(new Error('network'))).toBeNull();
    expect(classifyCollaborationServerRejection(null)).toBeNull();
  });

  it('only protocol / version rejections mean the client is outdated', () => {
    expect(isOutdatedClientRejection('protocol-mismatch')).toBe(true);
    expect(isOutdatedClientRejection('client-version-too-old')).toBe(true);
    expect(isOutdatedClientRejection('project-deleted')).toBe(false);
    expect(isOutdatedClientRejection(null)).toBe(false);
  });
});

describe('evaluateCollaborationProtocolGuard with a tombstone', () => {
  it('a tombstone disables writes even when protocol and version are fine', () => {
    expect(
      evaluateCollaborationProtocolGuard({
        protocolVersion: 1,
        appMinVersion: '0.0.1',
        deletedAt: '2026-10-09T00:00:00.000Z',
      }),
    ).toMatchObject({ cloudWritesDisabled: true, projectDeleted: true });
  });

  it('no tombstone keeps the previous shape', () => {
    const result = evaluateCollaborationProtocolGuard({
      protocolVersion: 1,
      appMinVersion: '0.0.1',
      deletedAt: null,
    });
    expect(result.projectDeleted).toBeUndefined();
  });
});
