#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DATASET = 'public/data/acoustic-calibration/dataset.fixed.v1.json';
const DEFAULT_REFERENCE = 'public/data/acoustic-calibration/praat-reference.sample.json';
const DEFAULT_CANDIDATE = 'public/data/acoustic-calibration/jieyu-candidate.sample.json';
const DEFAULT_MAX_DELTA_SEC = 0.015;
const DEFAULT_COVERAGE_THRESHOLD = 0.7;

const DEFAULT_THRESHOLDS = {
  f0Hz: 20,
  intensityDb: 3,
  formantF1Hz: 180,
  formantF2Hz: 280,
};

function parseArgs(argv) {
  const args = {
    dataset: DEFAULT_DATASET,
    reference: DEFAULT_REFERENCE,
    candidate: DEFAULT_CANDIDATE,
    maxDeltaSec: DEFAULT_MAX_DELTA_SEC,
    coverageThreshold: DEFAULT_COVERAGE_THRESHOLD,
    thresholds: { ...DEFAULT_THRESHOLDS },
    hasDatasetOverride: false,
    hasReferenceOverride: false,
    hasCandidateOverride: false,
    hasMaxDeltaOverride: false,
    hasCoverageOverride: false,
    thresholdOverrides: {
      f0Hz: false,
      intensityDb: false,
      formantF1Hz: false,
      formantF2Hz: false,
    },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--dataset' && next) {
      args.dataset = next;
      args.hasDatasetOverride = true;
      index += 1;
      continue;
    }
    if (token === '--reference' && next) {
      args.reference = next;
      args.hasReferenceOverride = true;
      index += 1;
      continue;
    }
    if (token === '--candidate' && next) {
      args.candidate = next;
      args.hasCandidateOverride = true;
      index += 1;
      continue;
    }
    if (token === '--max-delta-sec' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.maxDeltaSec = parsed;
        args.hasMaxDeltaOverride = true;
      }
      index += 1;
      continue;
    }
    if (token === '--coverage-threshold' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
        args.coverageThreshold = parsed;
        args.hasCoverageOverride = true;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f0' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.f0Hz = parsed;
        args.thresholdOverrides.f0Hz = true;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-intensity' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.intensityDb = parsed;
        args.thresholdOverrides.intensityDb = true;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f1' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.formantF1Hz = parsed;
        args.thresholdOverrides.formantF1Hz = true;
      }
      index += 1;
      continue;
    }
    if (token === '--threshold-f2' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.thresholds.formantF2Hz = parsed;
        args.thresholdOverrides.formantF2Hz = true;
      }
      index += 1;
      continue;
    }
  }

  return args;
}

async function readJsonFile(filePath, baseDir = process.cwd()) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
  const raw = await readFile(absolutePath, 'utf8');
  return {
    data: JSON.parse(raw),
    absolutePath,
  };
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
  let eligibleReferenceCount = 0;

  for (const reference of referenceFrames) {
    const refValue = reference[key];
    if (typeof refValue !== 'number' || !Number.isFinite(refValue)) continue;
    eligibleReferenceCount += 1;

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
    coverage: eligibleReferenceCount > 0 ? matched / eligibleReferenceCount : 0,
  };
}

function normalizeThresholds(overrides, fallback) {
  const base = fallback ?? DEFAULT_THRESHOLDS;
  const merged = {
    f0Hz: base.f0Hz,
    intensityDb: base.intensityDb,
    formantF1Hz: base.formantF1Hz,
    formantF2Hz: base.formantF2Hz,
  };
  if (!overrides || typeof overrides !== 'object') {
    return merged;
  }

  const metricKeys = Object.keys(merged);
  for (const key of metricKeys) {
    const candidate = overrides[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      merged[key] = candidate;
    }
  }
  return merged;
}

function metricPass(metric, threshold, coverageThreshold) {
  return metric.mae != null && metric.mae <= threshold && metric.coverage >= coverageThreshold;
}

