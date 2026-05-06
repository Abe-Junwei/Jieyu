#!/usr/bin/env node
/**
 * PR-3: Agent-evals semantic case runner.
 * Reads fixture cases from cases/ and executes them via vitest.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesDir = join(__dirname, 'cases');

function fail(message) {
  process.stderr.write(`[agent-evals-cases] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[agent-evals-cases] OK: ${message}\n`);
}

function main() {
  const caseFiles = readdirSync(casesDir).filter((f) => f.endsWith('.json'));
  if (caseFiles.length === 0) {
    fail('no case fixtures found in cases/');
  }

  const testFile = join(casesDir, 'semantic-cases.test.ts');
  const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', testFile, '--reporter=verbose'],
    { stdio: 'inherit', cwd: process.cwd() },
  );

  if (result.status !== 0) {
    fail(`${caseFiles.length} semantic case(s) had failures`);
  }

  ok(`${caseFiles.length} semantic case(s) passed`);
}

main();
