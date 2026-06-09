/**
 * P3.2: derive trajectory signal coverage from committed audit NDJSON (not case metadata only).
 */

export function normalizeAuditMetadata(row) {
  if (!row || typeof row !== 'object') return null;
  const metadataRaw = row.metadata_json ?? row.metadataJson;
  if (metadataRaw && typeof metadataRaw === 'object') return metadataRaw;
  if (typeof metadataRaw === 'string' && metadataRaw.trim().length > 0) {
    try {
      return JSON.parse(metadataRaw);
    } catch {
      return null;
    }
  }
  return null;
}

export function extractDecisionAuditRows(rows) {
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return String(row.collection ?? '') === 'ai_messages'
      && String(row.field ?? '') === 'ai_tool_call_decision';
  });
}

const RECOVERY_OUTCOMES = new Set([
  'policy_pending',
  'confirm_failed',
  'auto_failed',
  'clarify',
  'waiting_clarify',
]);

const GATE_OUTCOMES = new Set([
  'policy_blocked',
  'policy_pending',
  'confirmed',
  'confirm_failed',
  'gray_skipped',
  'rollback_skipped',
]);

/**
 * @param {unknown[]} rows parsed NDJSON rows
 * @param {readonly string[]} requiredSignals
 */
export function evaluateTrajectorySignalsFromAudit(rows, requiredSignals = []) {
  const decisionRows = extractDecisionAuditRows(rows);
  const covered = new Set();

  for (const row of decisionRows) {
    const metadata = normalizeAuditMetadata(row);
    if (!metadata || typeof metadata !== 'object') continue;

    const toolName = metadata.toolCall?.name;
    if (typeof toolName === 'string' && toolName.trim().length > 0) {
      covered.add('tool_selection');
    }

    const outcome = typeof metadata.outcome === 'string' ? metadata.outcome.trim() : '';
    if (GATE_OUTCOMES.has(outcome)) {
      covered.add('gate_correctness');
    }
    if (RECOVERY_OUTCOMES.has(outcome)) {
      covered.add('recovery_path');
    }
    if (Number(metadata.schemaVersion) === 1 && outcome.length > 0) {
      covered.add('audit_traceability');
    }
    if (
      metadata.policyReasonCode
      || metadata.reason
      || (typeof metadata.message === 'string' && metadata.message.trim().length > 0)
    ) {
      covered.add('approval_explainability');
    }
  }

  const missing = requiredSignals.filter((signal) => !covered.has(signal));
  return {
    coveredSignals: [...covered],
    missingSignals: missing,
    decisionRowCount: decisionRows.length,
    passed: missing.length === 0,
  };
}
