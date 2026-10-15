#!/usr/bin/env node
// stop hook（本地安全网，仅 Cursor）：把"未经验证不得宣称已完成"（AGENTS.md §4）
// 从人类自律变为自动闭环。仅当 afterFileEdit 落下 sentinel 时，在 agent 收尾跑：
//   typecheck → check:agent-evals:smoke → check:dev-agent-workflow-verify
// 纯问答 / 未触发 sentinel 的回合直接 no-op，零打扰。
// 失败时回注 followup_message 让 agent 先修再收尾（loop_limit=2 兜底防循环）。
// 始终 fail-open（exit 0）：钩子异常不得阻塞会话结束。
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const sentinel = join(scriptDir, '.verify-pending');
const driftSeen = join(scriptDir, '.doc-drift-seen');

function drainStdin() {
  try {
    readFileSync(0, 'utf8');
  } catch {
    /* ignore */
  }
}

function runCheck(label, args) {
  const res = spawnSync('npm', ['run', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const ok = res.status === 0;
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  return { label, ok, output };
}

function tail(text, lines = 25) {
  return text.trim().split('\n').slice(-lines).join('\n');
}

function changedFiles() {
  const res = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (res.status !== 0) return new Set();
  const entries = res.stdout.split('\0');
  const files = new Set();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    files.add(entry.slice(3));
    if (entry[0] === 'R' || entry[0] === 'C') i += 1;
  }
  return files;
}

// ADR-0051 §4：改了被文档点名的代码却没改那份文档时只提醒一次，不拦截。
async function docDriftReminder() {
  try {
    process.chdir(repoRoot);
    const { codeDriftWarnings, listPathCheckedDocs } = await import(
      pathToFileURL(join(repoRoot, 'scripts', 'check-docs-governance.mjs')).href
    );
    const warnings = codeDriftWarnings(changedFiles(), listPathCheckedDocs());
    const seen = existsSync(driftSeen) ? new Set(readFileSync(driftSeen, 'utf8').split('\n')) : new Set();
    const fresh = warnings.filter((w) => !seen.has(w));
    if (fresh.length === 0) return '';
    writeFileSync(driftSeen, [...seen, ...fresh].filter(Boolean).join('\n'));
    return [
      '以下文档点名的代码改了，文档没改。确认它们是否需要同步更新；不需要就忽略（本提醒不拦截，同一条只提一次）：',
      '',
      ...fresh.map((w) => `- ${w}`),
    ].join('\n');
  } catch {
    return '';
  }
}

async function main() {
  try {
    drainStdin();

    if (!existsSync(sentinel)) {
      process.stdout.write('{}');
      return;
    }
    try {
      rmSync(sentinel);
    } catch {
      /* ignore */
    }

    const failures = [];

    const typecheck = runCheck('typecheck', ['typecheck']);
    if (!typecheck.ok) failures.push(typecheck);

    if (typecheck.ok) {
      const evals = runCheck('check:agent-evals:smoke', ['check:agent-evals:smoke']);
      if (!evals.ok) failures.push(evals);
    }

    if (typecheck.ok && failures.length === 0) {
      const workflow = runCheck('check:dev-agent-workflow-verify', [
        'check:dev-agent-workflow-verify',
      ]);
      if (!workflow.ok) failures.push(workflow);
    }

    const drift = await docDriftReminder();

    if (failures.length === 0) {
      process.stderr.write('[stop-verify] typecheck + smoke evals + dev-agent workflow 通过\n');
      process.stdout.write(drift ? JSON.stringify({ followup_message: drift }) : '{}');
      return;
    }

    const summary = failures
      .map((f) => `### ${f.label} 失败\n\n\`\`\`\n${tail(f.output)}\n\`\`\``)
      .join('\n\n');

    process.stderr.write(`[stop-verify] 校验失败：${failures.map((f) => f.label).join(', ')}\n`);

    const followup = [
      '收尾前自动校验未通过，请先修复后再宣称完成（AGENTS.md §4：未经验证不得宣称已完成）：',
      '',
      summary,
      '',
      '修复后会在下一轮再次自动校验。',
      ...(drift ? ['', drift] : []),
    ].join('\n');

    process.stdout.write(JSON.stringify({ followup_message: followup }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[stop-verify] fail-open: ${message}\n`);
    process.stdout.write('{}');
  }
}

main();
