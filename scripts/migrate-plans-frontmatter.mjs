#!/usr/bin/env node
// scripts/migrate-plans-frontmatter.mjs
//
// One-shot migration: ensure every docs/execution/plans/*.md (except README.md
// and non-markdown files) has YAML frontmatter with a `status` field. Plans
// without frontmatter receive a minimal stub (status: active by default).
// Known-superseded placeholder plans (per docs/execution/plans/README.md)
// receive status: superseded + superseded_by + closed_at.
//
// Re-runnable: skips files that already have a `status` field.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLANS_DIR = resolve(process.cwd(), 'docs/execution/plans');
const TODAY = new Date().toISOString().slice(0, 10);

// Known closed plans inferred from README.md (placeholder pages merged into
// AI智能体-战略规划与下一步-2026-05-07.md).
const KNOWN_SUPERSEDED = new Map([
  ['AI智能体工业级对标改进计划书-2026-04-25.md', 'AI智能体-战略规划与下一步-2026-05-07.md'],
  ['AI智能体对标-落地修复计划-2026-04-26.md', 'AI智能体-战略规划与下一步-2026-05-07.md'],
  ['AI智能体工业级史诗-落地方案-2026-05-01.md', 'AI智能体-战略规划与下一步-2026-05-07.md'],
  ['AI智能体下一阶段-OKR-草案-2026-05-05.md', 'AI智能体-战略规划与下一步-2026-05-07.md'],
  ['AI智能体-工业对齐优先级与不对标项-2026-05-06.md', 'AI智能体-战略规划与下一步-2026-05-07.md'],
]);

function deriveTitle(filename) {
  return filename.replace(/\.md$/, '');
}

function buildFrontmatter(filename, status, supersededBy) {
  const lines = ['---'];
  lines.push(`title: ${deriveTitle(filename)}`);
  lines.push('doc_type: execution-plan');
  lines.push(`status: ${status}`);
  lines.push('owner: repo');
  lines.push(`last_reviewed: ${TODAY}`);
  if (status === 'superseded' || status === 'done' || status === 'completed') {
    lines.push(`closed_at: ${TODAY}`);
  }
  if (supersededBy) {
    lines.push(`superseded_by: ./${supersededBy}`);
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

const files = readdirSync(PLANS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .filter((f) => statSync(resolve(PLANS_DIR, f)).isFile());

let added = 0;
let skipped = 0;

for (const filename of files) {
  const full = resolve(PLANS_DIR, filename);
  const original = readFileSync(full, 'utf8');
  const fmMatch = original.match(/^---\n([\s\S]*?)\n---/);

  if (fmMatch) {
    const fmBody = fmMatch[1];
    if (!/^status:/m.test(fmBody)) {
      // Has frontmatter but missing status: insert status: active after title (if any)
      const status = KNOWN_SUPERSEDED.has(filename) ? 'superseded' : 'active';
      const closed = (status === 'superseded') ? `\nclosed_at: ${TODAY}` : '';
      const supersededBy = KNOWN_SUPERSEDED.has(filename)
        ? `\nsuperseded_by: ./${KNOWN_SUPERSEDED.get(filename)}`
        : '';
      const newFmBody = `${fmBody}\nstatus: ${status}${closed}${supersededBy}`;
      const updated = original.replace(fmMatch[0], `---\n${newFmBody}\n---`);
      writeFileSync(full, updated, 'utf8');
      console.log(`[migrate] ADD-status ${filename} → ${status}`);
      added += 1;
    } else {
      skipped += 1;
    }
    continue;
  }

  // No frontmatter at all: prepend.
  let status = 'active';
  let supersededBy = undefined;
  if (KNOWN_SUPERSEDED.has(filename)) {
    status = 'superseded';
    supersededBy = KNOWN_SUPERSEDED.get(filename);
  }
  const fm = buildFrontmatter(filename, status, supersededBy);
  writeFileSync(full, `${fm}${original}`, 'utf8');
  console.log(`[migrate] ADD-frontmatter ${filename} → ${status}`);
  added += 1;
}

console.log(`[migrate-plans-frontmatter] OK: added/updated ${added}, skipped ${skipped} of ${files.length} plan files.`);
