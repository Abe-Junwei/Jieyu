#!/usr/bin/env node
// scripts/check-dev-agent-workflow-verify.mjs
//
// 开发 Agent（Cursor/Copilot/Kimi）工作流 verify 守卫 — 不是产品内 AI 助手。
// 在 agent 收尾时检查 Explore→Research→Plan 门禁是否被跳过：
//   1) SDD 触发信号（客观 diff 启发式）出现但 specs/ 无对应活动 → FAIL
//   2) specs/ 有改动 → 跑 check-spec-research-filled
//   3) 仅 dev-agent 配置改动 → 跳过 SDD 启发式（避免自举误报）
//
// 供 .cursor/hooks/stop-verify.mjs 调用；也可手动 npm run check:dev-agent-workflow-verify

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { checkSpecResearchFilled } from './check-spec-research-filled.mjs';

/** @typedef {'A'|'M'|'D'|'R'|'??'} ChangeStatus */
/** @typedef {{ path: string, status: ChangeStatus }} ChangedFile */

const SPECS_PREFIX = 'docs/execution/specs/';
const SPECS_TEMPLATE = 'docs/execution/specs/_template/';

/** 仅改开发 Agent 配置时，不应要求 specs/ 三件套（自举豁免）。 */
const DEV_AGENT_CONFIG_PATHS = [
  '.cursor/',
  '.cursorindexingignore',
  'AGENTS.md',
  'AI_QUICKSTART.md',
  'copilot-instructions.md',
  'scripts/check-dev-agent-workflow-verify.mjs',
  'scripts/check-dev-agent-workflow-verify.test.ts',
  'scripts/check-spec-research-filled.mjs',
  'scripts/check-spec-research-filled.test.ts',
];

const FEATURE_FLAG_FILES = new Set(['src/ai/config/featureFlags.ts', 'src/featureFlags.ts']);

/**
 * @param {ChangedFile[]} files
 */
export function isDevAgentConfigOnlyChange(files) {
  if (files.length === 0) return false;
  return files.every((f) => {
    const p = f.path.replace(/\\/g, '/');
    return DEV_AGENT_CONFIG_PATHS.some((prefix) => p === prefix || p.startsWith(prefix));
  });
}

/**
 * @param {ChangedFile[]} files
 * @returns {Array<{ kind: string, detail: string }>}
 */
export function detectSddTriggerSignals(files) {
  const triggers = [];
  const norm = (p) => p.replace(/\\/g, '/');
  const isAdd = (f) => f.status === 'A' || f.status === '??';
  const isTouch = (f) => f.status === 'A' || f.status === 'M' || f.status === '??' || f.status === 'R';

  for (const f of files) {
    const p = norm(f.path);
    if (/^src\/pages\/use[A-Z][A-Za-z0-9]*Controller\.ts$/.test(p) && isAdd(f)) {
      triggers.push({ kind: 'new_controller', detail: p });
    }
    if (
      /^src\/services\/[A-Z][A-Za-z0-9]*\.ts$/.test(p)
      && isAdd(f)
      && !p.endsWith('.test.ts')
    ) {
      triggers.push({ kind: 'new_service', detail: p });
    }
    if (/^src\/db\/migrations\//.test(p) && isAdd(f)) {
      triggers.push({ kind: 'schema_migration', detail: p });
    }
    if (p === 'src/db/schemas.ts' && isTouch(f)) {
      triggers.push({ kind: 'schema_touch', detail: p });
    }
    if (FEATURE_FLAG_FILES.has(p) && isTouch(f)) {
      triggers.push({ kind: 'feature_flag_touch', detail: p });
    }
  }

  const controllers = files.filter((f) => {
    const p = norm(f.path);
    return /^src\/pages\/use[A-Z][A-Za-z0-9]*Controller\.ts$/.test(p) && isTouch(f);
  });
  if (controllers.length >= 3) {
    triggers.push({
      kind: 'cross_controllers',
      detail: controllers.map((c) => norm(c.path)).join(', '),
    });
  }

  return triggers;
}

/**
 * @param {string} filePath
 * @returns {string | null} specs slug, or null for template / README / a specs-root file
 */
export function specSlugFromPath(filePath) {
  const p = filePath.replace(/\\/g, '/');
  if (!p.startsWith(SPECS_PREFIX) || p.startsWith(SPECS_TEMPLATE)) return null;
  const slug = p.slice(SPECS_PREFIX.length).split('/')[0];
  if (!slug || slug.includes('.') || slug === '..') return null;
  return slug;
}

/** @param {ChangedFile[]} files */
export function hasSpecDirectoryActivity(files) {
  return files.some((f) => f.status !== 'D' && specSlugFromPath(f.path));
}

