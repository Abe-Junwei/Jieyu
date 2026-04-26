import type { ExtensionCapability, ExtensionCapabilityAuditPayload, ExtensionManifestV1, ExtensionTrustLevel } from './extensionRuntime';

export type ExtensionTrustDecisionReason =
  | 'governance-disabled'
  | 'trust-level-allowed'
  | 'trust-level-insufficient'
  | 'quota-exceeded';

export interface ExtensionTrustDecision {
  action: 'allow' | 'deny';
  reason: ExtensionTrustDecisionReason;
  trustLevel: ExtensionTrustLevel;
}

export interface ExtensionInvocationRecord {
  extensionId: string;
  capability: ExtensionCapability;
  timestampMs: number;
  ok: boolean;
}

const HIGH_RISK_CAPABILITIES = new Set<ExtensionCapability>([
  'write.transcription',
  'write.language-assets',
  'invoke.ai',
]);

function resolveTrustLevel(manifest: ExtensionManifestV1): ExtensionTrustLevel {
  return manifest.trustLevel ?? 'official';
}

function trustAllowsCapability(trustLevel: ExtensionTrustLevel, capability: ExtensionCapability): boolean {
  if (!HIGH_RISK_CAPABILITIES.has(capability)) return true;
  return trustLevel === 'official' || trustLevel === 'trusted';
}

export function resolveExtensionTrustDecision(input: {
  enabled: boolean;
  manifest: ExtensionManifestV1;
  capability: ExtensionCapability;
  recentInvocations?: readonly ExtensionInvocationRecord[];
  nowMs?: number;
}): ExtensionTrustDecision {
  const trustLevel = resolveTrustLevel(input.manifest);
  if (!input.enabled) return { action: 'allow', reason: 'governance-disabled', trustLevel };
  if (!trustAllowsCapability(trustLevel, input.capability)) {
    return { action: 'deny', reason: 'trust-level-insufficient', trustLevel };
  }
  const maxCallsPerMinute = input.manifest.quotaProfile?.maxCallsPerMinute;
  if (typeof maxCallsPerMinute === 'number' && Number.isFinite(maxCallsPerMinute) && maxCallsPerMinute >= 0) {
    const nowMs = input.nowMs ?? Date.now();
    const recentCount = (input.recentInvocations ?? []).filter((row) =>
      row.extensionId === input.manifest.id
      && row.capability === input.capability
      && nowMs - row.timestampMs < 60_000,
    ).length;
    if (recentCount >= Math.floor(maxCallsPerMinute)) {
      return { action: 'deny', reason: 'quota-exceeded', trustLevel };
    }
  }
  return { action: 'allow', reason: 'trust-level-allowed', trustLevel };
}

export interface ExtensionHealthSummary {
  extensionId: string;
  totalCount: number;
  successRate: number;
  failureRate: number;
  p95DurationMs: number;
  denyReasonDistribution: Record<string, number>;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

export function buildExtensionHealthSummary(rows: readonly ExtensionCapabilityAuditPayload[]): ExtensionHealthSummary[] {
  const grouped = new Map<string, ExtensionCapabilityAuditPayload[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.extensionId) ?? [];
    bucket.push(row);
    grouped.set(row.extensionId, bucket);
  }
  return Array.from(grouped.entries()).map(([extensionId, bucket]) => {
    const totalCount = bucket.length;
    const successCount = bucket.filter((row) => row.ok).length;
    const denyReasonDistribution: Record<string, number> = {};
    for (const row of bucket) {
      const reason = row.denyReason ?? (!row.ok && row.errorMessage ? row.errorMessage : '');
      if (!reason) continue;
      denyReasonDistribution[reason] = (denyReasonDistribution[reason] ?? 0) + 1;
    }
    return {
      extensionId,
      totalCount,
      successRate: totalCount > 0 ? successCount / totalCount : 0,
      failureRate: totalCount > 0 ? (totalCount - successCount) / totalCount : 0,
      p95DurationMs: percentile(bucket.map((row) => row.durationMs), 0.95),
      denyReasonDistribution,
    };
  }).sort((a, b) => a.extensionId.localeCompare(b.extensionId));
}