function printMetric(label, metric, threshold, coverageThreshold) {
  const maeLabel = metric.mae == null ? 'n/a' : metric.mae.toFixed(3);
  const coverageLabel = `${(metric.coverage * 100).toFixed(1)}%`;
  const status = metricPass(metric, threshold, coverageThreshold) ? 'PASS' : 'FAIL';
  console.log(
    `${status.padEnd(5)} ${label.padEnd(12)} mae=${maeLabel.padStart(8)} threshold<=${threshold.toFixed(3)} coverage=${coverageLabel} minCoverage>=${coverageThreshold.toFixed(2)}`,
  );
  return status === 'PASS';
}

function readFrames(payload) {
  return Array.isArray(payload?.frames) ? payload.frames : [];
}

function ensureNonEmptyFrames(referenceFrames, candidateFrames) {
  if (referenceFrames.length === 0 || candidateFrames.length === 0) {
    throw new Error('Calibration input is invalid: both files need a non-empty frames array.');
  }
}

function evaluateCase(referenceFrames, candidateFrames, options) {
  const metrics = {
    f0Hz: evaluateMetric(referenceFrames, candidateFrames, 'f0Hz', options.maxDeltaSec),
    intensityDb: evaluateMetric(referenceFrames, candidateFrames, 'intensityDb', options.maxDeltaSec),
    formantF1Hz: evaluateMetric(referenceFrames, candidateFrames, 'formantF1Hz', options.maxDeltaSec),
    formantF2Hz: evaluateMetric(referenceFrames, candidateFrames, 'formantF2Hz', options.maxDeltaSec),
  };

  const passF0 = printMetric('f0Hz', metrics.f0Hz, options.thresholds.f0Hz, options.coverageThreshold);
  const passIntensity = printMetric(
    'intensityDb',
    metrics.intensityDb,
    options.thresholds.intensityDb,
    options.coverageThreshold,
  );
  const passF1 = printMetric(
    'formantF1Hz',
    metrics.formantF1Hz,
    options.thresholds.formantF1Hz,
    options.coverageThreshold,
  );
  const passF2 = printMetric(
    'formantF2Hz',
    metrics.formantF2Hz,
    options.thresholds.formantF2Hz,
    options.coverageThreshold,
  );

  return {
    metrics,
    allPass: passF0 && passIntensity && passF1 && passF2,
  };
}

function printCaseHeader(name, options) {
  console.log(`\n[${name}]`);
  console.log(`reference=${options.reference}`);
  console.log(`candidate=${options.candidate}`);
  console.log(`maxDeltaSec=${options.maxDeltaSec}`);
}

function isPositiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function applyCliThresholdOverrides(thresholds, args) {
  const merged = { ...thresholds };
  if (args.thresholdOverrides.f0Hz) {
    merged.f0Hz = args.thresholds.f0Hz;
  }
  if (args.thresholdOverrides.intensityDb) {
    merged.intensityDb = args.thresholds.intensityDb;
  }
  if (args.thresholdOverrides.formantF1Hz) {
    merged.formantF1Hz = args.thresholds.formantF1Hz;
  }
  if (args.thresholdOverrides.formantF2Hz) {
    merged.formantF2Hz = args.thresholds.formantF2Hz;
  }
  return merged;
}

