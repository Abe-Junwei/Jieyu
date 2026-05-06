#!/usr/bin/env node
/**
 * PR-9: Workflow cost baseline validator.
 * Reads segment-qa-cost-baseline.json and validates structure.
 * Future: compares actual runtime metrics against baseline thresholds.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, '../docs/execution/release-gates/segment-qa-cost-baseline.json');

function fail(message) {
  process.stderr.write(`[workflow-cost-baseline] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[workflow-cost-baseline] OK: ${message}\n`);
}

function main() {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    fail(`cannot read or parse baseline file: ${err.message}`);
  }

  // Schema validation
  if (baseline.schemaVersion !== 1) {
    fail(`unsupported schemaVersion: ${baseline.schemaVersion}`);
  }
  if (baseline.workflowId !== 'segment_qa') {
    fail(`unexpected workflowId: ${baseline.workflowId}`);
  }

  const requiredBaselineFields = ['avgInputTokens', 'avgOutputTokens', 'avgLatencyMs', 'p95LatencyMs', 'avgRagLatencyMs', 'p95RagLatencyMs'];
  for (const field of requiredBaselineFields) {
    if (typeof baseline.baseline?.[field] !== 'number') {
      fail(`missing or invalid baseline.${field}`);
    }
  }

  const requiredThresholdFields = ['deviationPercent', 'minSampleSize', 'measurementWindowDays'];
  for (const field of requiredThresholdFields) {
    if (typeof baseline.thresholds?.[field] !== 'number') {
      fail(`missing or invalid thresholds.${field}`);
    }
  }

  // Check freshness
  const updatedAt = new Date(baseline.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    fail('invalid updatedAt date');
  }
  const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > baseline.thresholds.measurementWindowDays * 4) {
    fail(`baseline is stale: last updated ${Math.round(daysSinceUpdate)} days ago (window: ${baseline.thresholds.measurementWindowDays} days)`);
  }

  process.stdout.write(`\n[workflow-cost-baseline] segment_qa baseline:\n`);
  process.stdout.write(`  avgInputTokens:  ${baseline.baseline.avgInputTokens}\n`);
  process.stdout.write(`  avgOutputTokens: ${baseline.baseline.avgOutputTokens}\n`);
  process.stdout.write(`  avgLatencyMs:    ${baseline.baseline.avgLatencyMs}\n`);
  process.stdout.write(`  p95LatencyMs:    ${baseline.baseline.p95LatencyMs}\n`);
  process.stdout.write(`  avgRagLatencyMs: ${baseline.baseline.avgRagLatencyMs}\n`);
  process.stdout.write(`  p95RagLatencyMs: ${baseline.baseline.p95RagLatencyMs}\n`);
  process.stdout.write(`  deviationThreshold: ${baseline.thresholds.deviationPercent}%\n`);
  process.stdout.write(`  minSampleSize: ${baseline.thresholds.minSampleSize}\n`);
  process.stdout.write(`  measurementWindowDays: ${baseline.thresholds.measurementWindowDays}\n`);
  process.stdout.write(`  updatedAt: ${baseline.updatedAt} (${Math.round(daysSinceUpdate)} days ago)\n`);

  ok('segment_qa cost baseline is valid and fresh');
}

main();
