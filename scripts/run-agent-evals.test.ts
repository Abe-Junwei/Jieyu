import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { evaluateTrajectorySignalsFromAudit } = require('./agent-evals/auditTrajectoryAssertions.mjs') as {
  evaluateTrajectorySignalsFromAudit: (
    rows: unknown[],
    requiredSignals?: readonly string[],
  ) => { passed: boolean; missingSignals: string[] };
};

function runAgentEvals(args: string[], cwd: string) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'run-agent-evals.mjs');
  return spawnSync('node', [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('run-agent-evals audit trace assertion', () => {
  it('passes when audit trace has decision rows with decision metadata', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'run-agent-evals-pass-'));
    const suitePath = path.join(tempDir, 'suite.json');
    const reportPath = path.join(tempDir, 'report.json');
    const auditPath = path.join(tempDir, 'audit.ndjson');

    try {
      writeFileSync(suitePath, JSON.stringify({
        suiteId: 'tmp-suite',
        version: 1,
        thresholds: {
          requiredPassRate: 1,
          maxFailedCases: 0,
          requiredGoldenTasksMin: 0,
          requiredTrajectorySignals: [],
        },
        cases: [
          {
            id: 'smoke',
            name: 'smoke',
            command: 'node -e "process.exit(0)"',
            category: 'smoke',
            goldenTaskCount: 0,
            trajectorySignals: [],
          },
        ],
      }), 'utf8');
      writeFileSync(auditPath, `${JSON.stringify({
        request_id: 'req-1',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        new_value: 'confirm_failed:propose_changes:child_failed',
        metadata_json: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          outcome: 'confirm_failed',
          agentRunId: 'run_pass_1',
          toolCall: { name: 'propose_changes' },
          reason: 'child_failed',
          executionProgress: { appliedCount: 1, totalCount: 2, partial: true },
          proposeRollback: { attempted: true, ok: false, errorCount: 1 },
        }),
      })}\n${JSON.stringify({
        request_id: 'req-1',
        collection: 'ai_messages',
        field: 'ai_tool_call_intent',
        metadata_json: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          agentRunId: 'run_pass_1',
          toolCall: { name: 'propose_changes' },
        }),
      })}\n`, 'utf8');

      const result = runAgentEvals([
        '--mode=enforce',
        `--suite=${suitePath}`,
        `--report=${reportPath}`,
        `--assert-audit-trace=${auditPath}`,
      ], process.cwd());

      expect(result.status).toBe(0);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        summary?: { thresholdPassed?: boolean; auditTracePassed?: boolean };
        auditTrace?: { enabled?: boolean; passed?: boolean; decisionRowCount?: number };
      };
      expect(report.summary?.thresholdPassed).toBe(true);
      expect(report.summary?.auditTracePassed).toBe(true);
      expect(report.auditTrace?.enabled).toBe(true);
      expect(report.auditTrace?.passed).toBe(true);
      expect(report.auditTrace?.decisionRowCount).toBe(1);
      expect((report.auditTrace as { schemaV1DecisionRowCount?: number })?.schemaV1DecisionRowCount).toBe(1);
      expect((report.auditTrace as { chainedRunCount?: number })?.chainedRunCount).toBe(1);
      expect((report.auditTrace as { missingAgentRunIdCount?: number })?.missingAgentRunIdCount).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails in enforce mode when decision metadata lacks schemaVersion 1', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'run-agent-evals-schema-'));
    const suitePath = path.join(tempDir, 'suite.json');
    const reportPath = path.join(tempDir, 'report.json');
    const auditPath = path.join(tempDir, 'audit.ndjson');

    try {
      writeFileSync(suitePath, JSON.stringify({
        suiteId: 'tmp-suite',
        version: 1,
        thresholds: {
          requiredPassRate: 1,
          maxFailedCases: 0,
          requiredGoldenTasksMin: 0,
          requiredTrajectorySignals: [],
        },
        cases: [
          {
            id: 'smoke',
            name: 'smoke',
            command: 'node -e "process.exit(0)"',
            category: 'smoke',
            goldenTaskCount: 0,
            trajectorySignals: [],
          },
        ],
      }), 'utf8');
      writeFileSync(auditPath, `${JSON.stringify({
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        newValue: 'confirm_failed:propose_changes:child_failed',
        metadataJson: JSON.stringify({
          phase: 'decision',
          outcome: 'confirm_failed',
        }),
      })}\n`, 'utf8');

      const result = runAgentEvals([
        '--mode=enforce',
        `--suite=${suitePath}`,
        `--report=${reportPath}`,
        `--assert-audit-trace=${auditPath}`,
      ], process.cwd());

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        summary?: { thresholdPassed?: boolean; auditTracePassed?: boolean };
        auditTrace?: { passed?: boolean; failureReasons?: string[] };
      };
      expect(report.summary?.thresholdPassed).toBe(false);
      expect(report.auditTrace?.failureReasons).toContain('missing_decision_metadata_schema_version_1');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails in enforce mode when audit trace metadata is missing', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'run-agent-evals-fail-'));
    const suitePath = path.join(tempDir, 'suite.json');
    const reportPath = path.join(tempDir, 'report.json');
    const auditPath = path.join(tempDir, 'audit.ndjson');

    try {
      writeFileSync(suitePath, JSON.stringify({
        suiteId: 'tmp-suite',
        version: 1,
        thresholds: {
          requiredPassRate: 1,
          maxFailedCases: 0,
          requiredGoldenTasksMin: 0,
          requiredTrajectorySignals: [],
        },
        cases: [
          {
            id: 'smoke',
            name: 'smoke',
            command: 'node -e "process.exit(0)"',
            category: 'smoke',
            goldenTaskCount: 0,
            trajectorySignals: [],
          },
        ],
      }), 'utf8');
      writeFileSync(auditPath, `${JSON.stringify({
        request_id: 'req-2',
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        new_value: 'confirm_failed:propose_changes:child_failed',
      })}\n`, 'utf8');

      const result = runAgentEvals([
        '--mode=enforce',
        `--suite=${suitePath}`,
        `--report=${reportPath}`,
        `--assert-audit-trace=${auditPath}`,
      ], process.cwd());

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        summary?: { thresholdPassed?: boolean; auditTracePassed?: boolean };
        auditTrace?: { passed?: boolean; failureReasons?: string[] };
      };
      expect(report.summary?.thresholdPassed).toBe(false);
      expect(report.summary?.auditTracePassed).toBe(false);
      expect(report.auditTrace?.passed).toBe(false);
      expect(report.auditTrace?.failureReasons).toContain('missing_decision_metadata_phase_outcome');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails in enforce mode when schema v1 rows omit T4 partial / proposeRollback audit shape', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'run-agent-evals-t4shape-'));
    const suitePath = path.join(tempDir, 'suite.json');
    const reportPath = path.join(tempDir, 'report.json');
    const auditPath = path.join(tempDir, 'audit.ndjson');

    try {
      writeFileSync(suitePath, JSON.stringify({
        suiteId: 'tmp-suite',
        version: 1,
        thresholds: {
          requiredPassRate: 1,
          maxFailedCases: 0,
          requiredGoldenTasksMin: 0,
          requiredTrajectorySignals: [],
        },
        cases: [
          {
            id: 'smoke',
            name: 'smoke',
            command: 'node -e "process.exit(0)"',
            category: 'smoke',
            goldenTaskCount: 0,
            trajectorySignals: [],
          },
        ],
      }), 'utf8');
      writeFileSync(auditPath, `${JSON.stringify({
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        newValue: 'confirmed:delete_transcription_segment',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          outcome: 'confirmed',
          agentRunId: 'run_t4_shape_1',
        }),
      })}\n${JSON.stringify({
        collection: 'ai_messages',
        field: 'ai_tool_call_intent',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          agentRunId: 'run_t4_shape_1',
          toolCall: { name: 'delete_transcription_segment' },
        }),
      })}\n`, 'utf8');

      const result = runAgentEvals([
        '--mode=enforce',
        `--suite=${suitePath}`,
        `--report=${reportPath}`,
        `--assert-audit-trace=${auditPath}`,
      ], process.cwd());

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        auditTrace?: { failureReasons?: string[] };
      };
      expect(report.auditTrace?.failureReasons).toContain('missing_t4_audit_execution_progress_partial');
      expect(report.auditTrace?.failureReasons).toContain('missing_t4_audit_propose_rollback_error_count');
      expect(report.auditTrace?.failureReasons ?? []).not.toContain('missing_agent_run_id_chain');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails in enforce mode when schema v1 decisions omit agentRunId', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'run-agent-evals-runid-'));
    const suitePath = path.join(tempDir, 'suite.json');
    const reportPath = path.join(tempDir, 'report.json');
    const auditPath = path.join(tempDir, 'audit.ndjson');

    try {
      writeFileSync(suitePath, JSON.stringify({
        suiteId: 'tmp-suite',
        version: 1,
        thresholds: {
          requiredPassRate: 1,
          maxFailedCases: 0,
          requiredGoldenTasksMin: 0,
          requiredTrajectorySignals: [],
        },
        cases: [
          {
            id: 'smoke',
            name: 'smoke',
            command: 'node -e "process.exit(0)"',
            category: 'smoke',
            goldenTaskCount: 0,
            trajectorySignals: [],
          },
        ],
      }), 'utf8');
      writeFileSync(auditPath, `${JSON.stringify({
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        metadata_json: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          outcome: 'confirm_failed',
          toolCall: { name: 'propose_changes' },
          reason: 'child_failed',
          executionProgress: { appliedCount: 1, totalCount: 2, partial: true },
          proposeRollback: { attempted: true, ok: false, errorCount: 1 },
        }),
      })}\n`, 'utf8');

      const result = runAgentEvals([
        '--mode=enforce',
        `--suite=${suitePath}`,
        `--report=${reportPath}`,
        `--assert-audit-trace=${auditPath}`,
      ], process.cwd());

      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        auditTrace?: { failureReasons?: string[]; missingAgentRunIdCount?: number };
      };
      expect(report.auditTrace?.failureReasons).toContain('missing_agent_run_id_chain');
      expect(report.auditTrace?.missingAgentRunIdCount).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('audit trajectory assertions', () => {
  it('covers required trajectory signals from decision audit rows', () => {
    const rows = [
      {
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        metadata_json: {
          schemaVersion: 1,
          phase: 'decision',
          outcome: 'confirmed',
          toolCall: { name: 'delete_transcription_segment' },
          message: 'confirmed',
        },
      },
      {
        collection: 'ai_messages',
        field: 'ai_tool_call_decision',
        metadata_json: {
          schemaVersion: 1,
          phase: 'decision',
          outcome: 'policy_pending',
          toolCall: { name: 'set_transcription_text' },
          reason: 'user_directive_confirmation_required',
        },
      },
    ];

    const result = evaluateTrajectorySignalsFromAudit(rows, [
      'tool_selection',
      'gate_correctness',
      'recovery_path',
      'audit_traceability',
      'approval_explainability',
    ]);

    expect(result.passed).toBe(true);
    expect(result.missingSignals).toEqual([]);
  });
});
