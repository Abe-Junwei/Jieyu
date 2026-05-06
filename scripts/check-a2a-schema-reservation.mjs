#!/usr/bin/env node
/**
 * PR-20 验收脚本：长期记忆 Dexie 迁移 + MCP Client + A2A
 *
 * 验证项：
 * - project_ai_memories Dexie 表存在且 CRUD 正常
 * - schema version ≥ 47
 * - MCP Client 类型预留存在
 * - A2A 数据结构预留存在且校验通过
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function logOk(msg) { console.log(`${GREEN}[PASS]${RESET} ${msg}`); }
function logFail(msg) { console.log(`${RED}[FAIL]${RESET} ${msg}`); }
function logInfo(msg) { console.log(`${YELLOW}[INFO]${RESET} ${msg}`); }

let failed = false;

function check(condition, passMsg, failMsg) {
  if (condition) { logOk(passMsg); } else { logFail(failMsg); failed = true; }
}

function runVitestTest(filePath, label) {
  logInfo(`Running ${label}...`);
  try {
    execSync(
      `npx vitest run ${filePath} --reporter=dot`,
      { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' },
    );
    check(true, `${label} passed`, '');
  } catch (e) {
    const output = e.stdout || e.message || '';
    check(false, '', `${label} failed: ${output.slice(0, 200)}`);
  }
}

runVitestTest('src/db/engine.projectAiMemories.test.ts', 'project_ai_memories Dexie tests');
runVitestTest('src/ai/vertical/a2aSchemaReservation.test.ts', 'A2A schema reservation tests');

// 源文件存在
check(
  existsSync('src/db/engine.ts'),
  'Dexie engine source exists',
  'Missing src/db/engine.ts',
);
check(
  existsSync('src/ai/mcp/client/mcpClientTypes.ts'),
  'MCP Client types exist',
  'Missing src/ai/mcp/client/mcpClientTypes.ts',
);
check(
  existsSync('src/ai/vertical/a2aSchemaReservation.ts'),
  'A2A schema reservation exists',
  'Missing src/ai/vertical/a2aSchemaReservation.ts',
);

// project_ai_memories 表定义
logInfo('Checking project_ai_memories table...');
const engineSrc = readFileSync('src/db/engine.ts', 'utf-8');
check(
  engineSrc.includes('project_ai_memories'),
  'project_ai_memories table declared in JieyuDexie',
  'Missing project_ai_memories in JieyuDexie',
);
check(
  engineSrc.includes("this.version(47)") && engineSrc.includes("project_ai_memories"),
  'v47 schema migration includes project_ai_memories',
  'Missing v47 migration for project_ai_memories',
);
check(
  engineSrc.includes('JIEYU_DEXIE_TARGET_SCHEMA_VERSION = 47'),
  'Target schema version is 47',
  'Schema version not bumped to 47',
);

// MCP Client 预留
logInfo('Checking MCP Client reservation...');
const mcpSrc = readFileSync('src/ai/mcp/client/mcpClientTypes.ts', 'utf-8');
check(
  mcpSrc.includes('McpClientConfig') && mcpSrc.includes('McpToolCallRequest'),
  'MCP Client types defined',
  'Missing MCP Client types',
);

// A2A 预留
logInfo('Checking A2A reservation...');
const a2aSrc = readFileSync('src/ai/vertical/a2aSchemaReservation.ts', 'utf-8');
check(
  a2aSrc.includes('A2aAgentRole') && a2aSrc.includes('A2aTaskReservation'),
  'A2A types defined',
  'Missing A2A types',
);
check(
  a2aSrc.includes('verifyA2aSchemaReservation'),
  'A2A verification function exists',
  'Missing verifyA2aSchemaReservation',
);

console.log('');
if (failed) {
  logFail('PR-20 A2A schema reservation checks FAILED');
  process.exit(1);
} else {
  logOk('PR-20 A2A schema reservation checks PASSED');
  process.exit(0);
}
