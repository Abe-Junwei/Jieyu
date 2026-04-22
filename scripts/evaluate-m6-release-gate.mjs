import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const metricEventLogPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'audits',
  'M5-观测指标事件流水-v1.ndjson',
);
const reportOutputPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'archive',
  'release-gates-auto',
  'M6-发布门禁判定报告-自动生成.md',
);

const SLO = {
  aiFirstTokenP95Ms: 8000,
  transcriptionLatencyP95Ms: 300,
  mainPathSuccessRate: 0.99,
};

function parseModeArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!raw) return 'enforce';
  const mode = raw.slice('--mode='.length).trim().toLowerCase();
  if (mode === 'shadow') return 'shadow';
  return 'enforce';
}

function parseRunIdArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--run-id='));
  if (!raw) return null;
  const runId = raw.slice('--run-id='.length).trim();
  return runId || null;
}

function resolveRunId() {
  const fromArg = parseRunIdArg();
  if (fromArg) return fromArg;
  const fromEnv = String(process.env.M6_GATE_RUN_ID ?? process.env.M5_GATE_RUN_ID ?? '').trim();
  return fromEnv || null;
}

function resolveEnvironmentTag() {
  const env = String(process.env.VITE_M5_OBSERVABILITY_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (!env) return process.env.CI ? 'ci' : 'local';
  if (env === 'development' || env === 'dev') return 'local';
  if (env === 'production') return 'prod';
  return env;
}

async function readAppVersion() {
  try {
    const packageJsonRaw = await readFile(path.join(workspaceRoot, 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw);
    const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
    return version || '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

function quantile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(ratio * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function summarizeValues(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function parseMetricEvents(rawText) {
  const events = [];
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const value = toFiniteNumber(parsed.value);
      if (typeof parsed.id !== 'string' || Number.isNaN(value)) continue;
      const tags = parsed.tags && typeof parsed.tags === 'object' ? parsed.tags : {};
      events.push({
        id: parsed.id,
        value,
        at: typeof parsed.at === 'string' ? parsed.at : '',
        tags,
      });
    } catch {
      // 忽略格式错误的事件行 | Ignore malformed event lines
    }
  }
  return events;
}

function filterByDimension(events, metricId, version, environment, runId) {
  return events.filter((event) => (
    event.id === metricId
    && String(event.tags.version ?? '') === version
    && String(event.tags.environment ?? '') === environment
    && (!runId || String(event.tags.runId ?? '') === runId)
  ));
}

function toPositiveFiniteNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getEventSampleCount(event) {
  const fromSampleCount = toPositiveFiniteNumber(event.tags.sampleCount);
  if (fromSampleCount) return fromSampleCount;
  const fromTotal = toPositiveFiniteNumber(event.tags.total);
  if (fromTotal) return fromTotal;
  return 1;
}

function getMeasurementClass(event) {
  const measurementClass = String(event.tags.measurementClass ?? '').trim();
  if (measurementClass) return measurementClass;
  const source = String(event.tags.source ?? '').trim();
  if (source === 'vitest-runtime-latency-probe') return 'synthetic-test-probe';
  return 'runtime';
}

function summarizeMetricEvents(events) {
  if (events.length === 0) return null;
  const values = events.map((event) => event.value);
  const summary = summarizeValues(values);
  const sampleCount = events.reduce((total, event) => total + getEventSampleCount(event), 0);
  const measurementClasses = [...new Set(events.map((event) => getMeasurementClass(event)))].sort();
  return {
    ...summary,
    eventCount: events.length,
    sampleCount,
    measurementClasses,
  };
}

function selectLatencyEvents(events) {
  const runtimeEvents = events.filter((event) => getMeasurementClass(event) !== 'synthetic-test-probe');
  if (runtimeEvents.length > 0) {
    return {
      events: runtimeEvents,
      usesSyntheticFallback: false,
    };
  }
  return {
    events,
    usesSyntheticFallback: events.length > 0,
  };
}

function runBuildCheck() {
  const startedAt = Date.now();
  const run = spawnSync('npm', ['run', 'build'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 240_000,
  });
  const endedAt = Date.now();
  const ok = run.status === 0 && !run.signal;
  return {
    ok,
    durationMs: endedAt - startedAt,
    exitCode: run.status ?? 1,
    signal: run.signal ?? null,
    stderr: (run.stderr ?? '').trim(),
  };
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function buildMarkdownReport(input) {
  const {
    mode,
    version,
    environment,
    runId,
    buildCheck,
    aiSummary,
    transcriptionSummary,
    mainPathSummary,
    aiUsesSyntheticFallback,
    transcriptionUsesSyntheticFallback,
    p0Findings,
    p1Findings,
    p2Findings,
    gateDecision,
  } = input;

  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  lines.push('# M6 发布门禁判定报告（自动生成）');
  lines.push('');
  lines.push(`- 生成时间：${generatedAt}`);
  lines.push(`- 模式：${mode}`);
  lines.push(`- 维度：version=${version}, environment=${environment}`);
  if (runId) {
    lines.push(`- 运行ID：${runId}`);
  }
  lines.push(`- 结论：${gateDecision}`);
  lines.push('');

  lines.push('## SLO 评估结果');
  lines.push('');
  lines.push('| 指标 | 阈值 | 当前值 | 样本数 | 判定 |');
  lines.push('|---|---:|---:|---:|---|');
  lines.push(`| build.success_rate | 1.0000 | ${buildCheck.ok ? '1.0000' : '0.0000'} | 1 | ${buildCheck.ok ? 'PASS' : 'FAIL'} |`);
  lines.push(`| ai.chat.first_token_latency_ms.p95 | <= ${SLO.aiFirstTokenP95Ms} | ${aiSummary ? aiSummary.p95.toFixed(2) : 'N/A'} | ${aiSummary ? aiSummary.sampleCount : 0} | ${aiSummary ? (aiSummary.p95 <= SLO.aiFirstTokenP95Ms ? 'PASS' : 'WARN') : 'MISSING'} |`);
  lines.push(`| business.transcription.segment_action_latency_ms.p95 | <= ${SLO.transcriptionLatencyP95Ms} | ${transcriptionSummary ? transcriptionSummary.p95.toFixed(2) : 'N/A'} | ${transcriptionSummary ? transcriptionSummary.sampleCount : 0} | ${transcriptionSummary ? (transcriptionSummary.p95 <= SLO.transcriptionLatencyP95Ms ? 'PASS' : 'WARN') : 'MISSING'} |`);
  lines.push(`| business.e2e.main_path_success_rate | >= ${SLO.mainPathSuccessRate} | ${mainPathSummary ? mainPathSummary.p95.toFixed(4) : 'N/A'} | ${mainPathSummary ? mainPathSummary.sampleCount : 0} | ${mainPathSummary ? (mainPathSummary.p95 >= SLO.mainPathSuccessRate ? 'PASS' : 'FAIL') : 'MISSING'} |`);
  lines.push('');

  if (aiUsesSyntheticFallback || transcriptionUsesSyntheticFallback) {
    lines.push('## 样本来源说明');
    lines.push('');
    if (aiUsesSyntheticFallback) {
      lines.push('- AI 首包时延当前来自 synthetic-test-probe 样本。');
    }
    if (transcriptionUsesSyntheticFallback) {
      lines.push('- 转写操作时延当前来自 synthetic-test-probe 样本。');
    }
    lines.push('');
  }

  lines.push('## 分级门禁发现');
  lines.push('');
  lines.push(`- P0（阻断）数量：${p0Findings.length}`);
  for (const finding of p0Findings) {
    lines.push(`- P0: ${finding}`);
  }
  lines.push(`- P1（灰度）数量：${p1Findings.length}`);
  for (const finding of p1Findings) {
    lines.push(`- P1: ${finding}`);
  }
  lines.push(`- P2（观察）数量：${p2Findings.length}`);
  for (const finding of p2Findings) {
    lines.push(`- P2: ${finding}`);
  }
  lines.push('');

  lines.push('## 构建证据');
  lines.push('');
  lines.push(`- build 结果：${buildCheck.ok ? 'PASS' : 'FAIL'}`);
  lines.push(`- build 耗时：${formatDuration(buildCheck.durationMs)}`);
  lines.push(`- build 退出码：${buildCheck.exitCode}`);
  if (buildCheck.signal) {
    lines.push(`- build 终止信号：${buildCheck.signal}`);
  }
  if (buildCheck.stderr) {
    lines.push('- build stderr（尾部）：');
    for (const line of buildCheck.stderr.split(/\r?\n/).slice(-5)) {
      lines.push(`  ${line}`);
    }
  }
  lines.push('');

  lines.push('## 判定语义');
  lines.push('');
  lines.push('1. enforce 模式：存在 P0 即 no-go 并返回非零退出码。');
  lines.push('2. shadow 模式：即使存在 P0 也仅告警，不阻断流水线。');
  lines.push('3. P1 仅触发灰度告警，不直接阻断。');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = parseModeArg();
  const version = await readAppVersion();
  const environment = resolveEnvironmentTag();
  const runId = resolveRunId();

  const buildCheck = runBuildCheck();

  let events = [];
  try {
    const rawEvents = await readFile(metricEventLogPath, 'utf8');
    events = parseMetricEvents(rawEvents);
  } catch {
    events = [];
  }

  const aiEvents = filterByDimension(events, 'ai.chat.first_token_latency_ms', version, environment, runId);
  const transcriptionEvents = filterByDimension(events, 'business.transcription.segment_action_latency_ms', version, environment, runId);
  const mainPathEvents = filterByDimension(events, 'business.e2e.main_path_success_rate', version, environment, runId);

  const aiSelection = selectLatencyEvents(aiEvents);
  const transcriptionSelection = selectLatencyEvents(transcriptionEvents);

  const aiSummary = summarizeMetricEvents(aiSelection.events);
  const transcriptionSummary = summarizeMetricEvents(transcriptionSelection.events);
  const mainPathSummary = summarizeMetricEvents(mainPathEvents);

  const p0Findings = [];
  const p1Findings = [];
  const p2Findings = [];

  if (!buildCheck.ok) {
    p0Findings.push('构建失败（build.success_rate < 100%）。');
  }

  if (!mainPathSummary) {
    p0Findings.push('缺少主路径成功率指标事件（business.e2e.main_path_success_rate）。');
  } else if (mainPathSummary.p95 < SLO.mainPathSuccessRate) {
    p0Findings.push(`主路径成功率低于阈值：p95=${mainPathSummary.p95.toFixed(4)} < ${SLO.mainPathSuccessRate.toFixed(4)}。`);
  }

  if (!aiSummary) {
    p1Findings.push('缺少 AI 首包延迟指标样本（ai.chat.first_token_latency_ms）。');
  } else if (aiSummary.p95 > SLO.aiFirstTokenP95Ms) {
    p1Findings.push(`AI 首包延迟超阈：p95=${aiSummary.p95.toFixed(2)}ms > ${SLO.aiFirstTokenP95Ms}ms。`);
  }

  if (!transcriptionSummary) {
    p1Findings.push('缺少转写关键操作时延样本（business.transcription.segment_action_latency_ms）。');
  } else if (transcriptionSummary.p95 > SLO.transcriptionLatencyP95Ms) {
    p1Findings.push(`转写关键操作时延超阈：p95=${transcriptionSummary.p95.toFixed(2)}ms > ${SLO.transcriptionLatencyP95Ms}ms。`);
  }

  if (aiSummary && aiSummary.sampleCount < 20) {
    p2Findings.push(`AI 首包样本数偏少（sampleCount=${aiSummary.sampleCount}，建议 >= 20）。`);
  }
  if (transcriptionSummary && transcriptionSummary.sampleCount < 20) {
    p2Findings.push(`转写操作样本数偏少（sampleCount=${transcriptionSummary.sampleCount}，建议 >= 20）。`);
  }

  const blocked = p0Findings.length > 0;
  const gateDecision = blocked ? 'no-go' : (p1Findings.length > 0 ? 'go-with-gray' : 'go');

  const markdown = buildMarkdownReport({
    mode,
    version,
    environment,
    runId,
    buildCheck,
    aiSummary,
    transcriptionSummary,
    mainPathSummary,
    aiUsesSyntheticFallback: aiSelection.usesSyntheticFallback,
    transcriptionUsesSyntheticFallback: transcriptionSelection.usesSyntheticFallback,
    p0Findings,
    p1Findings,
    p2Findings,
    gateDecision,
  });

  await mkdir(path.dirname(reportOutputPath), { recursive: true });
  await writeFile(reportOutputPath, markdown, 'utf8');

  console.log(`[m6-gate] Report written: ${path.relative(workspaceRoot, reportOutputPath)}`);
  console.log(`[m6-gate] Gate decision: ${gateDecision}`);

  if (blocked && mode === 'enforce') {
    console.error('[m6-gate] Blocked by P0 findings.');
    process.exitCode = 1;
    return;
  }

  if (blocked && mode === 'shadow') {
    console.warn('[m6-gate] Shadow mode: P0 findings detected but not blocking.');
  }
}

main().catch((error) => {
  console.error('[m6-gate] Unexpected error:', error);
  process.exitCode = 1;
});
