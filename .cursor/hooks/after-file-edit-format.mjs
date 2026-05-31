#!/usr/bin/env node
// afterFileEdit hook（本地安全网，仅 Cursor）：
//  1) 对 AI 刚写入的 src 下 .ts/.tsx/.css 跑 prettier --write，
//     使 AI 产出与 lint-staged.config.mjs 同款格式，减少 diff 噪声。
//  2) 若改的是需 verify 的路径，落 sentinel，供 stop 钩子收尾校验。
//     覆盖：src/**/*.ts(x) | docs/execution/specs/ | scripts/check-*.{mjs,cjs}
//     | AGENTS.md / AI_QUICKSTART.md / copilot-instructions.md
// 始终 fail-open（exit 0）：钩子任何异常都不得阻塞编辑流程。
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const sentinel = join(scriptDir, '.verify-pending');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractPath(raw) {
  try {
    const obj = JSON.parse(raw);
    const candidates = [obj.file_path, obj.filePath, obj.path, obj?.file?.path];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function shouldMarkVerifyPending(normalized) {
  if (/^src\/.*\.(ts|tsx)$/.test(normalized)) return true;
  if (
    normalized.startsWith('docs/execution/specs/')
    && !normalized.startsWith('docs/execution/specs/_template/')
  ) {
    return true;
  }
  if (/^scripts\/check-.*\.(mjs|cjs)$/.test(normalized)) return true;
  if (
    normalized === 'AGENTS.md'
    || normalized === 'AI_QUICKSTART.md'
    || normalized === 'copilot-instructions.md'
  ) {
    return true;
  }
  return false;
}

function main() {
  try {
    const raw = readStdin();
    const filePath = extractPath(raw);
    if (!filePath) {
      process.stdout.write('{}');
      return;
    }

    const normalized = filePath.replace(/\\/g, '/');
    const isSrc = /(^|\/)src\//.test(normalized);
    const isFormattable = /\.(ts|tsx|css)$/.test(normalized);

    if (isSrc && isFormattable) {
      spawnSync('npx', ['prettier', '--write', filePath], {
        cwd: repoRoot,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
    }

    if (shouldMarkVerifyPending(normalized)) {
      mkdirSync(scriptDir, { recursive: true });
      writeFileSync(sentinel, `${Date.now()}\n`);
    }

    process.stdout.write('{}');
  } catch {
    process.stdout.write('{}');
  }
}

main();
