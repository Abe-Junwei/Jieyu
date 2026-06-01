#!/usr/bin/env node
/**
 * Read-only DB integrity diagnostics gate.
 *
 * Default mode is dry-run/read-only: it validates that the deep diagnostic API and
 * key Dexie index contracts are covered by tests. It never writes application data.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run') || args.size === 0;

function fail(message) {
  console.error(`[check-db-integrity-diagnostics] FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`[check-db-integrity-diagnostics] OK: ${message}`);
}

if (!isDryRun) {
  fail('only --dry-run/read-only mode is supported');
}

const probePath = 'src/db/dbIntegrityProbe.ts';
const probeTestPath = 'src/db/dbIntegrityProbe.test.ts';

if (!existsSync(probePath)) fail(`missing ${probePath}`);
if (!existsSync(probeTestPath)) fail(`missing ${probeTestPath}`);

const probeSource = readFileSync(probePath, 'utf8');
const probeTestSource = readFileSync(probeTestPath, 'utf8');

if (!probeSource.includes('runJieyuDatabaseDeepDiagnostics')) {
  fail('deep diagnostic API is not exported from dbIntegrityProbe.ts');
}
if (!probeSource.includes("mode: 'sample' | 'full'")) {
  fail('deep diagnostic report does not expose sample/full mode');
}
if (!probeTestSource.includes('deep diagnostics full scan catches references beyond the migration sample window')) {
  fail('missing full-scan regression test for sample-window misses');
}
if (!probeTestSource.includes('live Dexie schema keeps key diagnostic indexes available')) {
  fail('missing live Dexie schema/index contract test');
}

const result = spawnSync(
  'npx',
  ['vitest', 'run', probeTestPath, '--reporter=dot'],
  { encoding: 'utf8', stdio: 'pipe' },
);

if (result.status !== 0) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  fail(`db integrity diagnostics tests failed\n${output}`);
}

pass('deep diagnostics API, full-scan regression, and key index contracts are covered');
