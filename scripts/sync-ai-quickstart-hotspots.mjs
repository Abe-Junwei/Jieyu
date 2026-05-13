#!/usr/bin/env node
// scripts/sync-ai-quickstart-hotspots.mjs
//
// Refreshes the hotspots:auto block inside AI_QUICKSTART.md with the top
// production files by line count, taken from `npm run report:code-scale`
// (scripts/report-code-scale-baseline.mjs). Run via:
//
//   npm run sync:ai-quickstart-hotspots

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUICKSTART_PATH = resolve(ROOT, 'AI_QUICKSTART.md');
const TOP_N = 15;
const BLOCK_RE = /<!-- hotspots:auto -->[\s\S]*?<!-- \/hotspots:auto -->/;

const reportJson = execFileSync(
  process.execPath,
  ['scripts/report-code-scale-baseline.mjs'],
  { cwd: ROOT, encoding: 'utf8' }
);

let report;
try {
  report = JSON.parse(reportJson);
} catch (err) {
  console.error('[sync-ai-quickstart-hotspots] FAILED to parse report-code-scale output as JSON.');
  console.error(err);
  process.exit(1);
}

const topProd = Array.isArray(report?.topFiles?.production)
  ? report.topFiles.production.slice(0, TOP_N)
  : [];

if (topProd.length === 0) {
  console.error('[sync-ai-quickstart-hotspots] FAILED: report has no topFiles.production entries.');
  process.exit(1);
}

const generatedAt = report?.generatedAt ?? new Date().toISOString();
const lines = [];
lines.push('<!-- hotspots:auto -->');
lines.push('');
lines.push(`> 自动生成于 ${generatedAt}（npm run sync:ai-quickstart-hotspots）。`);
lines.push('');
lines.push('| # | 文件 | 行数 |');
lines.push('| --- | --- | --- |');
topProd.forEach((file, idx) => {
  lines.push(`| ${idx + 1} | \`${file.path}\` | ${file.lines} |`);
});
lines.push('');
lines.push('<!-- /hotspots:auto -->');

const block = lines.join('\n');

const current = readFileSync(QUICKSTART_PATH, 'utf8');
if (!BLOCK_RE.test(current)) {
  console.error('[sync-ai-quickstart-hotspots] FAILED: hotspots:auto block not found in AI_QUICKSTART.md.');
  process.exit(1);
}

const next = current.replace(BLOCK_RE, block);
if (next === current) {
  console.log('[sync-ai-quickstart-hotspots] OK: hotspots block already up to date.');
  process.exit(0);
}

writeFileSync(QUICKSTART_PATH, next, 'utf8');
console.log(`[sync-ai-quickstart-hotspots] OK: refreshed hotspots block with top ${topProd.length} production files.`);
