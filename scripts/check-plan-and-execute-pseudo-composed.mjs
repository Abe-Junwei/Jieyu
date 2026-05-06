#!/usr/bin/env node
/**
 * PR-13: Plan-and-Execute 伪组合验收脚本
 * 运行 composedWorkflowTemplates 单测，验证模板选择、状态机、prompt 构建、
 * 输出解析与 step2 重试逻辑。
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const testFiles = [
  'src/ai/vertical/composedWorkflowTemplates.test.ts',
  'src/ai/chat/sessionMemory.test.ts',
  'src/hooks/useAiChat.sendTurnPreflight.test.ts',
  'src/hooks/useAiChat.sendTurnStreamPhase.test.ts',
];

const result = spawnSync(
  'npx',
  ['vitest', 'run', ...testFiles],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  },
);

if (result.status !== 0) {
  console.error('\n❌ Plan-and-Execute pseudo-composed check failed');
  process.exit(result.status ?? 1);
}

console.log('\n✅ Plan-and-Execute pseudo-composed check passed');
process.exit(0);
