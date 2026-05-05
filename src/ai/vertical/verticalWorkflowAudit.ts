import type { AuditLogDocType } from '../../db/types';

export const AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD = 'ai_vertical_workflow_result';

export interface VerticalWorkflowAuditMetadataV1 {
  schemaVersion: 1;
  phase: 'stream_completion';
  completionPath: 'stream_done' | 'stream_fallback';
  completionStatus: 'done' | 'error';
  workflowId: string;
  writeMode: string;
  outputKind: string;
  envelope: {
    schemaVersion: number;
    generatedAt: string;
    evidencePacketCount: number;
  };
  selection: {
    confidence: number;
    source: string;
    reasonCode: string;
    matchedKeyword: string;
  } | null;
}

export interface ParsedVerticalWorkflowAuditEntry {
  assistantMessageId: string;
  requestId: string | null;
  recordedAt: string;
  metadata: VerticalWorkflowAuditMetadataV1;
}

type VerticalWorkflowAuditRow = Pick<
  AuditLogDocType,
  'field' | 'documentId' | 'requestId' | 'timestamp' | 'metadataJson'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseVerticalWorkflowAuditMetadata(raw: string | undefined): VerticalWorkflowAuditMetadataV1 | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const schemaVersion = parsed.schemaVersion;
  const phase = parsed.phase;
  const completionPath = parsed.completionPath;
  const completionStatus = parsed.completionStatus;
  const workflowId = parsed.workflowId;
  const writeMode = parsed.writeMode;
  const outputKind = parsed.outputKind;
  const envelope = parsed.envelope;
  const selection = parsed.selection;

  if (schemaVersion !== 1 || phase !== 'stream_completion') return null;
  if (completionPath !== 'stream_done' && completionPath !== 'stream_fallback') return null;
  if (completionStatus !== 'done' && completionStatus !== 'error') return null;
  if (typeof workflowId !== 'string' || workflowId.trim().length === 0) return null;
  if (typeof writeMode !== 'string' || writeMode.trim().length === 0) return null;
  if (typeof outputKind !== 'string' || outputKind.trim().length === 0) return null;
  if (!isRecord(envelope)) return null;

  const envelopeSchemaVersion = envelope.schemaVersion;
  const envelopeGeneratedAt = envelope.generatedAt;
  const envelopeEvidencePacketCount = envelope.evidencePacketCount;
  if (typeof envelopeSchemaVersion !== 'number') return null;
  if (typeof envelopeGeneratedAt !== 'string' || envelopeGeneratedAt.trim().length === 0) return null;
  if (typeof envelopeEvidencePacketCount !== 'number' || Number.isNaN(envelopeEvidencePacketCount)) return null;

  let parsedSelection: VerticalWorkflowAuditMetadataV1['selection'] = null;
  if (selection !== null) {
    if (!isRecord(selection)) return null;
    const selectionConfidence = selection.confidence;
    const selectionSource = selection.source;
    const selectionReasonCode = selection.reasonCode;
    const selectionMatchedKeyword = selection.matchedKeyword;
    if (typeof selectionConfidence !== 'number' || Number.isNaN(selectionConfidence)) return null;
    if (typeof selectionSource !== 'string' || selectionSource.trim().length === 0) return null;
    if (typeof selectionReasonCode !== 'string' || selectionReasonCode.trim().length === 0) return null;
    if (typeof selectionMatchedKeyword !== 'string' || selectionMatchedKeyword.trim().length === 0) return null;
    parsedSelection = {
      confidence: selectionConfidence,
      source: selectionSource,
      reasonCode: selectionReasonCode,
      matchedKeyword: selectionMatchedKeyword,
    };
  }

  return {
    schemaVersion: 1,
    phase: 'stream_completion',
    completionPath,
    completionStatus,
    workflowId,
    writeMode,
    outputKind,
    envelope: {
      schemaVersion: envelopeSchemaVersion,
      generatedAt: envelopeGeneratedAt,
      evidencePacketCount: envelopeEvidencePacketCount,
    },
    selection: parsedSelection,
  };
}

export function parseVerticalWorkflowAuditEntry(row: VerticalWorkflowAuditRow): ParsedVerticalWorkflowAuditEntry | null {
  if (row.field !== AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD) return null;
  const metadata = parseVerticalWorkflowAuditMetadata(row.metadataJson);
  if (!metadata) return null;
  return {
    assistantMessageId: row.documentId,
    requestId: row.requestId ?? null,
    recordedAt: row.timestamp,
    metadata,
  };
}

export function pickLatestVerticalWorkflowAuditEntry(
  rows: ReadonlyArray<VerticalWorkflowAuditRow>,
): ParsedVerticalWorkflowAuditEntry | null {
  let latest: ParsedVerticalWorkflowAuditEntry | null = null;
  for (const row of rows) {
    const parsed = parseVerticalWorkflowAuditEntry(row);
    if (!parsed) continue;
    if (!latest || parsed.recordedAt > latest.recordedAt) {
      latest = parsed;
    }
  }
  return latest;
}
