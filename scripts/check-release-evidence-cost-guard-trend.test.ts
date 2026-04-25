import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scriptPath = path.join(process.cwd(), 'scripts', 'check-release-evidence-cost-guard-trend.mjs');

function runCheck(args: string[]) {
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('check-release-evidence-cost-guard-trend script', () => {
  it('passes when trend payload is valid', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cost-guard-trend-gate-'));
    const reportPath = path.join(tempDir, 'release-evidence.json');

    const payload = {
      costGuard: {
        trend: {
          bucket: 'day',
          pointCount: 2,
          compareReady: true,
          points: [
            {
              date: '2026-04-24',
              requestCount: 1,
              budgetTriggerCount: 0,
              retryTriggeredCount: 1,
              retrySuccessCount: 1,
              outputCapTriggeredCount: 0,
            },
            {
              date: '2026-04-25',
              requestCount: 2,
              budgetTriggerCount: 1,
              retryTriggeredCount: 1,
              retrySuccessCount: 1,
              outputCapTriggeredCount: 1,
            },
          ],
        },
      },
    };

    try {
      writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      const result = runCheck([`--report=${reportPath}`, '--require-compare-ready']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('cost guard trend gate passed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when compareReady is required but false', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cost-guard-trend-gate-'));
    const reportPath = path.join(tempDir, 'release-evidence.json');

    const payload = {
      costGuard: {
        trend: {
          bucket: 'day',
          pointCount: 1,
          compareReady: false,
          points: [
            {
              date: '2026-04-25',
              requestCount: 2,
              budgetTriggerCount: 1,
              retryTriggeredCount: 1,
              retrySuccessCount: 1,
              outputCapTriggeredCount: 1,
            },
          ],
        },
      },
    };

    try {
      writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      const result = runCheck([`--report=${reportPath}`, '--require-compare-ready']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('compareReady is false');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
