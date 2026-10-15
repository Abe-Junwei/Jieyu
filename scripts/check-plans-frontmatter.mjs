#!/usr/bin/env node
// scripts/check-plans-frontmatter.mjs
//
// Guard: every docs/execution/plans/*.md (except README.md) must have YAML
// frontmatter declaring an open `status`. Finished, superseded and abandoned
// plans are deleted, not kept with a closed status (ADR-0051). A deferred plan
// must say when to look at it again in `revisit_when`.
//
// Exit code 1 on any failure.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = process.cwd();
const PLANS_DIR = resolve(ROOT, 'docs/execution/plans');

const OPEN_STATUSES = new Set(['active', 'draft', 'proposed', 'deferred']);
const CLOSED_STATUSES = new Set(['done', 'completed', 'superseded', 'abandoned']);

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

function checkOne(file) {
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
  if (CLOSED_STATUSES.has(fm.status)) {
    failures.push(`${rel}: status=${fm.status}; delete the plan, git history keeps it (ADR-0051)`);
    return;
  }
  if (!OPEN_STATUSES.has(fm.status)) {
    failures.push(`${rel}: invalid status \`${fm.status}\` (allowed: ${[...OPEN_STATUSES].join(', ')})`);
    return;
  }
  if (fm.status === 'deferred' && !fm.revisit_when) {
    failures.push(`${rel}: status=deferred requires \`revisit_when:\` (the event that reopens it)`);
  }
}

const activePlans = readPlans(PLANS_DIR);

for (const f of activePlans) checkOne(f);

if (failures.length > 0) {
  console.error(`[check-plans-frontmatter] FAILED: ${failures.length} issue(s).`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `[check-plans-frontmatter] OK: validated ${activePlans.length} plans.`
);
