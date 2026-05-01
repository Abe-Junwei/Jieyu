import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runCheckScript(args: string[]) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'check-release-evidence-governance.mjs');
  return spawnSync('node', [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function writeReport(reportPath: string, overrides: Record<string, unknown> = {}) {
  const base = {
    costGuard: {
      trend: {
        bucket: 'day',
        compareReady: true,
        pointCount: 2,
        points: [
          { date: '2026-04-24', requestCount: 1, budgetTriggerCount: 0, retryTriggeredCount: 0, retrySuccessCount: 0, outputCapTriggeredCount: 0 },
          { date: '2026-04-25', requestCount: 1, budgetTriggerCount: 1, retryTriggeredCount: 1, retrySuccessCount: 1, outputCapTriggeredCount: 0 },
        ],
      },
    },
    actionApprovalCenter: {
      summary: {
        total: 4,
        pending: 1,
        blocked: 1,
        confirmed: 2,
        cancelled: 0,
        failed: 0,
      },
      riskTiers: { high: 2, medium: 2 },
      approvalModes: { user_preference: 1, safety_gate: 1, propose_changes: 2 },
    },
    backgroundMemoryExtraction: {
      status: 'ready_or_partial',
      summary: {
        total: 2,
        scheduled: 2,
        merged: 0,
        completed: 1,
        skipped: 1,
        failed: 0,
        writtenCount: 1,
      },
      sandboxDecisions: {
        actions: {
          allow: 1,
          ask: 1,
        },
        reasons: {
          'restricted-write-allowed': 1,
          'readonly-write-not-allowed': 1,
        },
      },
      skipReasons: {
        'empty-extraction': 1,
      },
    },
    evidenceIndex: [
      { conclusionId: 'c5.background-memory-extraction.v1' },
    ],
    ...overrides,
  };
  writeFileSync(reportPath, JSON.stringify(base), 'utf8');
}

describe('check-release-evidence-governance script', () => {
  it('passes with valid combined governance structure', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 're-governance-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath);
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('governance gate passed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when min-approval-total is not met', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 're-governance-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, {
        actionApprovalCenter: {
          summary: {
            total: 1,
            pending: 0,
            blocked: 0,
            confirmed: 1,
            cancelled: 0,
            failed: 0,
          },
          riskTiers: { high: 1, medium: 0 },
          approvalModes: { user_confirmation: 1 },
        },
      });
      const result = runCheckScript([`--report=${reportPath}`, '--min-approval-total=2']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('below required minimum 2');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when strict compare-ready is required but false', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 're-governance-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, {
        costGuard: {
          trend: {
            bucket: 'day',
            compareReady: false,
            pointCount: 1,
            points: [
              { date: '2026-04-25', requestCount: 1, budgetTriggerCount: 1, retryTriggeredCount: 0, retrySuccessCount: 0, outputCapTriggeredCount: 0 },
            ],
          },
        },
      });
      const result = runCheckScript([`--report=${reportPath}`, '--require-cost-guard-compare-ready']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('compareReady');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when C5 evidence index card is missing', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 're-governance-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, {
        evidenceIndex: [],
      });
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('c5.background-memory-extraction.v1');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when min-background-memory-total is not met', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 're-governance-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeReport(reportPath, {
        backgroundMemoryExtraction: {
          status: 'ready_or_partial',
          summary: {
            total: 0,
            scheduled: 0,
            merged: 0,
            completed: 0,
            skipped: 0,
            failed: 0,
            writtenCount: 0,
          },
          sandboxDecisions: {
            actions: {},
            reasons: {},
          },
          skipReasons: {},
        },
      });
      const result = runCheckScript([`--report=${reportPath}`, '--min-background-memory-total=1']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('backgroundMemoryExtraction.summary.total=0');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
