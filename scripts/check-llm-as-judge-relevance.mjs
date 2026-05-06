#!/usr/bin/env node
/**
 * PR-19 验收脚本：LLM-as-Judge 深化 + runtime report
 *
 * 验证项：
 * - Relevance Judge 存在且可运行（三维度 1–5 评分）
 * - AI Runtime Report 双轨趋势汇总存在
 * - 模型选择反馈闭环存在
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

runVitestTest('src/ai/eval/relevanceJudge.test.ts', 'relevanceJudge tests');
runVitestTest('src/ai/eval/aiRuntimeReport.test.ts', 'aiRuntimeReport tests');
runVitestTest('src/ai/chat/modelSelectionFeedback.test.ts', 'modelSelectionFeedback tests');

// 源文件存在
check(
  existsSync('src/ai/eval/relevanceJudge.ts'),
  'Relevance Judge source exists',
  'Missing src/ai/eval/relevanceJudge.ts',
);
check(
  existsSync('src/ai/eval/aiRuntimeReport.ts'),
  'AI Runtime Report source exists',
  'Missing src/ai/eval/aiRuntimeReport.ts',
);
check(
  existsSync('src/ai/chat/modelSelectionFeedback.ts'),
  'Model selection feedback source exists',
  'Missing src/ai/chat/modelSelectionFeedback.ts',
);

// Relevance Judge 三维度
logInfo('Checking Relevance Judge dimensions...');
const relevanceSrc = readFileSync('src/ai/eval/relevanceJudge.ts', 'utf-8');
check(
  relevanceSrc.includes('topicAlignment') && relevanceSrc.includes('completeness') && relevanceSrc.includes('conciseness'),
  'Relevance Judge has three dimensions',
  'Missing dimensions in relevanceJudge',
);
check(
  relevanceSrc.includes('judgeRelevance'),
  'judgeRelevance exported',
  'Missing judgeRelevance export',
);

// Runtime Report 双轨
logInfo('Checking AI Runtime Report dual-track...');
const reportSrc = readFileSync('src/ai/eval/aiRuntimeReport.ts', 'utf-8');
check(
  reportSrc.includes('citation') && reportSrc.includes('relevance'),
  'Runtime report covers citation + relevance dual track',
  'Missing dual track in runtime report',
);
check(
  reportSrc.includes('anomalies'),
  'Runtime report includes anomaly detection',
  'Missing anomaly detection',
);

// 模型选择反馈
logInfo('Checking model selection feedback...');
const feedbackSrc = readFileSync('src/ai/chat/modelSelectionFeedback.ts', 'utf-8');
check(
  feedbackSrc.includes('downgrade_model') && feedbackSrc.includes('suggest_switch') && feedbackSrc.includes('keep_current'),
  'Model selection has three advice states',
  'Missing advice states',
);
check(
  feedbackSrc.includes('consecutiveThumbsDown'),
  'Feedback window tracks consecutive thumbs down',
  'Missing consecutive tracking',
);

console.log('');
if (failed) {
  logFail('PR-19 LLM-as-Judge relevance checks FAILED');
  process.exit(1);
} else {
  logOk('PR-19 LLM-as-Judge relevance checks PASSED');
  process.exit(0);
}
