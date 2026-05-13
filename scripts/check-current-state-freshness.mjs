#!/usr/bin/env node
// scripts/check-current-state-freshness.mjs
//
// Staleness guard for "current state" documents. A doc is in scope when:
//   - doc_type matches `architecture-current-state` (any depth under
//     `docs/architecture/**`), OR
//   - doc_type starts with `architecture-feature-current-state`, OR
//   - frontmatter contains `staleness_check: true`, OR
//   - the path is in the explicit allow-list below.
//
// `last_reviewed` (YYYY-MM-DD) is required. Age policy:
//   - ≥ 180 days → FAIL (exit 1)
//   - ≥ 90 days  → WARN (exit 0, console.warn)
//   - <  90 days → OK
//
// Usage: `npm run check:current-state-freshness`

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = process.cwd();
const ARCH_DIR = resolve(ROOT, 'docs/architecture');
const ALLOW_PATHS = [
  resolve(ROOT, 'copilot-instructions.md'),
  resolve(ROOT, 'AGENTS.md'),
  resolve(ROOT, 'AI_QUICKSTART.md'),
];

const WARN_DAYS = 90;
const FAIL_DAYS = 180;

function walk(dir, acc = []) {
  if (!statSync(dir).isDirectory()) return acc;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (k) fields[k[1]] = k[2].trim();
  }
  return fields;
}

function isInScope(file, fm) {
  if (ALLOW_PATHS.includes(file)) return true;
  if (!fm) return false;
  if (fm.staleness_check === 'true') return true;
  if (!fm.doc_type) return false;
  const dt = fm.doc_type;
  return dt === 'architecture-current-state'
    || dt.startsWith('architecture-feature-current-state');
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const archFiles = walk(ARCH_DIR);
const allCandidates = [...archFiles, ...ALLOW_PATHS];

const failures = [];
const warnings = [];
const okCount = { value: 0 };
const inScopeCount = { value: 0 };

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

for (const file of allCandidates) {
  let txt;
  try { txt = readFileSync(file, 'utf8'); } catch { continue; }
  const fm = parseFrontmatter(txt);
  if (!isInScope(file, fm)) continue;
  inScopeCount.value += 1;
  const rel = relative(ROOT, file);
  const lastReviewed = fm?.last_reviewed;
  if (!lastReviewed) {
    failures.push(`${rel}: in-scope current-state doc missing \`last_reviewed:\` field`);
    continue;
  }
  const date = new Date(`${lastReviewed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    failures.push(`${rel}: invalid \`last_reviewed: ${lastReviewed}\` (expect YYYY-MM-DD)`);
    continue;
  }
  const age = daysBetween(date, today);
  if (age >= FAIL_DAYS) {
    failures.push(`${rel}: last_reviewed ${lastReviewed} is ${age} days old (≥ ${FAIL_DAYS}d FAIL threshold)`);
  } else if (age >= WARN_DAYS) {
    warnings.push(`${rel}: last_reviewed ${lastReviewed} is ${age} days old (≥ ${WARN_DAYS}d WARN threshold)`);
  } else {
    okCount.value += 1;
  }
}

for (const w of warnings) console.warn(`[check-current-state-freshness] WARN: ${w}`);

if (failures.length > 0) {
  console.error(`[check-current-state-freshness] FAILED: ${failures.length} stale doc(s).`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `[check-current-state-freshness] OK: ${okCount.value} fresh / ${warnings.length} warn / ${failures.length} fail (in-scope=${inScopeCount.value}).`
);
