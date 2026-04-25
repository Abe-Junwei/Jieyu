import { describe, expect, it } from 'vitest';
import { buildExtensionHealthSummary, resolveExtensionTrustDecision } from './extensionTrustGovernance';
import type { ExtensionManifestV1 } from './extensionRuntime';

function manifest(patch: Partial<ExtensionManifestV1> = {}): ExtensionManifestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'ext.test',
    name: 'Test Extension',
    version: '1.0.0',
    engine: { minHostVersion: '1.0.0' },
    capabilities: ['read.transcription'],
    entry: { activate: 'activate' },
    ...patch,
  };
}

describe('resolveExtensionTrustDecision', () => {
  it('preserves existing extension behavior when governance is disabled', () => {
    expect(resolveExtensionTrustDecision({
      enabled: false,
      manifest: manifest({ trustLevel: 'untrusted' }),
      capability: 'invoke.ai',
    })).toEqual({
      action: 'allow',
      reason: 'governance-disabled',
      trustLevel: 'untrusted',
    });
  });

  it('denies high-risk capabilities for low trust extensions', () => {
    expect(resolveExtensionTrustDecision({
      enabled: true,
      manifest: manifest({ trustLevel: 'community' }),
      capability: 'write.transcription',
    })).toEqual({
      action: 'deny',
      reason: 'trust-level-insufficient',
      trustLevel: 'community',
    });
  });

  it('allows trusted extensions to request high-risk declared capabilities', () => {
    expect(resolveExtensionTrustDecision({
      enabled: true,
      manifest: manifest({ trustLevel: 'trusted', capabilities: ['invoke.ai'] }),
      capability: 'invoke.ai',
    })).toMatchObject({
      action: 'allow',
      reason: 'trust-level-allowed',
    });
  });

  it('denies calls that exceed the quota profile', () => {
    expect(resolveExtensionTrustDecision({
      enabled: true,
      nowMs: 120_000,
      manifest: manifest({ trustLevel: 'official', quotaProfile: { maxCallsPerMinute: 2 } }),
      capability: 'read.transcription',
      recentInvocations: [
        { extensionId: 'ext.test', capability: 'read.transcription', timestampMs: 100_000, ok: true },
        { extensionId: 'ext.test', capability: 'read.transcription', timestampMs: 110_000, ok: true },
      ],
    })).toMatchObject({
      action: 'deny',
      reason: 'quota-exceeded',
    });
  });
});

describe('buildExtensionHealthSummary', () => {
  it('aggregates success rate, p95 duration, and deny reasons', () => {
    expect(buildExtensionHealthSummary([
      { extensionId: 'ext.alpha', capability: 'read.transcription', ok: true, durationMs: 10 },
      { extensionId: 'ext.alpha', capability: 'write.transcription', ok: false, durationMs: 40, denyReason: 'trust-level-insufficient' },
      { extensionId: 'ext.alpha', capability: 'invoke.ai', ok: false, durationMs: 30, errorMessage: 'timeout' },
    ])).toEqual([{
      extensionId: 'ext.alpha',
      totalCount: 3,
      successRate: 1 / 3,
      failureRate: 2 / 3,
      p95DurationMs: 40,
      denyReasonDistribution: {
        'trust-level-insufficient': 1,
        timeout: 1,
      },
    }]);
  });
});
