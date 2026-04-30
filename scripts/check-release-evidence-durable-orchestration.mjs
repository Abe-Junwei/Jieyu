import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readArg(name) {
  const prefix = `${name}=`;
  const matched = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!matched) return null;
  return matched.slice(prefix.length).trim();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function resolveReportPath() {
  const raw = readArg('--report');
  if (!raw) fail('missing required argument: --report=<path-to-release-evidence.json>');
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function toOptionalNonNegativeNumber(name) {
  const raw = readArg(name);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`invalid ${name}: expected non-negative number`);
  }
  return parsed;
}

function assertNonNegativeInteger(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`invalid ${keyPath}: expected non-negative integer`);
  }
}

function assertRate(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`invalid ${keyPath}: expected number in [0,1]`);
  }
}

function main() {
  const reportPath = resolveReportPath();
  const minTotal = toOptionalNonNegativeNumber('--min-total') ?? 1;
  const minCheckpointed = toOptionalNonNegativeNumber('--min-checkpointed') ?? 1;
  const minCheckpointRecoveryRate = toOptionalNonNegativeNumber('--min-checkpoint-recovery-rate') ?? 0;

  if (!Number.isInteger(minTotal) || !Number.isInteger(minCheckpointed)) {
    fail('invalid minimum count: --min-total and --min-checkpointed must be integers');
  }
  if (minCheckpointRecoveryRate > 1) {
    fail('invalid --min-checkpoint-recovery-rate: expected number in [0,1]');
  }

  if (!fs.existsSync(reportPath)) {
    fail(`release-evidence report not found: ${path.relative(repoRoot, reportPath)}`);
  }

  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const section = payload?.durableOrchestration;
  if (!section || typeof section !== 'object') {
    fail('invalid report: missing durableOrchestration section');
  }
  if (section.status !== 'ready_or_partial' && section.status !== 'ready') {
    fail(`durable orchestration gate failed: unexpected status=${String(section.status)}`);
  }

  const summary = section.summary;
  if (!summary || typeof summary !== 'object') {
    fail('invalid report: missing durableOrchestration.summary');
  }

  assertNonNegativeInteger(summary.total, 'durableOrchestration.summary.total');
  assertNonNegativeInteger(summary.done, 'durableOrchestration.summary.done');
  assertNonNegativeInteger(summary.failed, 'durableOrchestration.summary.failed');
  assertNonNegativeInteger(summary.cancelledByUser, 'durableOrchestration.summary.cancelledByUser');
  assertNonNegativeInteger(summary.running, 'durableOrchestration.summary.running');
  assertNonNegativeInteger(summary.pending, 'durableOrchestration.summary.pending');
  assertNonNegativeInteger(summary.checkpointed, 'durableOrchestration.summary.checkpointed');
  assertNonNegativeInteger(summary.resumable, 'durableOrchestration.summary.resumable');
  assertNonNegativeInteger(summary.handoffRequired, 'durableOrchestration.summary.handoffRequired');
  assertNonNegativeInteger(summary.checkpointRecovered, 'durableOrchestration.summary.checkpointRecovered');
  assertRate(summary.longTaskCompletionRate, 'durableOrchestration.summary.longTaskCompletionRate');
  assertRate(summary.humanInterventionRate, 'durableOrchestration.summary.humanInterventionRate');
  assertRate(summary.checkpointRecoveryRate, 'durableOrchestration.summary.checkpointRecoveryRate');

  if (summary.total < minTotal) {
    fail(`durable orchestration gate failed: total=${summary.total} is below required minimum ${minTotal}`);
  }
  if (summary.checkpointed < minCheckpointed) {
    fail(`durable orchestration gate failed: checkpointed=${summary.checkpointed} is below required minimum ${minCheckpointed}`);
  }
  if (summary.checkpointRecoveryRate < minCheckpointRecoveryRate) {
    fail(
      `durable orchestration gate failed: checkpointRecoveryRate=${summary.checkpointRecoveryRate.toFixed(4)} is below ${minCheckpointRecoveryRate.toFixed(4)}`,
    );
  }

  const taskTypes = section.taskTypes;
  if (!taskTypes || typeof taskTypes !== 'object' || Array.isArray(taskTypes)) {
    fail('invalid report: missing durableOrchestration.taskTypes object');
  }
  const handoffReasons = section.handoffReasons;
  if (!handoffReasons || typeof handoffReasons !== 'object' || Array.isArray(handoffReasons)) {
    fail('invalid report: missing durableOrchestration.handoffReasons object');
  }

  const evidenceIndex = Array.isArray(payload?.evidenceIndex) ? payload.evidenceIndex : [];
  if (!evidenceIndex.some((item) => item?.conclusionId === 'f3.durable-orchestration.v1')) {
    fail('durable orchestration gate failed: missing evidenceIndex f3.durable-orchestration.v1');
  }

  process.stdout.write(
    `durable orchestration gate passed: total=${summary.total}, cancelledByUser=${summary.cancelledByUser}, checkpointed=${summary.checkpointed}, resumable=${summary.resumable}, checkpointRecoveryRate=${summary.checkpointRecoveryRate.toFixed(4)}\n`,
  );
}

main();