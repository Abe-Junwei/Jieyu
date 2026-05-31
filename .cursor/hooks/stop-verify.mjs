#!/usr/bin/env node
// stop hook（本地安全网，仅 Cursor）：把"未经验证不得宣称已完成"（AGENTS.md §4）
// 从人类自律变为自动闭环。仅当 afterFileEdit 落下 sentinel 时，在 agent 收尾跑：
//   typecheck → check:agent-evals:smoke → check:dev-agent-workflow-verify
// 纯问答 / 未触发 sentinel 的回合直接 no-op，零打扰。
// 失败时回注 followup_message 让 agent 先修再收尾（loop_limit=2 兜底防循环）。
// 始终 fail-open（exit 0）：钩子异常不得阻塞会话结束。
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const sentinel = join(scriptDir, '.verify-pending');

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

function main() {
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

    if (failures.length === 0) {
      process.stderr.write('[stop-verify] typecheck + smoke evals + dev-agent workflow 通过\n');
      process.stdout.write('{}');
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
    ].join('\n');

    process.stdout.write(JSON.stringify({ followup_message: followup }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[stop-verify] fail-open: ${message}\n`);
    process.stdout.write('{}');
  }
}

main();
