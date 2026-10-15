#!/usr/bin/env node
// scripts/generate-plans-readme.mjs
//
// Regenerates docs/execution/plans/README.md as an auto-generated
// index of open and deferred plans. Closed plans are deleted (ADR-0051).
//
// Source of truth: YAML frontmatter on each plan file (see
// scripts/check-plans-frontmatter.mjs).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PLANS_DIR = resolve(ROOT, 'docs/execution/plans');
const README_PATH = resolve(PLANS_DIR, 'README.md');

const ACTIVE_STATUSES = new Set(['active', 'draft', 'proposed', 'deferred']);

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

const files = readdirSync(PLANS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .filter((f) => statSync(resolve(PLANS_DIR, f)).isFile());

const entries = files.map((filename) => {
  const txt = readFileSync(resolve(PLANS_DIR, filename), 'utf8');
  const fm = parseFrontmatter(txt) ?? {};
  return {
    filename,
    title: fm.title || filename.replace(/\.md$/, ''),
    status: fm.status || 'unknown',
    lastReviewed: fm.last_reviewed || '',
    revisitWhen: fm.revisit_when || '',
  };
});

const open = entries.filter((e) => e.status === 'active' || e.status === 'draft' || e.status === 'proposed');
const deferred = entries.filter((e) => e.status === 'deferred');
const unknown = entries.filter((e) => !ACTIVE_STATUSES.has(e.status));

open.sort((a, b) => (b.lastReviewed || '').localeCompare(a.lastReviewed || ''));
deferred.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'));

const today = new Date().toISOString().slice(0, 10);
const out = [];
out.push('---');
out.push('title: execution/plans 文档索引（自动生成）');
out.push('doc_type: execution-plans-index');
out.push('status: active');
out.push('owner: repo');
out.push(`last_reviewed: ${today}`);
out.push('source_of_truth: execution-plan-index');
out.push('---');
out.push('');
out.push('# execution/plans 文档索引');
out.push('');
out.push('> 本文件由 `npm run generate:plans-readme` 自动生成，**请勿手改**。新增/收口 plan 后重跑该命令。');
out.push('> SSoT：每份 plan 的 YAML frontmatter `status` 字段（守卫：`npm run check:plans-frontmatter`）。');
out.push('');
out.push(`## 进行中（${open.length}）`);
out.push('');
out.push('| status | title | last_reviewed |');
out.push('| --- | --- | --- |');
for (const e of open) {
  out.push(`| ${e.status} | [${e.title}](./${e.filename}) | ${e.lastReviewed} |`);
}
out.push('');

if (deferred.length > 0) {
  out.push(`## 搁置（${deferred.length}）`);
  out.push('');
  out.push('不在当前试用程。`revisit_when` 发生时改回 `active`，确定不做就删除。');
  out.push('');
  out.push('| title | revisit_when | last_reviewed |');
  out.push('| --- | --- | --- |');
  for (const e of deferred) {
    out.push(`| [${e.title}](./${e.filename}) | ${e.revisitWhen} | ${e.lastReviewed} |`);
  }
  out.push('');
}

if (unknown.length > 0) {
  out.push(`## Unknown status（${unknown.length}） — 守卫应已拦截，重跑 \`check:plans-frontmatter\``);
  out.push('');
  for (const e of unknown) {
    out.push(`- [${e.title}](./${e.filename}) — status=\`${e.status}\``);
  }
  out.push('');
}

writeFileSync(README_PATH, out.join('\n'), 'utf8');
console.log(`[generate-plans-readme] OK: wrote ${open.length} open + ${deferred.length} deferred (${unknown.length} unknown) to ${README_PATH}.`);
