#!/usr/bin/env node

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

function toAbsolutePath(rawPath, fallbackRelativePath) {
  const effective = rawPath && rawPath.length > 0 ? rawPath : fallbackRelativePath;
  return path.isAbsolute(effective) ? effective : path.resolve(repoRoot, effective);
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

function toPositiveIntArg(name, fallback) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    fail(`invalid ${name}: expected positive integer`);
  }
  return parsed;
}

function toPositiveNumberArg(name, fallback) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`invalid ${name}: expected positive number`);
  }
  return parsed;
}

function assertNonNegativeInteger(value, keyPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`invalid ${keyPath}: expected non-negative integer`);
  }
}

function assertCountMap(value, keyPath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`invalid ${keyPath}: expected object`);
  }
  for (const [key, count] of Object.entries(value)) {
    assertNonNegativeInteger(Number(count), `${keyPath}.${key}`);
  }
}

function parseJsonLineSafely(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readHistoryRates(historyPath, rateKey, excludeGeneratedAt, historyWindow) {
  if (!fs.existsSync(historyPath)) return [];
  const text = fs.readFileSync(historyPath, 'utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const samples = [];
  for (const line of lines) {
    const row = parseJsonLineSafely(line);
    if (!row || typeof row !== 'object') continue;
    if (row.generatedAt === excludeGeneratedAt) continue;
    if (row.status !== 'ready_or_partial') continue;
    const total = Number(row?.summary?.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) continue;
    const value = Number(row?.rates?.[rateKey]);
    if (!Number.isFinite(value) || value < 0) continue;
    samples.push(value);
  }
  return samples.slice(-historyWindow);
}

function computeMean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeStdDev(values, mean) {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function clampRate(value) {
  return Math.max(0, Math.min(1, value));
}

function resolveRateThreshold(options) {
  const {
    fixedMax,
    useHistoryThresholds,
    historySamples,
    minSamples,
    stddevMultiplier,
    rateName,
  } = options;

  if (useHistoryThresholds && historySamples.length >= minSamples) {
    const mean = computeMean(historySamples);
    const stddev = computeStdDev(historySamples, mean);
    const dynamic = clampRate(mean + (stddevMultiplier * stddev));
    const maxAllowed = fixedMax === null ? dynamic : Math.min(dynamic, fixedMax);
    return {
      maxAllowed,
      source: 'history',
      sampleCount: historySamples.length,
      mean,
      stddev,
      rateName,
    };
  }

  if (fixedMax !== null) {
    return {
      maxAllowed: fixedMax,
      source: 'fixed',
      sampleCount: historySamples.length,
      mean: null,
      stddev: null,
      rateName,
    };
  }

  if (useHistoryThresholds) {
    fail(`insufficient history samples for ${rateName}: expected >=${minSamples}, got ${historySamples.length}`);
  }

  return null;
}

function run() {
  const reportPath = toAbsolutePath(
    readArg('--report'),
    'docs/execution/release-gates/release-evidence/release-evidence-session-sidecar-sandbox-baseline.json',
  );
  if (!fs.existsSync(reportPath)) {
    fail(`session-sidecar baseline report not found: ${path.relative(repoRoot, reportPath)}`);
  }

  const maxDenyRate = toOptionalRateArg('--max-deny-rate');
  const maxAskRate = toOptionalRateArg('--max-ask-rate');
  const useHistoryThresholds = hasFlag('--use-history-thresholds');
  const historyWindow = toPositiveIntArg('--history-window', 20);
  const minSamples = toPositiveIntArg('--min-samples', 5);
  const stddevMultiplier = toPositiveNumberArg('--stddev-multiplier', 2);
  const historyPath = toAbsolutePath(
    readArg('--history'),
    'docs/execution/release-gates/release-evidence/release-evidence-session-sidecar-sandbox-baseline.history.ndjson',
  );

  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (Number(payload?.schemaVersion) !== 1) {
    fail('invalid schemaVersion: expected 1');
  }
  const status = String(payload?.status ?? '');
  if (status !== 'ready_or_partial' && status !== 'skipped') {
    fail(`invalid status: expected ready_or_partial|skipped, got ${status}`);
  }

  const summary = payload?.summary;
  if (!summary || typeof summary !== 'object') {
    fail('invalid summary: expected object');
  }
  assertNonNegativeInteger(Number(summary.total), 'summary.total');
  assertNonNegativeInteger(Number(summary.allow), 'summary.allow');
  assertNonNegativeInteger(Number(summary.ask), 'summary.ask');
  assertNonNegativeInteger(Number(summary.deny), 'summary.deny');
  assertNonNegativeInteger(Number(summary.unknown), 'summary.unknown');

  const distributions = payload?.distributions;
  if (!distributions || typeof distributions !== 'object') {
    fail('invalid distributions: expected object');
  }
  assertCountMap(distributions.actions, 'distributions.actions');
  assertCountMap(distributions.reasons, 'distributions.reasons');
  assertCountMap(distributions.gates, 'distributions.gates');

  const total = Number(summary.total);
  if (status === 'ready_or_partial' && total <= 0) {
    fail('invalid ready_or_partial report: summary.total must be > 0');
  }

  const denyRate = total > 0 ? Number(summary.deny) / total : 0;
  const askRate = total > 0 ? Number(summary.ask) / total : 0;

  const generatedAt = typeof payload?.generatedAt === 'string' ? payload.generatedAt : null;
  const denyHistorySamples = useHistoryThresholds
    ? readHistoryRates(historyPath, 'denyRate', generatedAt, historyWindow)
    : [];
  const askHistorySamples = useHistoryThresholds
    ? readHistoryRates(historyPath, 'askRate', generatedAt, historyWindow)
    : [];

  const denyThreshold = resolveRateThreshold({
    fixedMax: maxDenyRate,
    useHistoryThresholds,
    historySamples: denyHistorySamples,
    minSamples,
    stddevMultiplier,
    rateName: 'denyRate',
  });
  const askThreshold = resolveRateThreshold({
    fixedMax: maxAskRate,
    useHistoryThresholds,
    historySamples: askHistorySamples,
    minSamples,
    stddevMultiplier,
    rateName: 'askRate',
  });

  if (denyThreshold && denyRate > denyThreshold.maxAllowed) {
    fail(`session-sidecar baseline failed: denyRate=${denyRate.toFixed(4)} exceeds ${denyThreshold.maxAllowed.toFixed(4)} (${denyThreshold.source})`);
  }
  if (askThreshold && askRate > askThreshold.maxAllowed) {
    fail(`session-sidecar baseline failed: askRate=${askRate.toFixed(4)} exceeds ${askThreshold.maxAllowed.toFixed(4)} (${askThreshold.source})`);
  }

  process.stdout.write(
    `[session-sidecar-baseline] OK status=${status} total=${total} allow=${summary.allow} ask=${summary.ask} deny=${summary.deny} denyRate=${denyRate.toFixed(4)} askRate=${askRate.toFixed(4)} denyThreshold=${denyThreshold ? `${denyThreshold.maxAllowed.toFixed(4)}(${denyThreshold.source}:${denyThreshold.sampleCount})` : 'n/a'} askThreshold=${askThreshold ? `${askThreshold.maxAllowed.toFixed(4)}(${askThreshold.source}:${askThreshold.sampleCount})` : 'n/a'}\n`,
  );
}

run();