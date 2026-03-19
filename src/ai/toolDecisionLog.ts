export interface AiToolDecisionLogItem {
  id: string;
  toolName: string;
  decision: string;
  reason?: string;
  timestamp: string;
}

interface AuditLogDecisionRow {
  id: string;
  newValue?: string;
  timestamp: string;
}

export function parseAiToolDecision(raw: string | undefined): { decision: string; toolName: string; reason?: string } {
  const decisionRaw = (raw ?? '').trim();
  const parts = decisionRaw.split(':');
  const decision = parts[0] ?? '';
  const toolName = parts[1] ?? '';
  const reason = parts[2];
  return reason ? { decision, toolName, reason } : { decision, toolName };
}

export function mapAuditRowToAiToolDecisionLog(row: AuditLogDecisionRow): AiToolDecisionLogItem {
  const parsed = parseAiToolDecision(row.newValue);
  return {
    id: row.id,
    toolName: parsed.toolName,
    decision: parsed.decision,
    ...(parsed.reason ? { reason: parsed.reason } : {}),
    timestamp: row.timestamp,
  };
}
