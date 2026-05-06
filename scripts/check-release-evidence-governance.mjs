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

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
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

function toOptionalRateArg(name) {
  const raw = readArg(name);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    fail(`invalid ${name}: expected number in [0,1]`);
  }
  return parsed;
}

function toOptionalMinBackgroundMemoryTotal() {
  const raw = readArg('--min-background-memory-total');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    fail('invalid --min-background-memory-total: expected integer >= 0');
  }
  return parsed;
}

/** Minimum `actionApprovalCenter.summary.total` (inclusive); strict CI uses this to reject near-empty samples. */
function toOptionalMinApprovalTotal() {
  const raw = readArg('--min-approval-total');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    fail('invalid --min-approval-total: expected integer >= 1');
  }
  return parsed;
}

/** Inclusive max for `failureSignals.rollbackErrorCountBuckets["2+"]` (optional regression guard). */
function toOptionalMaxToolDecisionRollback2Plus() {
  const raw = readArg('--max-tool-decision-rollback-2plus');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    fail('invalid --max-tool-decision-rollback-2plus: expected integer >= 0');
  }
  return parsed;
}

function assertNonNegativeInteger(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`invalid ${keyPath}: expected non-negative integer`);
  }
}

function validateCostGuard(payload, requireCompareReady) {
  const trend = payload?.costGuard?.trend;
  if (!trend || typeof trend !== 'object') fail('invalid report: missing costGuard.trend section');
  if (trend.bucket !== 'day') fail(`invalid costGuard.trend.bucket: expected "day", got "${String(trend.bucket)}"`);
  if (typeof trend.compareReady !== 'boolean') fail('invalid costGuard.trend.compareReady: expected boolean');
  assertNonNegativeInteger(trend.pointCount, 'costGuard.trend.pointCount');
  if (!Array.isArray(trend.points)) fail('invalid costGuard.trend.points: expected array');
  if (trend.points.length !== trend.pointCount) fail('invalid costGuard.trend: points length does not match pointCount');
  for (let index = 0; index < trend.points.length; index += 1) {
    const point = trend.points[index];
    if (!point || typeof point !== 'object') fail(`invalid costGuard.trend.points[${index}]: expected object`);
    if (typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) {
      fail(`invalid costGuard.trend.points[${index}].date: expected yyyy-mm-dd`);
    }
    assertNonNegativeInteger(point.requestCount, `costGuard.trend.points[${index}].requestCount`);
    assertNonNegativeInteger(point.budgetTriggerCount, `costGuard.trend.points[${index}].budgetTriggerCount`);
    assertNonNegativeInteger(point.retryTriggeredCount, `costGuard.trend.points[${index}].retryTriggeredCount`);
    assertNonNegativeInteger(point.retrySuccessCount, `costGuard.trend.points[${index}].retrySuccessCount`);
    assertNonNegativeInteger(point.outputCapTriggeredCount, `costGuard.trend.points[${index}].outputCapTriggeredCount`);
  }
  if (requireCompareReady && trend.compareReady !== true) {
    fail('costGuard.trend.compareReady is false but --require-cost-guard-compare-ready is set');
  }
  return trend;
}

