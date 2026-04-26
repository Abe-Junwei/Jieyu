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

function main() {
  const reportPath = resolveReportPath();
  if (!fs.existsSync(reportPath)) {
    fail(`release-evidence report not found: ${path.relative(repoRoot, reportPath)}`);
  }
  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const trend = validateCostGuard(payload, hasFlag('--require-cost-guard-compare-ready'));
  const minApprovalTotal = toOptionalMinApprovalTotal();
  const summary = validateActionApproval(payload, {
    maxPendingRate: toOptionalRateArg('--max-pending-rate'),
    maxBlockedRate: toOptionalRateArg('--max-blocked-rate'),
    maxFailedRate: toOptionalRateArg('--max-failed-rate'),
    requireHighRiskSignal: hasFlag('--require-high-risk-signal'),
    minApprovalTotal,
  });
  const minPart = minApprovalTotal !== null ? `,minApprovalTotal>=${minApprovalTotal}` : '';
  process.stdout.write(
    `release-evidence governance gate passed: compareReady=${trend.compareReady ? 'true' : 'false'}, pointCount=${trend.pointCount}, approval(total=${summary.total},pending=${summary.pending},blocked=${summary.blocked},confirmed=${summary.confirmed},failed=${summary.failed}${minPart})\n`,
  );
}

main();