function designStatus(designPath) {
  let text = '';
  try {
    text = readFileSync(designPath, 'utf8');
  } catch {
    return undefined;
  }
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const m = fm[1].match(/^status:\s*(.*)$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

/**
 * A slug satisfies Implement only when its trio still exists and design is not draft.
 * @param {string} slug
 * @param {string} specRoot
 */
export function specSlugReadyOnDisk(slug, specRoot) {
  const dir = join(specRoot, slug);
  const requirements = join(dir, 'requirements.md');
  const design = join(dir, 'design.md');
  const tasks = join(dir, 'tasks.md');
  for (const filePath of [requirements, design, tasks]) {
    try {
      if (!statSync(filePath).isFile()) return false;
    } catch {
      return false;
    }
  }
  const status = designStatus(design);
  return Boolean(status) && status !== 'draft';
}

/**
 * @param {ChangedFile[]} changedFiles
 * @param {{ specResearchFailures?: string[], specRoot?: string, isImplementSpecReady?: (slug: string) => boolean }} [injected]
 * @returns {string[]} human-readable failures (empty = pass)
 */
export function verifyDevAgentWorkflow(changedFiles, injected = {}) {
  const failures = [];

  if (isDevAgentConfigOnlyChange(changedFiles)) {
    return failures;
  }

  const triggers = detectSddTriggerSignals(changedFiles);
  const specTouched = hasSpecDirectoryActivity(changedFiles);
  const specRoot = injected.specRoot ?? join(process.cwd(), 'docs/execution/specs');
  const implementReady = [...new Set(
    changedFiles
      .filter((f) => f.status !== 'D')
      .map((f) => specSlugFromPath(f.path))
      .filter(Boolean),
  )].some((slug) => (
    injected.isImplementSpecReady
      ? injected.isImplementSpecReady(slug)
      : specSlugReadyOnDisk(slug, specRoot)
  ));

  if (triggers.length > 0 && !implementReady) {
    const lines = triggers.map((t) => `- ${t.kind}: ${t.detail}`).join('\n');
    failures.push(
      [
        'SDD 触发信号已出现，但没有仍存在、且 design 不是 draft 的 specs/<slug>/ 三件套。',
        'specs/README.md、纯删除、以及 draft 都不算 Implement 已有规格。',
        '按 copilot-instructions.md §5.1.5 / §5.2.1：须先 Research → Plan（含 spec 三件套）再 Implement。',
        '触发信号：',
        lines,
        '',
        'Plan 阶段 checklist（须用户确认后再继续 Implement）：',
        '1. Research 综述是否写入 spec design.md §1（非占位符）',
        '2. requirements / design / tasks 三件套是否齐',
        '3. 落位文件 + 验证命令是否明确',
        '4. 用户是否已确认 Plan',
      ].join('\n'),
    );
  }

  if (specTouched) {
    const researchFailures = injected.specResearchFailures ?? [];
    for (const rf of researchFailures) {
      failures.push(`spec Research 未填实：${rf}`);
    }
  }

  return failures;
}

function runGitLines(repoRoot, args) {
  const res = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (res.status !== 0) return [];
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** @returns {ChangedFile[]} */
export function collectWorkingTreeChanges(repoRoot) {
  /** @type {Map<string, ChangedFile>} */
  const byPath = new Map();

  const merge = (status, path) => {
    const normalized = path.replace(/\\/g, '/');
    if (!normalized) return;
    byPath.set(normalized, { path: normalized, status });
  };

  for (const line of runGitLines(repoRoot, ['diff', '--name-status', 'HEAD'])) {
    const renamed = line.match(/^R\d+\s+(\S+)\s+(\S+)$/);
    if (renamed) {
      merge('R', renamed[2]);
      continue;
    }
    const m = line.match(/^([AMD])\s+(.+)$/);
    if (m) merge(/** @type {ChangeStatus} */ (m[1]), m[2]);
  }
  for (const line of runGitLines(repoRoot, ['diff', '--name-status', '--cached'])) {
    const renamed = line.match(/^R\d+\s+(\S+)\s+(\S+)$/);
    if (renamed) {
      merge('R', renamed[2]);
      continue;
    }
    const m = line.match(/^([AMD])\s+(.+)$/);
    if (m) merge(/** @type {ChangeStatus} */ (m[1]), m[2]);
  }
  for (const line of runGitLines(repoRoot, ['ls-files', '--others', '--exclude-standard'])) {
    merge('??', line);
  }

  return [...byPath.values()];
}

function isMainModule() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry.endsWith('check-dev-agent-workflow-verify.mjs');
}

if (isMainModule()) {
  const repoRoot = process.cwd();
  const changed = collectWorkingTreeChanges(repoRoot);
  const specResearchFailures =
    changed.some((f) => f.path.replace(/\\/g, '/').startsWith(SPECS_PREFIX))
      ? checkSpecResearchFilled(join(repoRoot, 'docs/execution/specs'), repoRoot)
      : [];

  const failures = verifyDevAgentWorkflow(changed, { specResearchFailures });

  if (failures.length > 0) {
    console.error(`[check-dev-agent-workflow-verify] FAILED: ${failures.length} issue(s).`);
    for (const f of failures) console.error(`\n${f}\n`);
    process.exit(1);
  }
  console.log('[check-dev-agent-workflow-verify] OK: dev-agent workflow gates satisfied.');
}
