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

function resolveReportPath() {
  const raw = readArg('--report');
  if (!raw) {
    process.stderr.write('missing required argument: --report=<path-to-release-evidence.json>\n');
    process.exit(1);
  }
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function assertFiniteNumber(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`invalid ${keyPath}: expected finite number`);
  }
}

function assertNonNegativeInteger(value, keyPath) {
  assertFiniteNumber(value, keyPath);
  if (!Number.isInteger(value) || value < 0) {
    fail(`invalid ${keyPath}: expected non-negative integer`);
  }
}

function main() {
  const reportPath = resolveReportPath();
  const requireCompareReady = hasFlag('--require-compare-ready');

  if (!fs.existsSync(reportPath)) {
    fail(`release-evidence report not found: ${path.relative(repoRoot, reportPath)}`);
  }

  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const costGuard = payload?.costGuard;
  const trend = costGuard?.trend;

  if (!costGuard || typeof costGuard !== 'object') {
    fail('invalid report: missing costGuard section');
  }
  if (!trend || typeof trend !== 'object') {
    fail('invalid report: missing costGuard.trend section');
  }

  if (trend.bucket !== 'day') {
    fail(`invalid costGuard.trend.bucket: expected "day", got "${String(trend.bucket)}"`);
  }
  if (typeof trend.compareReady !== 'boolean') {
    fail('invalid costGuard.trend.compareReady: expected boolean');
  }
  assertNonNegativeInteger(trend.pointCount, 'costGuard.trend.pointCount');

  if (!Array.isArray(trend.points)) {
    fail('invalid costGuard.trend.points: expected array');
  }
  if (trend.points.length !== trend.pointCount) {
    fail('invalid costGuard.trend: points length does not match pointCount');
  }

  for (let index = 0; index < trend.points.length; index += 1) {
    const point = trend.points[index];
    if (!point || typeof point !== 'object') {
      fail(`invalid costGuard.trend.points[${index}]: expected object`);
    }
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
    fail('costGuard.trend.compareReady is false but --require-compare-ready is set');
  }

  process.stdout.write(
    `cost guard trend gate passed: pointCount=${trend.pointCount}, compareReady=${trend.compareReady ? 'true' : 'false'}\n`,
  );
}

main();
