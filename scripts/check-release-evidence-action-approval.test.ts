import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runCheckScript(args: string[]) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'check-release-evidence-action-approval.mjs');
  return spawnSync('node', [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('check-release-evidence-action-approval script', () => {
  it('passes when approval section structure is valid', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'approval-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeFileSync(reportPath, JSON.stringify({
        actionApprovalCenter: {
          status: 'ready_or_partial',
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
      }), 'utf8');
      const result = runCheckScript([`--report=${reportPath}`]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('action approval gate passed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when pending rate breaches threshold', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'approval-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeFileSync(reportPath, JSON.stringify({
        actionApprovalCenter: {
          status: 'ready_or_partial',
          summary: {
            total: 4,
            pending: 3,
            blocked: 0,
            confirmed: 1,
            cancelled: 0,
            failed: 0,
          },
          riskTiers: { high: 1 },
          approvalModes: { user_preference: 3 },
        },
      }), 'utf8');
      const result = runCheckScript([`--report=${reportPath}`, '--max-pending-rate=0.5']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('pendingRate');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when high risk signal is required but missing', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'approval-gate-'));
    const reportPath = path.join(tempDir, 'report.json');
    try {
      writeFileSync(reportPath, JSON.stringify({
        actionApprovalCenter: {
          status: 'ready_or_partial',
          summary: {
            total: 2,
            pending: 0,
            blocked: 1,
            confirmed: 1,
            cancelled: 0,
            failed: 0,
          },
          riskTiers: { medium: 2 },
          approvalModes: { safety_gate: 1, propose_changes: 1 },
        },
      }), 'utf8');
      const result = runCheckScript([`--report=${reportPath}`, '--require-high-risk-signal']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('riskTiers.high > 0');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
