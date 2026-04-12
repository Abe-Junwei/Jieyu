import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const tmpDir = path.join(workspaceRoot, '.tmp', 'm5');
const vitestJsonPath = path.join(tmpDir, 'm5-runtime-latency.vitest.json');
const vitestJsonPathSecondPass = path.join(tmpDir, 'm5-runtime-latency-pass2.vitest.json');
const metricEventLogPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'audits',
  'M5-观测指标事件流水-v1.ndjson',
);

const runtimeLatencyFiles = [
  'src/hooks/useAiChat.test.tsx',
  'src/pages/useTranscriptionSegmentCreationController.test.tsx',
  'src/pages/useTranscriptionSegmentMutationController.test.tsx',
];

async function readAppVersion() {
  try {
    const packageJsonRaw = await readFile(path.join(workspaceRoot, 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw);
    const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
    return version || '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

function resolveEnvironmentTag() {
  const env = String(process.env.VITE_M5_OBSERVABILITY_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (!env) return process.env.CI ? 'ci' : 'local';
  if (env === 'development' || env === 'dev') return 'local';
  if (env === 'production') return 'prod';
  return env;
}

function resolveRunId() {
  const runId = String(process.env.M5_GATE_RUN_ID ?? process.env.M6_GATE_RUN_ID ?? '').trim();
  return runId || null;
}

function normalizePath(input) {
  return String(input ?? '').replace(/\\/g, '/');
}

function quantile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(ratio * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function collectAssertionDurations(report, fileSuffix) {
  const normalizedSuffix = normalizePath(fileSuffix);
  const suite = (report.testResults ?? []).find((item) => (
    typeof item.name === 'string' && normalizePath(item.name).endsWith(normalizedSuffix)
  ));
  if (!suite) return [];

  const durations = [];
  for (const assertion of suite.assertionResults ?? []) {
    if (assertion.status !== 'passed') continue;
    const duration = Number(assertion.duration ?? NaN);
    if (Number.isFinite(duration) && duration >= 0) {
      durations.push(duration);
    }
  }
  return durations;
}

async function appendMetricEvent(event) {
  await appendFile(metricEventLogPath, `${JSON.stringify(event)}\n`, 'utf8');
}

function runVitestProbe(outputPath) {
  const args = [
    'vitest',
    'run',
    ...runtimeLatencyFiles,
    '--reporter=json',
    '--outputFile',
    outputPath,
  ];

  const command = ['npx', ...args].join(' ');
  console.log(`[m5-runtime-latency] Running: ${command}`);

  const run = spawnSync('npx', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 240_000,
  });

  if (run.status !== 0 || run.signal) {
    console.error('[m5-runtime-latency] Vitest runtime latency probe failed.');
    if (run.stderr) {
      console.error(run.stderr.trim());
    }
    return null;
  }

  return outputPath;
}

async function readVitestReport(reportPath) {
  try {
    const raw = await readFile(reportPath, 'utf8');
    const report = JSON.parse(raw);
    if (!report?.success) return null;
    return report;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(tmpDir, { recursive: true });

  const firstPassPath = runVitestProbe(vitestJsonPath);
  if (!firstPassPath) {
    process.exitCode = 1;
    return;
  }

  const firstPassReport = await readVitestReport(firstPassPath);
  if (!firstPassReport) {
    console.error('[m5-runtime-latency] Missing or invalid vitest json report.');
    process.exitCode = 1;
    return;
  }

  let aiDurations = collectAssertionDurations(firstPassReport, 'src/hooks/useAiChat.test.tsx');
  let segmentDurations = [
    ...collectAssertionDurations(firstPassReport, 'src/pages/useTranscriptionSegmentMutationController.test.tsx'),
    ...collectAssertionDurations(firstPassReport, 'src/pages/useTranscriptionSegmentCreationController.test.tsx'),
  ];

  if (segmentDurations.length < 20) {
    console.log('[m5-runtime-latency] sampleCount < 20, running second probe pass.');
    const secondPassPath = runVitestProbe(vitestJsonPathSecondPass);
    if (secondPassPath) {
      const secondPassReport = await readVitestReport(secondPassPath);
      if (secondPassReport) {
        aiDurations = aiDurations.concat(
          collectAssertionDurations(secondPassReport, 'src/hooks/useAiChat.test.tsx'),
        );
        segmentDurations = segmentDurations.concat(
          collectAssertionDurations(secondPassReport, 'src/pages/useTranscriptionSegmentMutationController.test.tsx'),
          collectAssertionDurations(secondPassReport, 'src/pages/useTranscriptionSegmentCreationController.test.tsx'),
        );
      }
    }
  }

  if (aiDurations.length === 0 || segmentDurations.length === 0) {
    console.error('[m5-runtime-latency] Missing duration samples from probe suites.');
    process.exitCode = 1;
    return;
  }

  const aiSummary = summarize(aiDurations);
  const segmentSummary = summarize(segmentDurations);

  const version = await readAppVersion();
  const environment = resolveEnvironmentTag();
  const runId = resolveRunId();
  const eventAt = new Date().toISOString();

  await appendMetricEvent({
    id: 'ai.chat.first_token_latency_ms',
    value: Number(aiSummary.p95.toFixed(3)),
    at: eventAt,
    tags: {
      version,
      module: 'release-gate',
      environment,
      source: 'vitest-runtime-latency-probe',
      measurementClass: 'synthetic-test-probe',
      suite: 'useAiChat.test.tsx',
      sampleCount: aiSummary.count,
      p50: Number(aiSummary.p50.toFixed(3)),
      p95: Number(aiSummary.p95.toFixed(3)),
      min: Number(aiSummary.min.toFixed(3)),
      max: Number(aiSummary.max.toFixed(3)),
      ...(runId ? { runId } : {}),
    },
  });

  await appendMetricEvent({
    id: 'business.transcription.segment_action_latency_ms',
    value: Number(segmentSummary.p95.toFixed(3)),
    at: eventAt,
    tags: {
      version,
      module: 'release-gate',
      environment,
      source: 'vitest-runtime-latency-probe',
      measurementClass: 'synthetic-test-probe',
      suite: 'useTranscriptionSegmentMutationController.test.tsx+useTranscriptionSegmentCreationController.test.tsx',
      sampleCount: segmentSummary.count,
      p50: Number(segmentSummary.p50.toFixed(3)),
      p95: Number(segmentSummary.p95.toFixed(3)),
      min: Number(segmentSummary.min.toFixed(3)),
      max: Number(segmentSummary.max.toFixed(3)),
      ...(runId ? { runId } : {}),
    },
  });

  console.log(
    `[m5-runtime-latency] ai.chat.first_token_latency_ms p95=${aiSummary.p95.toFixed(3)}ms (n=${aiSummary.count})`,
  );
  console.log(
    `[m5-runtime-latency] business.transcription.segment_action_latency_ms p95=${segmentSummary.p95.toFixed(3)}ms (n=${segmentSummary.count})`,
  );
  console.log(`[m5-runtime-latency] Events appended: ${path.relative(workspaceRoot, metricEventLogPath)}`);
}

main().catch((error) => {
  console.error('[m5-runtime-latency] Unexpected error:', error);
  process.exitCode = 1;
});
