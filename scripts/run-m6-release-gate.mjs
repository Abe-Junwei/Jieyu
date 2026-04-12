import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();

function parseModeArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!raw) return 'enforce';
  const mode = raw.slice('--mode='.length).trim().toLowerCase();
  return mode === 'shadow' ? 'shadow' : 'enforce';
}

function generateRunId() {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `m6-${compact}-${randomUUID().slice(0, 8)}`;
}

function resolveRunId() {
  const runId = String(process.env.M6_GATE_RUN_ID ?? process.env.M5_GATE_RUN_ID ?? '').trim();
  return runId || generateRunId();
}

function runStep(command, args, env) {
  const display = [command, ...args].join(' ');
  console.log(`[m6-gate-runner] Running: ${display}`);
  const run = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env,
  });
  if (run.status !== 0 || run.signal) {
    const signalMessage = run.signal ? `, signal=${run.signal}` : '';
    throw new Error(`[m6-gate-runner] Step failed: ${display} (exit=${run.status ?? -1}${signalMessage})`);
  }
}

function main() {
  const mode = parseModeArg();
  const runId = resolveRunId();
  const env = {
    ...process.env,
    M5_GATE_RUN_ID: String(process.env.M5_GATE_RUN_ID ?? runId),
    M6_GATE_RUN_ID: runId,
  };

  console.log(`[m6-gate-runner] mode=${mode}, runId=${runId}`);

  runStep('npm', ['run', 'gate:m5-observability'], env);
  runStep('node', ['scripts/evaluate-m6-release-gate.mjs', `--mode=${mode}`, `--run-id=${runId}`], env);

  console.log('[m6-gate-runner] Completed.');
}

try {
  main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
