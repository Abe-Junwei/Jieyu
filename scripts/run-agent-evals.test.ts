import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

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
          phase: 'decision',
          outcome: 'confirm_failed',
          executionProgress: { appliedCount: 1, totalCount: 2, partial: true },
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
});
