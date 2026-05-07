import type { EvidencePacketV0 } from './evidencePacket';

export interface SourceScopeSummary {
  evidenceCount: number;
  sourceTypeBreakdown: Record<string, number>;
  scopeLabel: string;
}

export function buildSourceScopeSummaryFromEvidencePackets(
  packets: readonly EvidencePacketV0[],
): SourceScopeSummary {
  const sourceTypeBreakdown: Record<string, number> = {};
  for (const packet of packets) {
    const type = packet.sourceType ?? 'unknown';
    sourceTypeBreakdown[type] = (sourceTypeBreakdown[type] ?? 0) + 1;
  }

  const types = Object.keys(sourceTypeBreakdown);
  let scopeLabel: string;
  if (types.length === 1 && types[0] !== undefined) {
    scopeLabel = types[0];
  } else if (types.length === 0) {
    scopeLabel = 'none';
  } else {
    scopeLabel = 'mixed';
  }

  return {
    evidenceCount: packets.length,
    sourceTypeBreakdown,
    scopeLabel,
  };
}