function validateActionApproval(payload, options) {
  const section = payload?.actionApprovalCenter;
  if (!section || typeof section !== 'object') fail('invalid report: missing actionApprovalCenter section');
  const summary = section.summary;
  if (!summary || typeof summary !== 'object') fail('invalid report: missing actionApprovalCenter.summary');
  assertNonNegativeInteger(summary.total, 'actionApprovalCenter.summary.total');
  if (options.minApprovalTotal !== null && summary.total < options.minApprovalTotal) {
    fail(
      `action approval gate failed: actionApprovalCenter.summary.total=${summary.total} is below required minimum ${options.minApprovalTotal}`,
    );
  }
  assertNonNegativeInteger(summary.pending, 'actionApprovalCenter.summary.pending');
  assertNonNegativeInteger(summary.blocked, 'actionApprovalCenter.summary.blocked');
  assertNonNegativeInteger(summary.confirmed, 'actionApprovalCenter.summary.confirmed');
  assertNonNegativeInteger(summary.cancelled, 'actionApprovalCenter.summary.cancelled');
  assertNonNegativeInteger(summary.failed, 'actionApprovalCenter.summary.failed');
  const riskTiers = section.riskTiers;
  if (!riskTiers || typeof riskTiers !== 'object' || Array.isArray(riskTiers)) {
    fail('invalid report: missing actionApprovalCenter.riskTiers object');
  }
  const approvalModes = section.approvalModes;
  if (!approvalModes || typeof approvalModes !== 'object' || Array.isArray(approvalModes)) {
    fail('invalid report: missing actionApprovalCenter.approvalModes object');
  }
  const denominator = Math.max(1, summary.total);
  const pendingRate = summary.pending / denominator;
  const blockedRate = summary.blocked / denominator;
  const failedRate = summary.failed / denominator;
  if (options.maxPendingRate !== null && pendingRate > options.maxPendingRate) {
    fail(`action approval gate failed: pendingRate=${pendingRate.toFixed(4)} exceeds ${options.maxPendingRate.toFixed(4)}`);
  }
  if (options.maxBlockedRate !== null && blockedRate > options.maxBlockedRate) {
    fail(`action approval gate failed: blockedRate=${blockedRate.toFixed(4)} exceeds ${options.maxBlockedRate.toFixed(4)}`);
  }
  if (options.maxFailedRate !== null && failedRate > options.maxFailedRate) {
    fail(`action approval gate failed: failedRate=${failedRate.toFixed(4)} exceeds ${options.maxFailedRate.toFixed(4)}`);
  }
  if (options.requireHighRiskSignal) {
    const highRiskCount = Number(riskTiers.high ?? 0);
    if (!Number.isFinite(highRiskCount) || highRiskCount <= 0) {
      fail('action approval gate failed: expected riskTiers.high > 0');
    }
  }
  return summary;
}

function assertCountMap(value, keyPath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`invalid ${keyPath}: expected object`);
  }
  for (const [key, count] of Object.entries(value)) {
    assertNonNegativeInteger(count, `${keyPath}.${key}`);
  }
}

function validateBackgroundMemoryExtraction(payload, options) {
  const section = payload?.backgroundMemoryExtraction;
  if (!section || typeof section !== 'object') {
    fail('invalid report: missing backgroundMemoryExtraction section');
  }
  if (section.status !== 'ready_or_partial' && section.status !== 'ready' && section.status !== 'skipped') {
    fail(`background memory extraction gate failed: unexpected status=${String(section.status)}`);
  }

  const summary = section.summary;
  if (!summary || typeof summary !== 'object') {
    fail('invalid report: missing backgroundMemoryExtraction.summary');
  }
  assertNonNegativeInteger(summary.total, 'backgroundMemoryExtraction.summary.total');
  assertNonNegativeInteger(summary.scheduled, 'backgroundMemoryExtraction.summary.scheduled');
  assertNonNegativeInteger(summary.merged, 'backgroundMemoryExtraction.summary.merged');
  assertNonNegativeInteger(summary.completed, 'backgroundMemoryExtraction.summary.completed');
  assertNonNegativeInteger(summary.skipped, 'backgroundMemoryExtraction.summary.skipped');
  assertNonNegativeInteger(summary.failed, 'backgroundMemoryExtraction.summary.failed');
  assertNonNegativeInteger(summary.writtenCount, 'backgroundMemoryExtraction.summary.writtenCount');

  if (options.minBackgroundMemoryTotal !== null && summary.total < options.minBackgroundMemoryTotal) {
    fail(
      `background memory extraction gate failed: backgroundMemoryExtraction.summary.total=${summary.total} is below required minimum ${options.minBackgroundMemoryTotal}`,
    );
  }

  const sandboxDecisions = section.sandboxDecisions;
  if (!sandboxDecisions || typeof sandboxDecisions !== 'object') {
    fail('invalid report: missing backgroundMemoryExtraction.sandboxDecisions');
  }
  assertCountMap(sandboxDecisions.actions, 'backgroundMemoryExtraction.sandboxDecisions.actions');
  assertCountMap(sandboxDecisions.reasons, 'backgroundMemoryExtraction.sandboxDecisions.reasons');

  const evidenceIndex = Array.isArray(payload?.evidenceIndex) ? payload.evidenceIndex : [];
  if (!evidenceIndex.some((item) => item?.conclusionId === 'c5.background-memory-extraction.v1')) {
    fail('background memory extraction gate failed: missing evidenceIndex c5.background-memory-extraction.v1');
  }

  return {
    total: summary.total,
    allow: Number.isFinite(Number(sandboxDecisions.actions.allow)) ? Number(sandboxDecisions.actions.allow) : 0,
    ask: Number.isFinite(Number(sandboxDecisions.actions.ask)) ? Number(sandboxDecisions.actions.ask) : 0,
    deny: Number.isFinite(Number(sandboxDecisions.actions.deny)) ? Number(sandboxDecisions.actions.deny) : 0,
  };
}

