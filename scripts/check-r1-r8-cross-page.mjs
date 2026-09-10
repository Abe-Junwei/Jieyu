#!/usr/bin/env node
// scripts/check-r1-r8-cross-page.mjs
//
// P1-5 / B10：三页联评 R1–R8 合入门禁。
// 命中标注 / 词典 / 语料产品路径时，PR 正文必须对 R1–R8 逐项勾选 `[x]` 或写明 `N/A`。
// 锚点：docs/execution/plans/标注词典语料-治理补充规范-2026-04-25.md#r1-r8-cross-page-checklist
//
// 不引入 Danger.js / 第三方 checklist action；复用本仓库 node 守卫 + 路径过滤。
//
// Body 来源：R1_R8_BODY → GITHUB_EVENT_PATH.pull_request.body（不 spawn gh，避免 knip unlisted binary）
// 变更文件：PR 事件用 base.sha 与 HEAD 的两点 diff（浅克隆须先 fetch base）；
//           本地用 origin/main + 工作区。
// CI push（已合入）跳过；CI pull_request 在触发路径命中且清单不全时失败。
// 本地无 PR body 时 skip（除非 R1_R8_ENFORCE=1）。

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const R1_R8_ITEMS = Object.freeze(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']);

/**
 * 仅产品三页路径。scripts/、docs/、.github/、旗标文件不触发，避免门禁自举 PR 误伤。
 * @type {readonly string[]}
 */
export const R1_R8_TRIGGER_PREFIXES = Object.freeze([
  'src/pages/Annotation',
  'src/pages/annotation/',
  'src/pages/Lexicon',
  'src/pages/useLexicon',
  'src/pages/Corpus',
  'src/pages/corpus',
  'src/pages/useCorpus',
  'src/pages/useAnnotation',
  'src/hooks/lexicon/',
  'src/styles/pages/annotation-',
  'src/styles/pages/lexicon-',
  'src/styles/pages/corpus-',
  'src/utils/workspaceReturnDeepLink',
  'src/utils/appShellEvents',
  'src/services/corpus',
  'src/services/linguisticServiceLexeme',
  'src/components/WorkspaceReturnBanner',
]);

/** @param {string} filePath */
export function isR1R8TriggerPath(filePath) {
  const p = String(filePath ?? '').replace(/\\/g, '/');
  if (!p) return false;
  return R1_R8_TRIGGER_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

/** @param {string[]} files */
export function matchR1R8TriggerFiles(files) {
  return files.filter((f) => isR1R8TriggerPath(f));
}

/**
 * @typedef {'ok' | 'missing' | 'unchecked' | 'unmarked'} ChecklistItemStatus
 * @typedef {{ status: ChecklistItemStatus, line?: string, na?: boolean, checked?: boolean }} ChecklistItemResult
 */

/**
 * 每一项须在正文某行出现，且该行带 `[x]`/`[X]` 或 `N/A`。
 * 未勾选的 `[ ]` 且无 N/A 视为失败。多行时任一合格行即可。
 * Id 大小写敏感，且忽略 `R1-R8` / `R1–R8` 范围写法，避免说明段或锚点误伤。
 * @param {string} body
 * @returns {Record<string, ChecklistItemResult>}
 */
export function parseR1R8Checklist(body) {
  const text = String(body ?? '');
  /** @type {Record<string, ChecklistItemResult>} */
  const results = {};
  for (const id of R1_R8_ITEMS) {
    const re = new RegExp(`^.*\\b${id}\\b(?![-–]R\\d).*$`, 'gm');
    const lines = [...text.matchAll(re)].map((m) => m[0]);
    if (lines.length === 0) {
      results[id] = { status: 'missing' };
      continue;
    }
    let okLine;
    let uncheckedLine;
    let unmarkedLine;
    for (const line of lines) {
      const na = /\bN\/A\b/i.test(line);
      const checked = /\[[xX]\]/.test(line);
      const unchecked = /\[[ ]\]/.test(line);
      if (checked || na) {
        okLine = { status: 'ok', line, na, checked };
        break;
      }
      if (unchecked && !uncheckedLine) uncheckedLine = line;
      if (!unmarkedLine) unmarkedLine = line;
    }
    if (okLine) {
      results[id] = okLine;
    } else if (uncheckedLine) {
      results[id] = { status: 'unchecked', line: uncheckedLine };
    } else {
      results[id] = { status: 'unmarked', line: unmarkedLine };
    }
  }
  return results;
}

/**
 * @typedef {'skip' | 'pass' | 'fail'} GateVerdict
 * @typedef {{
 *   verdict: GateVerdict,
 *   reason: string,
 *   triggerFiles: string[],
 *   checklist?: Record<string, ChecklistItemResult>,
 * }} GateResult
 */

/**
 * @param {{
 *   files: string[],
 *   body?: string | null,
 *   eventName?: string,
 *   enforce?: boolean,
 * }} input
 * @returns {GateResult}
 */
export function evaluateR1R8Gate(input) {
  const files = input.files ?? [];
  const eventName = input.eventName ?? 'local';
  const enforce = Boolean(input.enforce);

  if (eventName === 'push') {
    return { verdict: 'skip', reason: 'push event (already merged)', triggerFiles: [] };
  }

  const triggerFiles = matchR1R8TriggerFiles(files);
  if (triggerFiles.length === 0) {
    return { verdict: 'skip', reason: 'no three-page trigger paths', triggerFiles: [] };
  }

  const body = typeof input.body === 'string' ? input.body : '';
  if (!body.trim()) {
    if (enforce) {
      return {
        verdict: 'fail',
        reason: 'three-page paths changed but PR body is missing; tick R1–R8 or write N/A',
        triggerFiles,
      };
    }
    return {
      verdict: 'skip',
      reason: 'triggered locally without PR body; set R1_R8_BODY or R1_R8_ENFORCE=1',
      triggerFiles,
    };
  }

  const checklist = parseR1R8Checklist(body);
  const incomplete = R1_R8_ITEMS.filter((id) => checklist[id]?.status !== 'ok');
  if (incomplete.length > 0) {
    const detail = incomplete
      .map((id) => `${id}=${checklist[id]?.status}`)
      .join(', ');
    return {
      verdict: 'fail',
      reason: `R1–R8 incomplete (${detail}); tick [x] or write N/A on each item`,
      triggerFiles,
      checklist,
    };
  }

  return {
    verdict: 'pass',
    reason: 'R1–R8 ticked or marked N/A',
    triggerFiles,
    checklist,
  };
}

function runGit(repoRoot, args) {
  const res = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function splitGitLines(stdout) {
  return stdout
    .split('\n')
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

/**
 * @param {string} repoRoot
 * @param {unknown} event
 * @returns {{ paths: string[], error?: string }}
 */
export function collectChangedPaths(repoRoot, event) {
  const names = new Set();
  const add = (lines) => {
    for (const line of lines) names.add(line);
  };

  const baseSha = event && typeof event === 'object'
    ? /** @type {{ pull_request?: { base?: { sha?: string } } }} */ (event).pull_request?.base?.sha
    : undefined;

  if (baseSha) {
    const diff = runGit(repoRoot, ['diff', '--name-only', baseSha, 'HEAD']);
    if (!diff.ok) {
      return {
        paths: [],
        error: `git diff ${baseSha} HEAD failed (fetch the PR base SHA first): ${diff.stderr.trim()}`,
      };
    }
    add(splitGitLines(diff.stdout));
    return { paths: [...names] };
  }

  const originMain = runGit(repoRoot, ['rev-parse', '--verify', 'origin/main']);
  if (originMain.ok) {
    const triple = runGit(repoRoot, ['diff', '--name-only', 'origin/main...HEAD']);
    if (triple.ok) add(splitGitLines(triple.stdout));
    const twoDot = runGit(repoRoot, ['diff', '--name-only', 'origin/main', 'HEAD']);
    if (twoDot.ok) add(splitGitLines(twoDot.stdout));
  }

  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const res = runGit(repoRoot, args);
    if (res.ok) add(splitGitLines(res.stdout));
  }

  return { paths: [...names] };
}

/** @param {unknown} event */
export function resolvePrBody(event) {
  if (typeof process.env.R1_R8_BODY === 'string' && process.env.R1_R8_BODY.length > 0) {
    return process.env.R1_R8_BODY;
  }
  const fromEvent = event && typeof event === 'object'
    ? /** @type {{ pull_request?: { body?: string | null } }} */ (event).pull_request?.body
    : undefined;
  if (typeof fromEvent === 'string') return fromEvent;
  return '';
}

/** @returns {unknown} */
export function readGithubEvent(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function isMainModule() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry.endsWith('check-r1-r8-cross-page.mjs');
}

function main() {
  const repoRoot = process.cwd();
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
  const event = readGithubEvent();
  const collected = collectChangedPaths(repoRoot, event);
  if (collected.error) {
    console.error(`[check-r1-r8] FAILED: ${collected.error}`);
    process.exit(1);
  }

  const enforce = eventName === 'pull_request' || process.env.R1_R8_ENFORCE === '1';
  const body = resolvePrBody(event);
  const result = evaluateR1R8Gate({
    files: collected.paths,
    body,
    eventName,
    enforce,
  });

  if (result.verdict === 'fail') {
    console.error(`[check-r1-r8] FAILED: ${result.reason}`);
    if (result.triggerFiles.length > 0) {
      console.error('Trigger files:');
      for (const f of result.triggerFiles) console.error(`  - ${f}`);
    }
    if (result.checklist) {
      console.error('Checklist:');
      for (const id of R1_R8_ITEMS) {
        const item = result.checklist[id];
        console.error(`  ${id}: ${item?.status}${item?.line ? ` (${item.line.trim()})` : ''}`);
      }
    }
    console.error(
      'Anchor: docs/execution/plans/标注词典语料-治理补充规范-2026-04-25.md#r1-r8-cross-page-checklist',
    );
    process.exit(1);
  }

  const extra = result.triggerFiles.length > 0 ? ` (${result.triggerFiles.length} trigger file(s))` : '';
  console.log(`[check-r1-r8] ${result.verdict.toUpperCase()}: ${result.reason}${extra}`);
}

if (isMainModule()) {
  main();
}
