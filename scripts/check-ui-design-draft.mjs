#!/usr/bin/env node
// PR 正文门禁：改了桌面页面、桌面样式或新建共享组件时，
// 正文必须逐项勾选 UI1–UI3，或在该行写 N/A。
// 本地无 PR 正文时跳过。CI pull_request 命中路径且清单不全则失败。

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const UI_DRAFT_ITEMS = Object.freeze(['UI1', 'UI2', 'UI3']);

/**
 * @param {string} filePath
 * @param {string} [status]
 */
export function isUiDraftTriggerPath(filePath, status = 'M') {
  const p = String(filePath ?? '').replace(/\\/g, '/');
  if (!p || p.includes('.test.') || status === 'D') return false;
  if (/^src\/pages\/Desktop[^/]+\.tsx$/.test(p)) return true;
  if (/^src\/styles\/(?:.*\/)?desktop[^/]*\.css$/.test(p)) return true;
  return (status === 'A' || status === '??') && /^src\/components\/.+\.tsx$/.test(p);
}

/**
 * @param {string} body
 */
export function parseUiDraftChecklist(body) {
  const text = String(body ?? '');
  /** @type {Record<string, { status: string, line?: string }>} */
  const results = {};
  for (const id of UI_DRAFT_ITEMS) {
    const re = new RegExp(`^.*\\b${id}\\b.*$`, 'gm');
    const lines = [...text.matchAll(re)].map((match) => match[0]);
    if (lines.length === 0) {
      results[id] = { status: 'missing' };
      continue;
    }
    const ok = lines.find((line) => /\[[xX]\]/.test(line) || /\bN\/A\b/i.test(line));
    results[id] = ok ? { status: 'ok', line: ok } : { status: 'unchecked', line: lines[0] };
  }
  return results;
}

/**
 * @param {{ files: Array<{ path: string, status?: string }>, body?: string | null, eventName?: string, enforce?: boolean }} input
 */
export function evaluateUiDraftGate(input) {
  const eventName = input.eventName ?? 'local';
  if (eventName === 'push') {
    return { verdict: 'skip', reason: 'push event (already merged)', triggerFiles: [] };
  }
  const triggerFiles = (input.files ?? [])
    .filter((file) => isUiDraftTriggerPath(file.path, file.status ?? 'M'))
    .map((file) => file.path);
  if (triggerFiles.length === 0) {
    return { verdict: 'skip', reason: 'no desktop UI trigger paths', triggerFiles: [] };
  }
  const body = typeof input.body === 'string' ? input.body : '';
  if (!body.trim()) {
    if (input.enforce) {
      return {
        verdict: 'fail',
        reason: 'desktop UI paths changed but PR body is missing; tick UI1–UI3 or write N/A',
        triggerFiles,
      };
    }
    return {
      verdict: 'skip',
      reason: 'triggered locally without PR body; set UI_DRAFT_BODY or UI_DRAFT_ENFORCE=1',
      triggerFiles,
    };
  }
  const checklist = parseUiDraftChecklist(body);
  const incomplete = UI_DRAFT_ITEMS.filter((id) => checklist[id]?.status !== 'ok');
  if (incomplete.length > 0) {
    return {
      verdict: 'fail',
      reason: `UI draft checklist incomplete (${incomplete.map((id) => `${id}=${checklist[id]?.status}`).join(', ')})`,
      triggerFiles,
      checklist,
    };
  }
  return { verdict: 'pass', reason: 'UI1–UI3 ticked or marked N/A', triggerFiles, checklist };
}

function runGit(repoRoot, args) {
  const res = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return { ok: res.status === 0, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** @returns {{ files: Array<{ path: string, status: string }>, error?: string }} */
export function collectChangedFiles(repoRoot, event) {
  const baseSha = event && typeof event === 'object'
    ? /** @type {{ pull_request?: { base?: { sha?: string } } }} */ (event).pull_request?.base?.sha
    : undefined;
  const args = baseSha
    ? ['diff', '--name-status', baseSha, 'HEAD']
    : ['diff', '--name-status', 'origin/main...HEAD'];
  const diff = runGit(repoRoot, args);
  if (!diff.ok) {
    return { files: [], error: `git diff failed: ${diff.stderr.trim()}` };
  }
  const files = [];
  for (const line of diff.stdout.split('\n')) {
    const renamed = line.match(/^R\d+\s+\S+\s+(\S+)$/);
    if (renamed) {
      files.push({ path: renamed[1].replace(/\\/g, '/'), status: 'A' });
      continue;
    }
    const match = line.match(/^([AMD])\s+(.+)$/);
    if (match) files.push({ path: match[2].replace(/\\/g, '/'), status: match[1] });
  }
  return { files };
}

function readGithubEvent(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolvePrBody(event) {
  if (typeof process.env.UI_DRAFT_BODY === 'string' && process.env.UI_DRAFT_BODY.length > 0) {
    return process.env.UI_DRAFT_BODY;
  }
  const fromEvent = event && typeof event === 'object'
    ? /** @type {{ pull_request?: { body?: string | null } }} */ (event).pull_request?.body
    : undefined;
  return typeof fromEvent === 'string' ? fromEvent : '';
}

function isMainModule() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry.endsWith('check-ui-design-draft.mjs');
}

function main() {
  const repoRoot = process.cwd();
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
  const event = readGithubEvent();
  const collected = collectChangedFiles(repoRoot, event);
  if (collected.error) {
    console.error(`[check-ui-design-draft] FAILED: ${collected.error}`);
    process.exit(1);
  }
  const enforce = eventName === 'pull_request' || process.env.UI_DRAFT_ENFORCE === '1';
  const result = evaluateUiDraftGate({
    files: collected.files,
    body: resolvePrBody(event),
    eventName,
    enforce,
  });
  if (result.verdict === 'fail') {
    console.error(`[check-ui-design-draft] FAILED: ${result.reason}`);
    for (const file of result.triggerFiles) console.error(`  - ${file}`);
    console.error('Anchor: .github/pull_request_template.md UI 精稿对照');
    process.exit(1);
  }
  console.log(`[check-ui-design-draft] ${result.verdict.toUpperCase()}: ${result.reason}`);
}

if (isMainModule()) main();
