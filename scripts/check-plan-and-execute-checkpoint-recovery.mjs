#!/usr/bin/env node
/**
 * PR-18 验收脚本：Plan-and-Execute 深化 + Reflection retry
 *
 * 验证项：
 * - 三阶组合模板存在且可解析
 * - TaskRunner retry 时 lastError 注入上下文
 * - Reflection retry prompt 可根据失败 check 生成指导
 * - 所有相关测试通过
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

// 1. 单元测试通过
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

runVitestTest('src/ai/vertical/composedWorkflowTemplates.test.ts', 'composedWorkflowTemplates tests');
runVitestTest('src/ai/tasks/TaskRunner.test.ts', 'TaskRunner tests');
runVitestTest('src/ai/vertical/segmentQaReflection.test.ts', 'segmentQaReflection tests');

// 2. 源文件存在
check(
  existsSync('src/ai/vertical/composedWorkflowTemplates.ts'),
  'Composed workflow templates source exists',
  'Missing src/ai/vertical/composedWorkflowTemplates.ts',
);
check(
  existsSync('src/ai/tasks/TaskRunner.ts'),
  'TaskRunner source exists',
  'Missing src/ai/tasks/TaskRunner.ts',
);
check(
  existsSync('src/ai/vertical/segmentQaReflection.ts'),
  'Segment QA reflection source exists',
  'Missing src/ai/vertical/segmentQaReflection.ts',
);

// 3. 三阶模板定义
logInfo('Checking three-step template...');
const composedSrc = readFileSync('src/ai/vertical/composedWorkflowTemplates.ts', 'utf-8');
check(
  composedSrc.includes('segment_qa_then_annotation_qa_then_lexeme_candidates'),
  'Three-step template defined',
  'Missing three-step template',
);
check(
  composedSrc.includes("'<step3>'"),
  'step3 tag supported',
  'Missing <step3> support',
);
check(
  composedSrc.includes("'step2_done'"),
  'step2_done status defined',
  'Missing step2_done status',
);

// 4. TaskRunner lastError
logInfo('Checking TaskRunner lastError injection...');
const taskRunnerSrc = readFileSync('src/ai/tasks/TaskRunner.ts', 'utf-8');
check(
  taskRunnerSrc.includes('lastError: Error | null'),
  'TaskRunContext has lastError field',
  'Missing lastError in TaskRunContext',
);
check(
  taskRunnerSrc.includes('lastError,') || taskRunnerSrc.includes('lastError:'),
  'lastError passed to run function',
  'lastError not passed to run',
);

// 5. Reflection retry prompt
logInfo('Checking reflection retry prompt...');
const reflectionSrc = readFileSync('src/ai/vertical/segmentQaReflection.ts', 'utf-8');
check(
  reflectionSrc.includes('buildReflectionRetryPrompt'),
  'buildReflectionRetryPrompt exists',
  'Missing buildReflectionRetryPrompt',
);
check(
  reflectionSrc.includes('citation_count_match') && reflectionSrc.includes('source_id_nonempty'),
  'Retry prompt covers key checks',
  'Retry prompt missing key checks',
);

console.log('');
if (failed) {
  logFail('PR-18 Plan-and-Execute checkpoint recovery checks FAILED');
  process.exit(1);
} else {
  logOk('PR-18 Plan-and-Execute checkpoint recovery checks PASSED');
  process.exit(0);
}
