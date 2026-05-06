#!/usr/bin/env node
/**
 * PR-17 验收脚本：降级路径手动接管 UX
 *
 * 验证项：
 * - 状态机类型和场景枚举完整
 * - 5 类场景均支持接管
 * - 中英双语标签和描述
 * - 状态转换正确（pending → overridden / dismissed）
 * - 不可变性（无副作用）
 */

import { execSync } from 'node:child_process';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function logOk(msg) {
  console.log(`${GREEN}[PASS]${RESET} ${msg}`);
}

function logFail(msg) {
  console.log(`${RED}[FAIL]${RESET} ${msg}`);
}

function logInfo(msg) {
  console.log(`${YELLOW}[INFO]${RESET} ${msg}`);
}

let failed = false;

function check(condition, passMsg, failMsg) {
  if (condition) {
    logOk(passMsg);
  } else {
    logFail(failMsg);
    failed = true;
  }
}

// 1. 单元测试通过
logInfo('Running degradation manual override tests...');
try {
  const output = execSync(
    'npx vitest run src/ai/chat/degradationManualOverride.test.ts --reporter=verbose',
    { encoding: 'utf-8', cwd: process.cwd() },
  );
  check(
    output.includes('passed'),
    'All degradation manual override tests passed',
    'Some degradation manual override tests failed',
  );
} catch (e) {
  const output = e.stdout || e.message || '';
  const stderr = e.stderr || '';
  check(
    output.includes('passed') && !output.includes('failed'),
    'All degradation manual override tests passed',
    `Tests failed: ${stderr || output.slice(0, 200)}`,
  );
  if (failed) {
    console.log(output);
  }
}

// 2. 源文件存在
import { existsSync, readFileSync as _readFileSync } from 'node:fs';
function readFileSync(path, encoding) {
  return _readFileSync(path, encoding);
}
check(
  existsSync('src/ai/chat/degradationManualOverride.ts'),
  'State machine source exists',
  'Missing src/ai/chat/degradationManualOverride.ts',
);
check(
  existsSync('src/ai/chat/degradationManualOverride.test.ts'),
  'State machine test exists',
  'Missing src/ai/chat/degradationManualOverride.test.ts',
);
check(
  existsSync('src/components/ai/AiChatDegradationOverride.tsx'),
  'UI component exists',
  'Missing src/components/ai/AiChatDegradationOverride.tsx',
);

// 3. 5 类场景枚举
logInfo('Checking 5 degradation scenarios...');
const src = readFileSync('src/ai/chat/degradationManualOverride.ts', 'utf-8');
for (const s of [
  'plan_degraded',
  'reflection_flagged',
  'judge_low_score',
  'cost_anomaly',
  'rag_no_results',
]) {
  check(
    src.includes(s),
    `Scenario ${s} defined`,
    `Missing scenario ${s}`,
  );
}

// 4. UI 组件引用状态机
logInfo('Checking UI component references...');
const uiSrc = readFileSync('src/components/ai/AiChatDegradationOverride.tsx', 'utf-8');
check(
  uiSrc.includes('buildOverrideLabel') && uiSrc.includes('buildOverrideDescription'),
  'UI component imports label/description helpers',
  'UI component missing label/description helpers',
);
check(
  uiSrc.includes('applyOverride') && uiSrc.includes('dismissOverride'),
  'UI component imports state transitions',
  'UI component missing state transitions',
);

// 4b. 助手消息气泡挂载降级接管 UI
logInfo('Checking assistant message wires degradation UI...');
const assistantSrc = readFileSync('src/components/ai/AiChatAssistantMessage.tsx', 'utf-8');
check(
  assistantSrc.includes('AiChatDegradationOverride') && assistantSrc.includes('useDegradationOverrides'),
  'AiChatAssistantMessage imports degradation override UI',
  'AiChatAssistantMessage missing degradation override wiring',
);
check(
  assistantSrc.includes('degradationScenarios'),
  'AiChatAssistantMessage carries degradationScenarios on assistant message',
  'AiChatAssistantMessage missing degradationScenarios field usage',
);

// 5. 中英双语（通过 i18n 字典 key 映射实现）
logInfo('Checking bilingual support...');
check(
  src.includes('LABEL_KEY_MAP') && src.includes('DESCRIPTION_KEY_MAP'),
  'State machine has i18n key mappings for labels and descriptions',
  'State machine missing i18n key mappings',
);
check(
  src.includes('msg.aiChat.degradation.label.planDegraded') && src.includes('msg.aiChat.degradation.description.planDegraded'),
  'State machine references degradation i18n keys',
  'State machine missing degradation i18n key references',
);

console.log('');
if (failed) {
  logFail('PR-17 degradation manual override checks FAILED');
  process.exit(1);
} else {
  logOk('PR-17 degradation manual override checks PASSED');
  process.exit(0);
}