function printDatasetSummary(results) {
  const total = results.length;
  const passed = results.filter((result) => result.allPass).length;
  const failed = total - passed;
  console.log(`\nDataset summary: total=${total}, passed=${passed}, failed=${failed}`);
  if (failed > 0) {
    const failedIds = results.filter((result) => !result.allPass).map((result) => result.id);
    console.log(`Failed samples: ${failedIds.join(', ')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const useSinglePair = args.hasReferenceOverride || args.hasCandidateOverride;

  console.log('Acoustic calibration evaluation');

  if (useSinglePair) {
    const referenceResult = await readJsonFile(args.reference);
    const candidateResult = await readJsonFile(args.candidate);
    const referenceFrames = readFrames(referenceResult.data);
    const candidateFrames = readFrames(candidateResult.data);
    ensureNonEmptyFrames(referenceFrames, candidateFrames);

    printCaseHeader('single-pair', {
      reference: args.reference,
      candidate: args.candidate,
      maxDeltaSec: args.maxDeltaSec,
    });

    const singleResult = evaluateCase(referenceFrames, candidateFrames, {
      thresholds: normalizeThresholds(null, args.thresholds),
      maxDeltaSec: args.maxDeltaSec,
      coverageThreshold: args.coverageThreshold,
    });

    if (!singleResult.allPass) {
      console.error('Calibration gate failed: at least one metric exceeds threshold or lacks enough coverage.');
      process.exit(1);
    }

    console.log('Calibration gate passed.');
    return;
  }

  const datasetResult = await readJsonFile(args.dataset);
  const dataset = datasetResult.data;
  const datasetAbsolutePath = datasetResult.absolutePath;
  const datasetDir = path.dirname(datasetAbsolutePath);
  const samples = Array.isArray(dataset?.samples) ? dataset.samples : [];

  if (samples.length === 0) {
    console.error(`Calibration dataset is invalid: no samples found in ${args.dataset}.`);
    process.exit(1);
  }

  console.log(`dataset=${args.dataset}`);
  if (typeof dataset?.version === 'string' && dataset.version.length > 0) {
    console.log(`calibrationVersion=${dataset.version}`);
  }

  const datasetThresholds = normalizeThresholds(dataset?.thresholds, args.thresholds);
  const datasetMaxDeltaSec =
    args.hasMaxDeltaOverride
      ? args.maxDeltaSec
      : (isPositiveFiniteNumber(dataset?.maxDeltaSec) ? dataset.maxDeltaSec : args.maxDeltaSec);
  const datasetCoverageThreshold =
    args.hasCoverageOverride
      ? args.coverageThreshold
      : (
        typeof dataset?.coverageThreshold === 'number' &&
        Number.isFinite(dataset.coverageThreshold) &&
        dataset.coverageThreshold > 0 &&
        dataset.coverageThreshold <= 1
          ? dataset.coverageThreshold
          : args.coverageThreshold
      );
  const mergedDatasetThresholds = applyCliThresholdOverrides(datasetThresholds, args);

  const caseResults = [];
  for (const sample of samples) {
    const id = typeof sample?.id === 'string' && sample.id.length > 0 ? sample.id : null;
    const referenceFile = typeof sample?.reference === 'string' && sample.reference.length > 0 ? sample.reference : null;
    const candidateFile = typeof sample?.candidate === 'string' && sample.candidate.length > 0 ? sample.candidate : null;

    if (!id || !referenceFile || !candidateFile) {
      console.error('Calibration dataset is invalid: each sample must include id/reference/candidate fields.');
      process.exit(1);
    }

    const referenceResult = await readJsonFile(referenceFile, datasetDir);
    const candidateResult = await readJsonFile(candidateFile, datasetDir);
    const referenceFrames = readFrames(referenceResult.data);
    const candidateFrames = readFrames(candidateResult.data);
    ensureNonEmptyFrames(referenceFrames, candidateFrames);

    const sampleThresholds = applyCliThresholdOverrides(
      normalizeThresholds(sample?.thresholds, mergedDatasetThresholds),
      args,
    );
    const sampleMaxDeltaSec = isPositiveFiniteNumber(sample?.maxDeltaSec)
      ? sample.maxDeltaSec
      : datasetMaxDeltaSec;
    const sampleCoverageThreshold =
      typeof sample?.coverageThreshold === 'number' &&
      Number.isFinite(sample.coverageThreshold) &&
      sample.coverageThreshold > 0 &&
      sample.coverageThreshold <= 1
        ? sample.coverageThreshold
        : datasetCoverageThreshold;

    printCaseHeader(id, {
      reference: path.relative(process.cwd(), referenceResult.absolutePath),
      candidate: path.relative(process.cwd(), candidateResult.absolutePath),
      maxDeltaSec: sampleMaxDeltaSec,
    });

    const result = evaluateCase(referenceFrames, candidateFrames, {
      thresholds: sampleThresholds,
      maxDeltaSec: sampleMaxDeltaSec,
      coverageThreshold: sampleCoverageThreshold,
    });
    caseResults.push({
      id,
      allPass: result.allPass,
      metrics: result.metrics,
    });
  }

  printDatasetSummary(caseResults);

  const allPass = caseResults.every((result) => result.allPass);
  if (!allPass) {
    console.error('Calibration gate failed: at least one sample exceeds threshold or lacks enough coverage.');
    process.exit(1);
  }

  console.log('Calibration gate passed.');
}

main().catch((error) => {
  console.error('Calibration script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
