#!/usr/bin/env node
// preToolUse hook（本地安全网，仅 Cursor）：拦截对"生成物/基线"的直接 Write。
// 这些文件应由脚本重生成（npm run data:* / *:write-baseline / report:release-evidence*），
// 而非 AI 手写。命中则返回 permission=ask 交由你确认（不硬 deny，保留必要时手改）。
// 脚本通过 Shell 重生成走 beforeShellExecution 路径，不受此钩子影响。
// 始终 fail-open（异常时 allow）：钩子异常不得阻塞正常编辑。
import { readFileSync } from 'node:fs';

const PROTECTED = [
  { re: /(^|\/)public\/data\//, hint: 'npm run data:*（语言种子 / geodata 等）' },
  { re: /-baseline\.json$/, hint: '对应 *:write-baseline 脚本' },
  { re: /(^|\/)docs\/execution\/release-gates\/release-evidence\//, hint: 'npm run report:release-evidence*' },
];

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractPath(obj) {
  const buckets = [obj, obj?.tool_input, obj?.toolInput, obj?.arguments, obj?.input];
  const keys = ['path', 'file_path', 'filePath', 'target_file'];
  for (const b of buckets) {
    if (!b || typeof b !== 'object') continue;
    for (const k of keys) {
      if (typeof b[k] === 'string' && b[k].length > 0) return b[k];
    }
  }
  return '';
}

function main() {
  try {
    let obj = {};
    try {
      obj = JSON.parse(readStdin());
    } catch {
      process.stdout.write('{"permission":"allow"}');
      return;
    }

    const filePath = extractPath(obj).replace(/\\/g, '/');
    if (!filePath) {
      process.stdout.write('{"permission":"allow"}');
      return;
    }

    const hit = PROTECTED.find((p) => p.re.test(filePath));
    if (!hit) {
      process.stdout.write('{"permission":"allow"}');
      return;
    }

    process.stdout.write(
      JSON.stringify({
        permission: 'ask',
        user_message: `该路径是生成物/基线（${filePath}），通常应由脚本重生成（${hit.hint}）而非手写。确认要直接编辑吗？`,
        agent_message: `钩子提示：${filePath} 是生成物/基线，优先用脚本重生成（${hit.hint}），不要手改。`,
      }),
    );
  } catch {
    process.stdout.write('{"permission":"allow"}');
  }
}

main();
