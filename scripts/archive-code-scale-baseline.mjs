#!/usr/bin/env node
/**
 * Writes `report-code-scale-baseline.mjs` stdout into reports/code-scale/
 * with a timestamped filename plus a stable `latest.json` pointer.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'reports', 'code-scale');
fs.mkdirSync(outDir, { recursive: true });

const child = spawnSync(process.execPath, [path.join(__dirname, 'report-code-scale-baseline.mjs')], {
  cwd: rootDir,
  encoding: 'utf8',
});
if (child.error) {
  console.error(child.error);
  process.exit(1);
}
if (child.status !== 0) {
  console.error(child.stderr || child.stdout);
  process.exit(child.status ?? 1);
}

const body = child.stdout;
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const dated = path.join(outDir, `baseline-${stamp}.json`);
fs.writeFileSync(dated, body, 'utf8');
fs.writeFileSync(path.join(outDir, 'latest.json'), body, 'utf8');
console.log(`Wrote ${path.relative(rootDir, dated)}`);
console.log(`Wrote ${path.relative(rootDir, path.join(outDir, 'latest.json'))}`);
