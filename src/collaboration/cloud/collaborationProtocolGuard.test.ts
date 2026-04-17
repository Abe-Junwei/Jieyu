import { describe, expect, it } from 'vitest';
import {
  clientMeetsAppMinVersion,
  compareSemverCore,
  evaluateCollaborationProtocolGuard,
  SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
} from './collaborationProtocolGuard';

describe('compareSemverCore', () => {
  it('orders major.minor.patch lexicographically', () => {
    expect(compareSemverCore('1.0.0', '0.9.9')).toBe(1);
    expect(compareSemverCore('0.9.9', '1.0.0')).toBe(-1);
    expect(compareSemverCore('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemverCore('2.0.0', '10.0.0')).toBe(-1);
  });

  it('ignores prerelease tag on core comparison', () => {
    expect(compareSemverCore('1.0.0-beta', '1.0.0')).toBe(0);
  });

  it('returns null for empty input', () => {
    expect(compareSemverCore('', '1.0.0')).toBeNull();
    expect(compareSemverCore('1.0.0', '')).toBeNull();
  });
});

describe('clientMeetsAppMinVersion', () => {
  it('accepts equal or higher client versions', () => {
    expect(clientMeetsAppMinVersion('1.0.0', '1.0.0')).toBe(true);
    expect(clientMeetsAppMinVersion('1.0.1', '1.0.0')).toBe(true);
    expect(clientMeetsAppMinVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('rejects lower client versions', () => {
    expect(clientMeetsAppMinVersion('0.9.0', '1.0.0')).toBe(false);
  });
});

describe('evaluateCollaborationProtocolGuard', () => {
  it('allows all cloud writes when project row is absent', () => {
    const result = evaluateCollaborationProtocolGuard(null);
    expect(result.cloudWritesDisabled).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.outboundProtocolVersion).toBe(SUPPORTED_COLLABORATION_PROTOCOL_VERSION);
  });

  it('blocks when app min is above client (mocked via evaluation input)', () => {
    const result = evaluateCollaborationProtocolGuard({
      protocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
      appMinVersion: '100.0.0',
    });
    expect(result.cloudWritesDisabled).toBe(true);
    expect(result.reasons.some((r) => r.includes('below-required'))).toBe(true);
  });

  it('blocks when server protocol is newer than client', () => {
    const result = evaluateCollaborationProtocolGuard({
      protocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION + 1,
      appMinVersion: '0.0.1',
    });
    expect(result.cloudWritesDisabled).toBe(true);
    expect(result.reasons.some((r) => r.includes('exceeds-client'))).toBe(true);
  });

  it('blocks on protocol mismatch below supported', () => {
    const result = evaluateCollaborationProtocolGuard({
      protocolVersion: 0,
      appMinVersion: '0.0.1',
    });
    expect(result.cloudWritesDisabled).toBe(true);
    expect(result.reasons.some((r) => r.includes('mismatch-expected'))).toBe(true);
  });

  it('passes when protocol and semver gate succeed', () => {
    const result = evaluateCollaborationProtocolGuard({
      protocolVersion: SUPPORTED_COLLABORATION_PROTOCOL_VERSION,
      appMinVersion: '0.1.0',
    });
    expect(result.cloudWritesDisabled).toBe(false);
    expect(result.outboundProtocolVersion).toBe(SUPPORTED_COLLABORATION_PROTOCOL_VERSION);
  });
});
