/**
 * P3.2 / A14: derive trajectory signal coverage from committed audit NDJSON
 * (not case metadata only), plus `agentRunId` chain assertions.
 *
 * Production export shape: `collection` + `field` + `metadataJson` / `metadata_json`.
 * Schema v1 decisions use numeric `schemaVersion === 1` (not the string `"v1"`).
 */

export const AUDIT_TRAJECTORY_SIGNALS = Object.freeze({
  tool_selection: 'tool_selection',
  gate_correctness: 'gate_correctness',
  recovery_path: 'recovery_path',
  audit_traceability: 'audit_traceability',
  approval_explainability: 'approval_explainability',
  agent_run_id_chain: 'agent_run_id_chain',
});

/** Events that form the production agent-run chain (A8 + A14). */
export const AGENT_RUN_CHAIN_FIELDS = Object.freeze([
  'ai_tool_call_decision',
  'ai_tool_call_intent',
  'ai_agent_loop_step',
]);

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

/**
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function extractAgentRunId(row) {
  const metadata = normalizeAuditMetadata(row);
  if (!metadata || typeof metadata !== 'object') return '';
  const direct = typeof metadata.agentRunId === 'string' ? metadata.agentRunId.trim() : '';
  if (direct) return direct;
  const context =
    metadata.context && typeof metadata.context === 'object' ? metadata.context : {};
  const nested = typeof context.agentRunId === 'string' ? context.agentRunId.trim() : '';
  return nested;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} agentRunId
 */
export function filterAuditRowsByAgentRunId(rows, agentRunId) {
  const id = typeof agentRunId === 'string' ? agentRunId.trim() : '';
  if (!id) return [];
  return rows.filter((row) => extractAgentRunId(row) === id);
}

function isSchemaV1DecisionRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.collection ?? '') !== 'ai_messages') return false;
  if (String(row.field ?? '') !== 'ai_tool_call_decision') return false;
  const metadata = normalizeAuditMetadata(row);
  if (!metadata || typeof metadata !== 'object') return false;
  if (Number(metadata.schemaVersion) !== 1) return false;
  const phase = typeof metadata.phase === 'string' ? metadata.phase.trim() : '';
  const outcome = typeof metadata.outcome === 'string' ? metadata.outcome.trim() : '';
  return phase === 'decision' && outcome.length > 0;
}

function isChainFieldRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.collection ?? '') !== 'ai_messages') return false;
  return AGENT_RUN_CHAIN_FIELDS.includes(String(row.field ?? ''));
}

/**
 * Schema-v1 decision rows must carry `agentRunId`. Vacuous pass when there are
 * none (so missing-schema / missing-metadata tests stay specific). When any
 * schema-v1 decision has a run id, at least one run must emit ≥2 chain fields.
 *
 * @param {Array<Record<string, unknown>>} rows
 */
export function evaluateAgentRunIdChainFromAudit(rows) {
  const schemaV1Decisions = rows.filter(isSchemaV1DecisionRow);
  const missingAgentRunIdCount = schemaV1Decisions.filter((row) => !extractAgentRunId(row)).length;
  const ids = [
    ...new Set(schemaV1Decisions.map(extractAgentRunId).filter(Boolean)),
  ];
  let chainedRunCount = 0;
  for (const id of ids) {
    const fieldTypes = new Set(
      rows
        .filter((row) => isChainFieldRow(row) && extractAgentRunId(row) === id)
        .map((row) => String(row.field ?? '')),
    );
    if (fieldTypes.size >= 2) chainedRunCount += 1;
  }
  const passed =
    missingAgentRunIdCount === 0
    && (schemaV1Decisions.length === 0 || chainedRunCount >= 1);
  return {
    passed,
    schemaV1DecisionCount: schemaV1Decisions.length,
    missingAgentRunIdCount,
    chainedRunCount,
    distinctRunCount: ids.length,
  };
}

/**
 * P2 ACI-style tool-call counts grouped by `agentRunId` (fixture / replay, not live LLM).
 *
 * @param {Array<Record<string, unknown>>} rows
 */
export function summarizeToolAciByAgentRunId(rows) {
  /** @type {Map<string, { toolCallCount: number, outcomes: Record<string, number> }>} */
  const byRun = new Map();
  for (const row of rows) {
    if (!isSchemaV1DecisionRow(row)) continue;
    const id = extractAgentRunId(row);
    if (!id) continue;
    const metadata = normalizeAuditMetadata(row);
    const current = byRun.get(id) ?? { toolCallCount: 0, outcomes: {} };
    current.toolCallCount += 1;
    const outcome =
      metadata && typeof metadata.outcome === 'string' && metadata.outcome.trim()
        ? metadata.outcome.trim()
        : 'unknown';
    current.outcomes[outcome] = (current.outcomes[outcome] ?? 0) + 1;
    byRun.set(id, current);
  }
  const runs = [...byRun.entries()].map(([agentRunId, stats]) => ({
    agentRunId,
    toolCallCount: stats.toolCallCount,
    outcomes: stats.outcomes,
  }));
  const totalToolCalls = runs.reduce((sum, run) => sum + run.toolCallCount, 0);
  return {
    version: 'v1',
    distinctRunCount: runs.length,
    totalToolCalls,
    averageToolCallsPerRun: runs.length === 0 ? 0 : totalToolCalls / runs.length,
    runs,
  };
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

  const chain = evaluateAgentRunIdChainFromAudit(rows);
  if (chain.passed && chain.chainedRunCount > 0) {
    covered.add(AUDIT_TRAJECTORY_SIGNALS.agent_run_id_chain);
  }

  const missing = requiredSignals.filter((signal) => !covered.has(signal));
  return {
    coveredSignals: [...covered],
    missingSignals: missing,
    decisionRowCount: decisionRows.length,
    passed: missing.length === 0,
  };
}