function validateToolDecisionFailureSignals(payload, options) {
  const section = payload?.toolDecisionFailureSignals;
  if (!section || typeof section !== 'object') {
    fail('invalid report: missing toolDecisionFailureSignals section');
  }
  if (section.status !== 'ready_or_partial' && section.status !== 'ready' && section.status !== 'skipped') {
    fail(`tool decision failure signals gate failed: unexpected status=${String(section.status)}`);
  }
  const fs = section.failureSignals;
  if (!fs || typeof fs !== 'object' || Array.isArray(fs)) {
    fail('invalid report: missing toolDecisionFailureSignals.failureSignals');
  }
  assertNonNegativeInteger(fs.failedDecisionRows, 'toolDecisionFailureSignals.failureSignals.failedDecisionRows');
  const triage = fs.triageCounts;
  if (!triage || typeof triage !== 'object' || Array.isArray(triage)) {
    fail('invalid report: missing toolDecisionFailureSignals.failureSignals.triageCounts');
  }
  for (const key of ['retry', 'clarify', 'human', 'abandon']) {
    assertNonNegativeInteger(Number(triage[key] ?? 0), `toolDecisionFailureSignals.failureSignals.triageCounts.${key}`);
  }
  assertNonNegativeInteger(
    fs.partialExecutionProgressRows,
    'toolDecisionFailureSignals.failureSignals.partialExecutionProgressRows',
  );
  const buckets = fs.rollbackErrorCountBuckets;
  if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) {
    fail('invalid report: missing toolDecisionFailureSignals.failureSignals.rollbackErrorCountBuckets');
  }
  for (const key of ['0', '1', '2+']) {
    assertNonNegativeInteger(Number(buckets[key] ?? 0), `toolDecisionFailureSignals.failureSignals.rollbackErrorCountBuckets.${key}`);
  }
  const handoff = section.durableHandoff;
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    fail('invalid report: missing toolDecisionFailureSignals.durableHandoff');
  }
  if (handoff.status !== 'ready' && handoff.status !== 'skipped') {
    fail(`invalid toolDecisionFailureSignals.durableHandoff.status: expected ready|skipped, got ${String(handoff.status)}`);
  }
  if (handoff.status === 'ready') {
    if (typeof handoff.humanInterventionRate !== 'number' || !Number.isFinite(handoff.humanInterventionRate)) {
      fail('invalid toolDecisionFailureSignals.durableHandoff.humanInterventionRate: expected finite number when status=ready');
    }
    if (!handoff.handoffReasons || typeof handoff.handoffReasons !== 'object' || Array.isArray(handoff.handoffReasons)) {
      fail('invalid report: missing toolDecisionFailureSignals.durableHandoff.handoffReasons');
    }
    assertCountMap(handoff.handoffReasons, 'toolDecisionFailureSignals.durableHandoff.handoffReasons');
  } else if (handoff.humanInterventionRate !== null && typeof handoff.humanInterventionRate !== 'number') {
    fail('invalid toolDecisionFailureSignals.durableHandoff.humanInterventionRate: expected null or number when status=skipped');
  }

  const evidenceIndex = Array.isArray(payload?.evidenceIndex) ? payload.evidenceIndex : [];
  if (!evidenceIndex.some((item) => item?.conclusionId === 't4.tool-decision-failure-signals.v1')) {
    fail('tool decision failure signals gate failed: missing evidenceIndex t4.tool-decision-failure-signals.v1');
  }

  const rollback2Plus = Number(buckets['2+'] ?? 0);
  if (options.maxToolDecisionRollback2Plus !== null && rollback2Plus > options.maxToolDecisionRollback2Plus) {
    fail(
      `tool decision failure signals gate failed: rollbackErrorCountBuckets["2+"]=${rollback2Plus} exceeds max ${options.maxToolDecisionRollback2Plus}`,
    );
  }

  return {
    status: section.status,
    rollback2Plus,
    partialRows: fs.partialExecutionProgressRows,
  };
}

