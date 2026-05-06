export const EVIDENCE_PACKET_V0_SCHEMA_VERSION = 0 as const;

export type EvidencePacketSourceType =
  | 'segment'
  | 'layer_text'
  | 'lexeme'
  | 'note'
  | 'document'
  | 'audio_region';

export interface EvidencePacketTimeRangeMs {
  startMs: number;
  endMs: number;
}

export interface EvidencePacketV0 {
  schemaVersion: typeof EVIDENCE_PACKET_V0_SCHEMA_VERSION;
  id: string;
  sourceType: EvidencePacketSourceType;
  sourceId: string;
  projectId?: string;
  mediaId?: string;
  segmentId?: string;
  layerId?: string;
  timeRangeMs?: EvidencePacketTimeRangeMs;
  quote?: string;
  summary?: string;
  confidence?: number;
  reasonCode?: string;
}

export type BuildEvidencePacketV0Input = Omit<EvidencePacketV0, 'schemaVersion'>;

export function buildEvidencePacketV0(input: BuildEvidencePacketV0Input): EvidencePacketV0 {
  if (!input.id.trim()) {
    throw new Error('EvidencePacket id cannot be empty.');
  }
  if (!input.sourceId.trim()) {
    throw new Error('EvidencePacket sourceId cannot be empty.');
  }
  if (input.timeRangeMs && input.timeRangeMs.endMs < input.timeRangeMs.startMs) {
    throw new Error('EvidencePacket timeRangeMs.endMs must be >= startMs.');
  }
  if (typeof input.confidence === 'number' && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error('EvidencePacket confidence must be within [0, 1].');
  }

  return {
    schemaVersion: EVIDENCE_PACKET_V0_SCHEMA_VERSION,
    ...input,
  };
}

/** Fields that metric calculations depend on; renaming or removing these breaks P1+ quality gates.
 *  Any schema migration must provide a backward-compatible mapping.
 */
export const EVIDENCE_PACKET_METRIC_DEPENDENT_FIELDS = [
  'id',
  'sourceType',
  'sourceId',
  'quote',
  'confidence',
  'reasonCode',
  'timeRangeMs',
] as const satisfies readonly (keyof EvidencePacketV0)[];
