#!/usr/bin/env node
/**
 * PR-15: MCP Server 只读验收脚本
 * 运行 McpServer 单测，验证 SSE transport、认证、3 个只读工具、写请求拒绝。
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'src/ai/mcp/server/McpServer.test.ts'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  },
);

if (result.status !== 0) {
  console.error('\n❌ MCP Server read-only check failed');
  process.exit(result.status ?? 1);
}

console.log('\n✅ MCP Server read-only check passed');
process.exit(0);
