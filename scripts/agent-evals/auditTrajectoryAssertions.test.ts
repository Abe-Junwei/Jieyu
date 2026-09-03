import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  extractAgentRunId,
  filterAuditRowsByAgentRunId,
  evaluateAgentRunIdChainFromAudit,
  evaluateTrajectorySignalsFromAudit,
  summarizeToolAciByAgentRunId,
} = require('./auditTrajectoryAssertions.mjs') as {
  extractAgentRunId: (row: Record<string, unknown>) => string;
  filterAuditRowsByAgentRunId: (
    rows: Array<Record<string, unknown>>,
    agentRunId: string,
  ) => Array<Record<string, unknown>>;
  evaluateAgentRunIdChainFromAudit: (rows: Array<Record<string, unknown>>) => {
    passed: boolean;
    schemaV1DecisionCount: number;
    missingAgentRunIdCount: number;
    chainedRunCount: number;
    distinctRunCount: number;
  };
  evaluateTrajectorySignalsFromAudit: (
    rows: unknown[],
    requiredSignals?: readonly string[],
  ) => { passed: boolean; missingSignals: string[]; coveredSignals: string[] };
  summarizeToolAciByAgentRunId: (rows: Array<Record<string, unknown>>) => {
    version: string;
    distinctRunCount: number;
    totalToolCalls: number;
    averageToolCallsPerRun: number;
    runs: Array<{ agentRunId: string; toolCallCount: number; outcomes: Record<string, number> }>;
  };
};

function parseNdjson(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function decisionRow(overrides: Record<string, unknown> = {}) {
  return {
    collection: 'ai_messages',
    field: 'ai_tool_call_decision',
    metadata_json: {
      schemaVersion: 1,
      phase: 'decision',
      outcome: 'confirmed',
      agentRunId: 'run_a',
      toolCall: { name: 'delete_transcription_segment' },
      message: 'ok',
      ...overrides,
    },
  };
}

function intentRow(agentRunId = 'run_a') {
  return {
    collection: 'ai_messages',
    field: 'ai_tool_call_intent',
    metadata_json: {
      schemaVersion: 1,
      phase: 'intent',
      agentRunId,
      toolCall: { name: 'delete_transcription_segment' },
    },
  };
}

describe('agentRunId chain', () => {
  it('extracts agentRunId from metadata then context', () => {
    expect(
      extractAgentRunId({
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        metadata_json: { agentRunId: 'run_direct', context: { agentRunId: 'run_nested' } },
      }),
    ).toBe('run_direct');
    expect(
      extractAgentRunId({
        collection: 'ai_messages',
        field: 'ai_tool_call_intent',
        metadataJson: JSON.stringify({ context: { agentRunId: 'run_nested' } }),
      }),
    ).toBe('run_nested');
  });

  it('filters rows by agentRunId and drops the other run recovery_path', () => {
    const rows = [
      decisionRow({ agentRunId: 'run_a', outcome: 'confirmed' }),
      intentRow('run_a'),
      decisionRow({
        agentRunId: 'run_b',
        outcome: 'policy_pending',
        toolCall: { name: 'set_transcription_text' },
        reason: 'user_directive_confirmation_required',
      }),
    ];
    const filtered = filterAuditRowsByAgentRunId(rows, 'run_a');
    expect(filtered).toHaveLength(2);
    expect(filtered.every((row) => extractAgentRunId(row) === 'run_a')).toBe(true);

    const full = evaluateTrajectorySignalsFromAudit(rows, ['recovery_path']);
    expect(full.passed).toBe(true);
    const scoped = evaluateTrajectorySignalsFromAudit(filtered, ['recovery_path']);
    expect(scoped.passed).toBe(false);
    expect(scoped.missingSignals).toContain('recovery_path');
  });

  it('passes when schema-v1 decisions share a run id with another chain field', () => {
    const result = evaluateAgentRunIdChainFromAudit([decisionRow(), intentRow()]);
    expect(result.passed).toBe(true);
    expect(result.chainedRunCount).toBe(1);
    expect(result.missingAgentRunIdCount).toBe(0);
  });

  it('vacuously passes when there are no schema-v1 decisions', () => {
    const result = evaluateAgentRunIdChainFromAudit([
      {
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        metadata_json: { phase: 'decision', outcome: 'confirmed' },
      },
    ]);
    expect(result.passed).toBe(true);
    expect(result.schemaV1DecisionCount).toBe(0);
  });

  it('fails when a schema-v1 decision omits agentRunId', () => {
    const result = evaluateAgentRunIdChainFromAudit([
      decisionRow({ agentRunId: undefined }),
    ]);
    expect(result.passed).toBe(false);
    expect(result.missingAgentRunIdCount).toBe(1);
  });

  it('fails when decisions have agentRunId but no second chain field', () => {
    const result = evaluateAgentRunIdChainFromAudit([decisionRow()]);
    expect(result.passed).toBe(false);
    expect(result.chainedRunCount).toBe(0);
    expect(result.missingAgentRunIdCount).toBe(0);
  });
});

describe('tool ACI baseline', () => {
  it('groups schema-v1 decisions by agentRunId', () => {
    const summary = summarizeToolAciByAgentRunId([
      decisionRow({ agentRunId: 'run_a', outcome: 'confirmed' }),
      decisionRow({
        agentRunId: 'run_b',
        outcome: 'policy_pending',
        toolCall: { name: 'set_transcription_text' },
      }),
    ]);
    expect(summary.version).toBe('v1');
    expect(summary.distinctRunCount).toBe(2);
    expect(summary.totalToolCalls).toBe(2);
    expect(summary.averageToolCallsPerRun).toBe(1);
    expect(summary.runs).toEqual([
      { agentRunId: 'run_a', toolCallCount: 1, outcomes: { confirmed: 1 } },
      { agentRunId: 'run_b', toolCallCount: 1, outcomes: { policy_pending: 1 } },
    ]);
  });

  it('sorts runs by agentRunId regardless of NDJSON row order', () => {
    const summary = summarizeToolAciByAgentRunId([
      decisionRow({
        agentRunId: 'run_b',
        outcome: 'policy_pending',
        toolCall: { name: 'set_transcription_text' },
      }),
      decisionRow({ agentRunId: 'run_a', outcome: 'confirmed' }),
    ]);
    expect(summary.runs.map((run) => run.agentRunId)).toEqual(['run_a', 'run_b']);
  });

  it('matches the committed fixture baseline', () => {
    const ndjsonPath = path.join(
      process.cwd(),
      'docs/execution/audits/ai-tool-decision-audit-export-v1.ndjson',
    );
    const baselinePath = path.join(
      process.cwd(),
      'docs/execution/release-gates/release-evidence/agent-tool-aci-baseline.v1.json',
    );
    const rows = parseNdjson(readFileSync(ndjsonPath, 'utf8'));
    const summary = summarizeToolAciByAgentRunId(rows);
    const committed = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      version: string;
      distinctRunCount: number;
      totalToolCalls: number;
      averageToolCallsPerRun: number;
      runs: Array<{ agentRunId: string; toolCallCount: number; outcomes: Record<string, number> }>;
    };
    expect(summary.version).toBe(committed.version);
    expect(summary.distinctRunCount).toBe(committed.distinctRunCount);
    expect(summary.totalToolCalls).toBe(committed.totalToolCalls);
    expect(summary.averageToolCallsPerRun).toBe(committed.averageToolCallsPerRun);
    expect(summary.runs).toEqual(committed.runs);
  });
});
