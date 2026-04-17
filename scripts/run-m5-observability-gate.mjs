import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();

function generateRunId() {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `m5-${compact}-${randomUUID().slice(0, 8)}`;
}

function resolveRunId() {
  const fromEnv = String(process.env.M5_GATE_RUN_ID ?? process.env.M6_GATE_RUN_ID ?? '').trim();
  return fromEnv || generateRunId();
}

function runStep(command, args, env) {
  const display = [command, ...args].join(' ');
  console.log(`[m5-gate] Running: ${display}`);
  const run = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env,
  });
  if (run.status !== 0 || run.signal) {
    const signalMessage = run.signal ? `, signal=${run.signal}` : '';
    throw new Error(`[m5-gate] Step failed: ${display} (exit=${run.status ?? -1}${signalMessage})`);
  }
}

function main() {
  const runId = resolveRunId();
  const env = {
    ...process.env,
    M5_GATE_RUN_ID: runId,
    M6_GATE_RUN_ID: String(process.env.M6_GATE_RUN_ID ?? runId),
  };

  console.log(`[m5-gate] runId=${runId}`);

  runStep('npm', ['run', 'check:m5-observability-foundation'], env);
  runStep('npm', ['run', 'test:otel-contract'], env);
  runStep('npm', ['run', 'test:m5-observability-regression'], env);
  runStep('npm', ['run', 'report:m5-mainpath-success-rate'], env);
  runStep('npm', ['run', 'report:m5-runtime-latency-samples'], env);
  runStep('npm', ['run', 'report:m5-trend'], env);

  console.log('[m5-gate] Completed.');
}

try {
  main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
