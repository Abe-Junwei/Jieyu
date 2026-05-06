#!/usr/bin/env node
/**
 * PR-10: Verify that M5_METRIC_CATALOG contains essential AI performance indicators.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const metricsPath = join(__dirname, '../src/observability/metrics.ts');

function fail(message) {
  process.stderr.write(`[ai-performance-indicators] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[ai-performance-indicators] OK: ${message}\n`);
}

const REQUIRED_AI_METRICS = [
  'ai.chat.first_token_latency_ms',
  'ai.trace.llm_request_latency_ms',
  'ai.trace.llm_first_token_ms',
  'ai.trace.tool_execution_latency_ms',
  'ai.trace.agent_loop_step_latency_ms',
  'ai.chat.completion_success_count',
];

function main() {
  const content = readFileSync(metricsPath, 'utf8');
  const missing = [];
  for (const id of REQUIRED_AI_METRICS) {
    if (!content.includes(`id: '${id}'`)) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    fail(`M5_METRIC_CATALOG missing required AI indicators: ${missing.join(', ')}`);
  }

  ok(`all ${REQUIRED_AI_METRICS.length} required AI performance indicators present in M5_METRIC_CATALOG`);
}

main();
