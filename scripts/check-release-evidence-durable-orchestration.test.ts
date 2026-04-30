import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runCheckScript(args: string[]) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'check-release-evidence-durable-orchestration.mjs');
  return spawnSync('node', [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function writeReport(reportPath: string, durableOrchestration: Record<string, unknown>) {
  writeFileSync(reportPath, JSON.stringify({
    durableOrchestration,
    evidenceIndex: [{ conclusionId: 'f3.durable-orchestration.v1' }],
  }), 'utf8');
}

function makeDurableSection(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready_or_partial',
    summary: {
      total: 3,
      done: 1,
      failed: 1,
      cancelledByUser: 0,
      running: 0,
      pending: 1,
      checkpointed: 2,
      resumable: 1,
      handoffRequired: 1,
      checkpointRecovered: 1,
      longTaskCompletionRate: 0.3333,
      humanInterventionRate: 0.3333,
      checkpointRecoveryRate: 0.5,
      avgDurationMs: 8000,
    },
    taskTypes: { agent_loop: 2, embed: 1 },
    handoffReasons: { token_budget_warning: 1 },
    ...overrides,
  };
}

describe('check-release-evidence-durable-orchestration script', () => {
  it('passes when durable orchestration structure and minimum signals are present', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'durable-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, makeDurableSection());
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('durable orchestration gate passed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when sample total is below minimum', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'durable-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, makeDurableSection({
        summary: {
          total: 0,
          done: 0,
          failed: 0,
          cancelledByUser: 0,
          running: 0,
          pending: 0,
          checkpointed: 0,
          resumable: 0,
          handoffRequired: 0,
          checkpointRecovered: 0,
          longTaskCompletionRate: 0,
          humanInterventionRate: 0,
          checkpointRecoveryRate: 0,
          avgDurationMs: 0,
        },
      }));
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('total=0');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when the F3 evidence index card is missing', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'durable-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeFileSync(reportPath, JSON.stringify({
        durableOrchestration: makeDurableSection(),
        evidenceIndex: [],
      }), 'utf8');
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('f3.durable-orchestration.v1');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});