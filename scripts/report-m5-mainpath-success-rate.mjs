import { mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const tmpDir = path.join(workspaceRoot, '.tmp', 'm5');
const vitestJsonPath = path.join(tmpDir, 'm5-mainpath.vitest.json');
const metricEventLogPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'audits',
  'M5-观测指标事件流水-v1.ndjson',
);

const mainPathTestFiles = [
  'src/hooks/useAiChat.test.tsx',
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

function quantile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(ratio * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

async function main() {
  await mkdir(tmpDir, { recursive: true });

  const args = [
    'vitest',
    'run',
    ...mainPathTestFiles,
    '--reporter=json',
    '--outputFile',
    vitestJsonPath,
  ];

  const command = ['npx', ...args].join(' ');
  console.log(`[m5-mainpath] Running: ${command}`);

  const run = spawnSync('npx', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 180_000,
  });

  let report = null;
  try {
    const raw = await readFile(vitestJsonPath, 'utf8');
    report = JSON.parse(raw);
  } catch {
    report = null;
  }

  if (!report) {
    console.error('[m5-mainpath] Missing vitest json report; cannot compute success rate metric.');
    process.exitCode = 1;
    return;
  }

  const total = Number(report.numTotalTests ?? 0);
  const passed = Number(report.numPassedTests ?? 0);
  const failed = Number(report.numFailedTests ?? Math.max(0, total - passed));
  const successRate = total > 0 ? passed / total : 0;

  const eventAt = new Date().toISOString();
  const runId = resolveRunId();
  const event = {
    id: 'business.e2e.main_path_success_rate',
    value: Number(successRate.toFixed(6)),
    at: eventAt,
    tags: {
      version: await readAppVersion(),
      module: 'release-gate',
      environment: resolveEnvironmentTag(),
      source: 'vitest-main-path',
      passed,
      total,
      failed,
      p50: quantile([successRate], 0.5),
      p95: quantile([successRate], 0.95),
      ...(runId ? { runId } : {}),
    },
  };

  await appendFile(metricEventLogPath, `${JSON.stringify(event)}\n`, 'utf8');

  const runFailed = run.status !== 0 || run.signal;
  const gateSignal = run.signal ? ` signal=${run.signal}` : '';
  console.log(
    `[m5-mainpath] successRate=${event.value} (${passed}/${total}), runStatus=${run.status ?? -1}${gateSignal}`,
  );
  console.log(`[m5-mainpath] Event appended: ${path.relative(workspaceRoot, metricEventLogPath)}`);

  if (runFailed) {
    console.error('[m5-mainpath] Main path vitest suite failed.');
    if (run.stderr) {
      console.error(run.stderr.trim());
    }
    process.exitCode = 1;
    return;
  }

  if (event.value < 0.99) {
    console.warn('[m5-mainpath] Warning: success rate below SLO(0.99).');
  }
}

main().catch((error) => {
  console.error('[m5-mainpath] Unexpected error:', error);
  process.exitCode = 1;
});
