import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runCalibrationScript(args: string[]) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'evaluate-acoustic-calibration.mjs');
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

describe('evaluate-acoustic-calibration script', () => {
  it('runs dataset mode by default and reports dataset summary', () => {
    const result = runCalibrationScript([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Acoustic calibration evaluation');
    expect(result.stdout).toContain('dataset=public/data/acoustic-calibration/dataset.fixed.v1.json');
    expect(result.stdout).toContain('Dataset summary: total=3, passed=3, failed=0');
    expect(result.stdout).toContain('Calibration gate passed.');
  });

  it('supports single-pair compatibility mode', () => {
    const result = runCalibrationScript([
      '--reference',
      'public/data/acoustic-calibration/praat-reference.sample.json',
      '--candidate',
      'public/data/acoustic-calibration/jieyu-candidate.sample.json',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[single-pair]');
    expect(result.stdout).toContain('reference=public/data/acoustic-calibration/praat-reference.sample.json');
    expect(result.stdout).toContain('candidate=public/data/acoustic-calibration/jieyu-candidate.sample.json');
    expect(result.stdout).toContain('Calibration gate passed.');
  });

  it('applies CLI overrides in dataset mode with higher priority than dataset defaults', () => {
    const result = runCalibrationScript([
      '--max-delta-sec',
      '0.02',
      '--coverage-threshold',
      '0.80',
      '--threshold-f0',
      '18',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('maxDeltaSec=0.02');
    expect(result.stdout).toContain('threshold<=18.000');
    expect(result.stdout).toContain('minCoverage>=0.80');
    expect(result.stdout).toContain('Dataset summary: total=3, passed=3, failed=0');
  });

  it('computes coverage against metric-eligible reference frames only', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'acoustic-calibration-'));
    const referencePath = path.join(tempDir, 'reference.json');
    const candidatePath = path.join(tempDir, 'candidate.json');

    try {
      writeFileSync(referencePath, JSON.stringify({
        frames: [
          { timeSec: 0.1, f0Hz: 120, intensityDb: -20, formantF1Hz: 500, formantF2Hz: 1500 },
          { timeSec: 0.2, f0Hz: null, intensityDb: null, formantF1Hz: null, formantF2Hz: null },
        ],
      }), 'utf8');
      writeFileSync(candidatePath, JSON.stringify({
        frames: [
          { timeSec: 0.1, f0Hz: 121, intensityDb: -19.8, formantF1Hz: 510, formantF2Hz: 1510 },
          { timeSec: 0.2, f0Hz: 130, intensityDb: -18, formantF1Hz: 600, formantF2Hz: 1600 },
        ],
      }), 'utf8');

      const result = runCalibrationScript([
        '--reference',
        referencePath,
        '--candidate',
        candidatePath,
        '--coverage-threshold',
        '0.7',
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('coverage=100.0%');
      expect(result.stdout).toContain('Calibration gate passed.');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
