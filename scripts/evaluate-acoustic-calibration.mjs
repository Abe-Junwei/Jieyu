#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_REFERENCE = 'public/data/acoustic-calibration/praat-reference.sample.json';
const DEFAULT_CANDIDATE = 'public/data/acoustic-calibration/jieyu-candidate.sample.json';
const DEFAULT_MAX_DELTA_SEC = 0.015;

const DEFAULT_THRESHOLDS = {
  f0Hz: 20,
  intensityDb: 3,
  formantF1Hz: 180,
  formantF2Hz: 280,
};

function parseArgs(argv) {
  const args = {
    reference: DEFAULT_REFERENCE,
    candidate: DEFAULT_CANDIDATE,
    maxDeltaSec: DEFAULT_MAX_DELTA_SEC,
    thresholds: { ...DEFAULT_THRESHOLDS },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--reference' && next) {
      args.reference = next;
      index += 1;
      continue;
    }
    if (token === '--candidate' && next) {
      args.candidate = next;
      index += 1;
      continue;
    }
    if (token === '--max-delta-sec' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.maxDeltaSec = parsed;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f0' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.f0Hz = parsed;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-intensity' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.intensityDb = parsed;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f1' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.formantF1Hz = parsed;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f2' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.formantF2Hz = parsed;
      }
      index += 1;
      continue;
    }
  }

  return args;
}

async function readJsonFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function nearestFrame(frames, timeSec, maxDeltaSec) {
  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const delta = Math.abs((frame.timeSec ?? 0) - timeSec);
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta > maxDeltaSec) return null;
  return best;
}

function evaluateMetric(referenceFrames, candidateFrames, key, maxDeltaSec) {
  let matched = 0;
  let absErrorSum = 0;

  for (const reference of referenceFrames) {
    const refValue = reference[key];
    if (typeof refValue !== 'number' || !Number.isFinite(refValue)) continue;

    const candidate = nearestFrame(candidateFrames, reference.timeSec ?? 0, maxDeltaSec);
    if (!candidate) continue;

    const candidateValue = candidate[key];
    if (typeof candidateValue !== 'number' || !Number.isFinite(candidateValue)) continue;

    matched += 1;
    absErrorSum += Math.abs(refValue - candidateValue);
  }

  return {
    matched,
    mae: matched > 0 ? absErrorSum / matched : null,
    coverage: referenceFrames.length > 0 ? matched / referenceFrames.length : 0,
  };
}

function printMetric(label, metric, threshold) {
  const maeLabel = metric.mae == null ? 'n/a' : metric.mae.toFixed(3);
  const coverageLabel = `${(metric.coverage * 100).toFixed(1)}%`;
  const status = metric.mae != null && metric.mae <= threshold && metric.coverage >= 0.7 ? 'PASS' : 'FAIL';
  console.log(`${status.padEnd(5)} ${label.padEnd(12)} mae=${maeLabel.padStart(8)} threshold<=${threshold.toFixed(3)} coverage=${coverageLabel}`);
  return status === 'PASS';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reference = await readJsonFile(args.reference);
  const candidate = await readJsonFile(args.candidate);

  const referenceFrames = Array.isArray(reference.frames) ? reference.frames : [];
  const candidateFrames = Array.isArray(candidate.frames) ? candidate.frames : [];

  if (referenceFrames.length === 0 || candidateFrames.length === 0) {
    console.error('Calibration input is invalid: both files need a non-empty frames array.');
    process.exit(1);
  }

  console.log('Acoustic calibration evaluation');
  console.log(`reference=${args.reference}`);
  console.log(`candidate=${args.candidate}`);
  console.log(`maxDeltaSec=${args.maxDeltaSec}`);

  const metrics = {
    f0Hz: evaluateMetric(referenceFrames, candidateFrames, 'f0Hz', args.maxDeltaSec),
    intensityDb: evaluateMetric(referenceFrames, candidateFrames, 'intensityDb', args.maxDeltaSec),
    formantF1Hz: evaluateMetric(referenceFrames, candidateFrames, 'formantF1Hz', args.maxDeltaSec),
    formantF2Hz: evaluateMetric(referenceFrames, candidateFrames, 'formantF2Hz', args.maxDeltaSec),
  };

  const passF0 = printMetric('f0Hz', metrics.f0Hz, args.thresholds.f0Hz);
  const passIntensity = printMetric('intensityDb', metrics.intensityDb, args.thresholds.intensityDb);
  const passF1 = printMetric('formantF1Hz', metrics.formantF1Hz, args.thresholds.formantF1Hz);
  const passF2 = printMetric('formantF2Hz', metrics.formantF2Hz, args.thresholds.formantF2Hz);

  const allPass = passF0 && passIntensity && passF1 && passF2;
  if (!allPass) {
    console.error('Calibration gate failed: at least one metric exceeds threshold or lacks enough coverage.');
    process.exit(1);
  }

  console.log('Calibration gate passed.');
}

main().catch((error) => {
  console.error('Calibration script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
