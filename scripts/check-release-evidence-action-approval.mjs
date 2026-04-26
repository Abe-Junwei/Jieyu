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
  if (!raw) {
    fail('missing required argument: --report=<path-to-release-evidence.json>');
  }
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

function assertNonNegativeInteger(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`invalid ${keyPath}: expected non-negative integer`);
  }
}

function main() {
  const reportPath = resolveReportPath();
  const requireHighRiskSignal = hasFlag('--require-high-risk-signal');
  const maxPendingRate = toOptionalRateArg('--max-pending-rate');
  const maxBlockedRate = toOptionalRateArg('--max-blocked-rate');
  const maxFailedRate = toOptionalRateArg('--max-failed-rate');

  if (!fs.existsSync(reportPath)) {
    fail(`release-evidence report not found: ${path.relative(repoRoot, reportPath)}`);
  }

  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const section = payload?.actionApprovalCenter;
  if (!section || typeof section !== 'object') {
    fail('invalid report: missing actionApprovalCenter section');
  }
  const summary = section.summary;
  if (!summary || typeof summary !== 'object') {
    fail('invalid report: missing actionApprovalCenter.summary');
  }

  assertNonNegativeInteger(summary.total, 'actionApprovalCenter.summary.total');
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

  if (maxPendingRate !== null && pendingRate > maxPendingRate) {
    fail(`action approval gate failed: pendingRate=${pendingRate.toFixed(4)} exceeds ${maxPendingRate.toFixed(4)}`);
  }
  if (maxBlockedRate !== null && blockedRate > maxBlockedRate) {
    fail(`action approval gate failed: blockedRate=${blockedRate.toFixed(4)} exceeds ${maxBlockedRate.toFixed(4)}`);
  }
  if (maxFailedRate !== null && failedRate > maxFailedRate) {
    fail(`action approval gate failed: failedRate=${failedRate.toFixed(4)} exceeds ${maxFailedRate.toFixed(4)}`);
  }

  if (requireHighRiskSignal) {
    const highRiskCount = Number(riskTiers.high ?? 0);
    if (!Number.isFinite(highRiskCount) || highRiskCount <= 0) {
      fail('action approval gate failed: expected riskTiers.high > 0');
    }
  }

  process.stdout.write(
    `action approval gate passed: total=${summary.total}, pending=${summary.pending}, blocked=${summary.blocked}, confirmed=${summary.confirmed}, failed=${summary.failed}\n`,
  );
}

main();
