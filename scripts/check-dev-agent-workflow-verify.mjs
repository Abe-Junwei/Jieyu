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

/** @param {ChangedFile[]} files */
export function hasSpecDirectoryActivity(files) {
  return files.some((f) => {
    const p = f.path.replace(/\\/g, '/');
    return p.startsWith(SPECS_PREFIX) && !p.startsWith(SPECS_TEMPLATE);
  });
}

/**
 * @param {ChangedFile[]} changedFiles
 * @param {{ specResearchFailures?: string[] }} [injected]
 * @returns {string[]} human-readable failures (empty = pass)
 */
export function verifyDevAgentWorkflow(changedFiles, injected = {}) {
  const failures = [];

  if (isDevAgentConfigOnlyChange(changedFiles)) {
    return failures;
  }

  const triggers = detectSddTriggerSignals(changedFiles);
  const specTouched = hasSpecDirectoryActivity(changedFiles);

  if (triggers.length > 0 && !specTouched) {
    const lines = triggers.map((t) => `- ${t.kind}: ${t.detail}`).join('\n');
    failures.push(
      [
        'SDD 触发信号已出现，但本轮 diff 未触及 docs/execution/specs/<slug>/。',
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
