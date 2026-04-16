export interface AiToolDecisionLogItem {
  id: string;
  toolName: string;
  decision: string;
  reason?: string;
  requestId?: string;
  timestamp: string;
  source?: 'human' | 'ai' | 'system';
  executed?: boolean;
  durationMs?: number;
  message?: string;
}

type ParsedToolDecision = {
  decision: string;
  toolName: string;
  reason?: string;
  requestId?: string;
  source?: 'human' | 'ai' | 'system';
  executed?: boolean;
  durationMs?: number;
  message?: string;
};

interface AuditLogDecisionRow {
  id: string;
  newValue?: string;
  requestId?: string;
  metadataJson?: string;
  timestamp: string;
}

interface ToolDecisionAuditMetadataLike {
  phase?: string;
  requestId?: string;
  source?: 'human' | 'ai' | 'system';
  toolCall?: {
    name?: string;
  };
  outcome?: string;
  reason?: string;
  executed?: boolean;
  durationMs?: number;
  message?: string;
}

export function parseAiToolDecision(raw: string | undefined): ParsedToolDecision {
  const decisionRaw = (raw ?? '').trim();
  const parts = decisionRaw.split(':');
  const decision = parts[0] ?? '';
  const toolName = parts[1] ?? '';
  const reason = parts[2];
  return reason ? { decision, toolName, reason } : { decision, toolName };
}

function parseToolDecisionMetadata(raw: string | undefined): ParsedToolDecision | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as ToolDecisionAuditMetadataLike;
    if (parsed.phase !== 'decision') return null;
    const decision = typeof parsed.outcome === 'string' ? parsed.outcome.trim() : '';
    const toolName = typeof parsed.toolCall?.name === 'string' ? parsed.toolCall.name.trim() : '';
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : undefined;
    const requestId = typeof parsed.requestId === 'string' && parsed.requestId.trim().length > 0
      ? parsed.requestId.trim()
      : undefined;
    if (!decision || !toolName) return null;
    return {
      decision,
      toolName,
      ...(reason ? { reason } : {}),
      ...(requestId ? { requestId } : {}),
      ...(parsed.source ? { source: parsed.source } : {}),
      ...(typeof parsed.executed === 'boolean' ? { executed: parsed.executed } : {}),
      ...(typeof parsed.durationMs === 'number' && Number.isFinite(parsed.durationMs) ? { durationMs: parsed.durationMs } : {}),
      ...(typeof parsed.message === 'string' && parsed.message.trim().length > 0 ? { message: parsed.message.trim() } : {}),
    };
  } catch (err) {
    console.error('[Jieyu] toolDecisionLog: failed to parse tool decision metadata', { raw, err });
    return null;
  }
}

export function mapAuditRowToAiToolDecisionLog(row: AuditLogDecisionRow): AiToolDecisionLogItem {
  const parsed = parseToolDecisionMetadata(row.metadataJson) ?? parseAiToolDecision(row.newValue);
  return {
    id: row.id,
    toolName: parsed.toolName,
    decision: parsed.decision,
    ...(parsed.reason ? { reason: parsed.reason } : {}),
    ...(row.requestId ? { requestId: row.requestId } : {}),
    ...(parsed.source ? { source: parsed.source } : {}),
    ...(typeof parsed.executed === 'boolean' ? { executed: parsed.executed } : {}),
    ...(typeof parsed.durationMs === 'number' ? { durationMs: parsed.durationMs } : {}),
    ...(parsed.message ? { message: parsed.message } : {}),
    timestamp: row.timestamp,
  };
}
