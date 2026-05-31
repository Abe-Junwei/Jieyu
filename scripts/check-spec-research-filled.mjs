#!/usr/bin/env node
// scripts/check-spec-research-filled.mjs
//
// Guard (L3, 产物层): SDD spec 的 Research/成熟方案扫描必须真正填写，
// 不能留模板占位符。把工作流 §5.1.5 Research 阶段对"SDD 触发子集"的完成度
// 从纯提示词升级为可机器拦截。
//
// 判定（零误伤存量 spec 的最小规则）：
//   仅当 design.md 同时满足 ↓ 才校验，否则跳过：
//     1) frontmatter status 存在且 ≠ 'draft'（draft 允许半成品）
//     2) 存在 "## 1. …成熟方案…/…Research…" 章节（即采用了新模板）
//   命中校验后，若该章节正文仍含模板占位符（行尾 "：…" / ": …"）或正文为空 → FAIL。
//
// 设计取舍：用"占位符特征"而非"必须含某关键词"判完成度，避免对自由书写的
// 真实调研产生误报；存量/异形 design.md（无成熟方案 §1 段）自动豁免。
//
// Exit code 1 on any failure.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

const RESEARCH_HEADING_RE = /^##\s*1\..*(成熟方案|Research)/im;
const PLACEHOLDER_LINE_RE = /[:：]\s*…\s*$/m;

function statExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function parseStatus(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const m = fm[1].match(/^status:\s*(.*)$/m);
  return m ? m[1].trim() : undefined;
}

/** 提取 "## 1. …" 到下一个 "## " 之间的章节正文（不含标题行）。 */
function extractResearchSection(text) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => RESEARCH_HEADING_RE.test(l));
  if (startIdx === -1) return null;
  const body = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

/**
 * 返回违规说明数组（空数组 = 通过）。
 * @param {string} specsDir specs 根目录
 */
export function checkSpecResearchFilled(specsDir, rootForRel = process.cwd()) {
  const failures = [];
  if (!statExists(specsDir)) return failures;

  const slugs = readdirSync(specsDir).filter((name) => {
    if (name === '_template') return false;
    return statExists(join(specsDir, name)) && statSync(join(specsDir, name)).isDirectory();
  });

  for (const slug of slugs) {
    const designPath = join(specsDir, slug, 'design.md');
    if (!statExists(designPath)) continue;
    const text = readFileSync(designPath, 'utf8');
    const status = parseStatus(text);
    if (!status || status === 'draft') continue; // draft 允许半成品

    const section = extractResearchSection(text);
    if (section === null) continue; // 无成熟方案/Research §1 段 → 豁免（存量/异形）

    const rel = relative(rootForRel, designPath);
    if (section.trim().length === 0) {
      failures.push(`${rel}: §1 成熟方案/Research 段为空（status=${status} 不应留空）`);
      continue;
    }
    if (PLACEHOLDER_LINE_RE.test(section)) {
      failures.push(
        `${rel}: §1 成熟方案/Research 段仍含模板占位符（行尾 "：…"）；status=${status} 需填实调研结论`,
      );
    }
  }

  return failures;
}

function isMainModule() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry.endsWith('check-spec-research-filled.mjs');
}

if (isMainModule()) {
  const specsDir = resolve(process.cwd(), 'docs/execution/specs');
  const failures = checkSpecResearchFilled(specsDir);
  if (failures.length > 0) {
    console.error(`[check-spec-research-filled] FAILED: ${failures.length} issue(s).`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('[check-spec-research-filled] OK: spec Research sections filled (non-draft).');
}
