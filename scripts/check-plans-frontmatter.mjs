#!/usr/bin/env node
// scripts/check-plans-frontmatter.mjs
//
// Guard: every docs/execution/plans/*.md (except README.md) must have YAML
// frontmatter declaring `status`. Plans with `status` in {done, completed,
// superseded} must also have `closed_at`. `superseded` plans must declare
// `superseded_by` (path or slug).
//
// Statuses accepted (broader than v4 plan to absorb existing drift):
//   active, draft, proposed, deferred, done, completed, superseded
//
// Exit code 1 on any failure.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = process.cwd();
const PLANS_DIR = resolve(ROOT, 'docs/execution/plans');
const ARCHIVE_DIR = resolve(ROOT, 'docs/execution/archive/plans-closed');

const ALLOWED_STATUSES = new Set([
  'active', 'draft', 'proposed', 'deferred',
  'done', 'completed', 'superseded',
]);
const CLOSED_STATUSES = new Set(['done', 'completed', 'superseded']);

function readPlans(dir) {
  if (!statExists(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .filter((f) => statSync(resolve(dir, f)).isFile())
    .map((f) => resolve(dir, f));
}

function statExists(p) {
  try { statSync(p); return true; } catch { return false; }
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

const failures = [];

function checkOne(file, opts) {
  const txt = readFileSync(file, 'utf8');
  const fm = parseFrontmatter(txt);
  const rel = relative(ROOT, file);

  if (!fm) {
    failures.push(`${rel}: missing YAML frontmatter (need at least \`status:\`)`);
    return;
  }
  if (!fm.status) {
    failures.push(`${rel}: missing \`status\` field in frontmatter`);
    return;
  }
  if (!ALLOWED_STATUSES.has(fm.status)) {
    failures.push(`${rel}: invalid status \`${fm.status}\` (allowed: ${[...ALLOWED_STATUSES].join(', ')})`);
    return;
  }
  if (CLOSED_STATUSES.has(fm.status)) {
    if (!fm.closed_at) {
      failures.push(`${rel}: status=${fm.status} requires \`closed_at:\` field`);
    }
    if (fm.status === 'superseded' && !fm.superseded_by) {
      failures.push(`${rel}: status=superseded requires \`superseded_by:\` field`);
    }
    // NOTE: closed plans may legitimately remain under plans/ when external
    // docs deep-link them by stable path. Status frontmatter is the SSoT;
    // generated indexes (README.md) filter them out automatically.
  }
}

const activePlans = readPlans(PLANS_DIR);
const archivedPlans = readPlans(ARCHIVE_DIR);

for (const f of activePlans) checkOne(f, { expectArchived: true });
for (const f of archivedPlans) checkOne(f, { expectArchived: false });

if (failures.length > 0) {
  console.error(`[check-plans-frontmatter] FAILED: ${failures.length} issue(s).`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `[check-plans-frontmatter] OK: validated ${activePlans.length} active + ${archivedPlans.length} archived plans.`
);