function main() {
  const reportPath = resolveReportPath();
  if (!fs.existsSync(reportPath)) {
    fail(`release-evidence report not found: ${path.relative(repoRoot, reportPath)}`);
  }
  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // PR-1: enforce 模式下禁止 dryRun 与 skipped gate_script
  const mode = String(payload?.metadata?.mode ?? 'enforce').toLowerCase();
  const isEnforce = mode === 'enforce';
  if (isEnforce && payload?.metadata?.dryRun === true) {
    fail('release-evidence governance gate failed: enforce report must not have metadata.dryRun=true');
  }
  if (isEnforce && Array.isArray(payload?.steps)) {
    const skippedSteps = payload.steps.filter((s) => s?.status === 'skipped');
    if (skippedSteps.length > 0) {
      const ids = skippedSteps.map((s) => s.id).join(', ');
      fail(`release-evidence governance gate failed: enforce report contains ${skippedSteps.length} skipped gate_script(s): ${ids}`);
    }
  }

  const trend = validateCostGuard(payload, hasFlag('--require-cost-guard-compare-ready'));
  const minApprovalTotal = toOptionalMinApprovalTotal();
  const summary = validateActionApproval(payload, {
    maxPendingRate: toOptionalRateArg('--max-pending-rate'),
    maxBlockedRate: toOptionalRateArg('--max-blocked-rate'),
    maxFailedRate: toOptionalRateArg('--max-failed-rate'),
    requireHighRiskSignal: hasFlag('--require-high-risk-signal'),
    minApprovalTotal,
  });
  const backgroundMemorySummary = validateBackgroundMemoryExtraction(payload, {
    minBackgroundMemoryTotal: toOptionalMinBackgroundMemoryTotal(),
  });
  const t4Summary = validateToolDecisionFailureSignals(payload, {
    maxToolDecisionRollback2Plus: toOptionalMaxToolDecisionRollback2Plus(),
  });
  const minPart = minApprovalTotal !== null ? `,minApprovalTotal>=${minApprovalTotal}` : '';
  const t4RollbackPart = t4Summary.rollback2Plus !== undefined ? `,rollbackBuckets2Plus=${t4Summary.rollback2Plus}` : '';
  process.stdout.write(
    `release-evidence governance gate passed: compareReady=${trend.compareReady ? 'true' : 'false'}, pointCount=${trend.pointCount}, approval(total=${summary.total},pending=${summary.pending},blocked=${summary.blocked},confirmed=${summary.confirmed},failed=${summary.failed}${minPart}), backgroundMemory(total=${backgroundMemorySummary.total},allow=${backgroundMemorySummary.allow},ask=${backgroundMemorySummary.ask},deny=${backgroundMemorySummary.deny}), toolDecisionFailureSignals(status=${t4Summary.status},partialRows=${t4Summary.partialRows}${t4RollbackPart})\n`,
  );
}

main();
