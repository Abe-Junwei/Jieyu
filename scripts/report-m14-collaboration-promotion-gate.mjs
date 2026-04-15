import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const tmpDir = path.join(workspaceRoot, '.tmp', 'm14');
const vitestJsonPath = path.join(tmpDir, 'm14-collaboration-promotion.vitest.json');
const reportOutputPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'release-gates',
  'M14-协作生产放行评审报告-自动生成.md',
);

const phaseReports = [
  { phaseId: 'm10', file: 'docs/execution/release-gates/M10-协作可用化评审报告-自动生成.md' },
  { phaseId: 'm11', file: 'docs/execution/release-gates/M11-跨设备协作评审报告-自动生成.md' },
  { phaseId: 'm12', file: 'docs/execution/release-gates/M12-多副本批量同步评审报告-自动生成.md' },
  { phaseId: 'm13', file: 'docs/execution/release-gates/M13-跨实体事务同步评审报告-自动生成.md' },
];

function parseModeArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!raw) return 'enforce';
  const mode = raw.slice('--mode='.length).trim().toLowerCase();
  return mode === 'shadow' ? 'shadow' : 'enforce';
}

function resolveTotals(assertions, prefix) {
  const scoped = assertions.filter((item) => item.title.includes(prefix));
  const total = scoped.length;
  const passed = scoped.filter((item) => item.status === 'passed').length;
  return {
    total,
    passed,
    rate: total > 0 ? passed / total : 0,
  };
}

function toRateLabel(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function parseCount(markdown, label) {
  const match = markdown.match(new RegExp(`- ${label}：([0-9]+)`));
  return match ? Number(match[1]) : 0;
}

async function readPhaseStatus(phase) {
  const markdown = await readFile(path.join(workspaceRoot, phase.file), 'utf8');
  const decisionMatch = markdown.match(/- 结论：([a-z-]+)/);
  if (!decisionMatch) {
    throw new Error(`missing decision in ${phase.file}`);
  }
  return {
    phaseId: phase.phaseId,
    decision: decisionMatch[1],
    p0Count: parseCount(markdown, 'P0（阻断）数量'),
    p1Count: parseCount(markdown, 'P1（灰度）数量'),
    p2Count: parseCount(markdown, 'P2（观察）数量'),
  };
}

function buildReport({
  mode,
  aggregation,
  readiness,
  stage,
  rollback,
  statuses,
  p0Findings,
  p1Findings,
  p2Findings,
  decision,
}) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push('# M14 协作生产放行评审报告（自动生成）');
  lines.push('');
  lines.push(`- 生成时间：${generatedAt}`);
  lines.push(`- 模式：${mode}`);
  lines.push(`- 结论：${decision}`);
  lines.push('');

  lines.push('## 上游阶段汇总');
  lines.push('');
  lines.push('| 阶段 | 决策 | P0 | P1 | P2 |');
  lines.push('|---|---|---:|---:|---:|');
  for (const status of statuses) {
    lines.push(`| ${status.phaseId.toUpperCase()} | ${status.decision} | ${status.p0Count} | ${status.p1Count} | ${status.p2Count} |`);
  }
  lines.push('');

  lines.push('## 指标评估结果');
  lines.push('');
  lines.push('| 指标 | 阈值 | 当前值 | 判定 |');
  lines.push('|---|---:|---:|---|');
  lines.push(`| phase_report_aggregation_pass_rate | 100% | ${toRateLabel(aggregation.rate)} (${aggregation.passed}/${aggregation.total}) | ${aggregation.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| promotion_readiness_contract_pass_rate | 100% | ${toRateLabel(readiness.rate)} (${readiness.passed}/${readiness.total}) | ${readiness.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| promotion_stage_contract_pass_rate | 100% | ${toRateLabel(stage.rate)} (${stage.passed}/${stage.total}) | ${stage.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| rollback_watchlist_contract_pass_rate | 100% | ${toRateLabel(rollback.rate)} (${rollback.passed}/${rollback.total}) | ${rollback.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push('');

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

  lines.push('## 判定语义');
  lines.push('');
  lines.push('1. enforce 模式：存在任一 P0 即 no-go 并返回非零退出码。');
  lines.push('2. shadow 模式：存在 P0 仅告警，不阻断流水线。');
  lines.push('3. M14 要求 M10-M13 上游阶段全部已生成报告，生产放行聚合契约为 100%。');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = parseModeArg();
  await mkdir(tmpDir, { recursive: true });

  const args = [
    'vitest',
    'run',
    'src/collaboration/collaborationPromotionRuntime.test.ts',
    '--reporter=json',
    '--outputFile',
    vitestJsonPath,
  ];

  const run = spawnSync('npx', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 240_000,
  });

  let report = null;
  try {
    const raw = await readFile(vitestJsonPath, 'utf8');
    report = JSON.parse(raw);
  } catch {
    report = null;
  }

  if (!report?.testResults) {
    console.error('[m14-collaboration-promotion] Missing vitest json report.');
    process.exitCode = 1;
    return;
  }

  const assertions = report.testResults
    .flatMap((suite) => suite.assertionResults ?? [])
    .map((assertion) => ({
      title: String(assertion.title ?? ''),
      status: String(assertion.status ?? ''),
    }));

  const aggregation = resolveTotals(assertions, '[aggregate]');
  const readiness = resolveTotals(assertions, '[readiness]');
  const stage = resolveTotals(assertions, '[stage]');
  const rollback = resolveTotals(assertions, '[rollback]');

  const p0Findings = [];
  const p1Findings = [];
  const p2Findings = [];

  const statuses = [];
  for (const phase of phaseReports) {
    try {
      statuses.push(await readPhaseStatus(phase));
    } catch (error) {
      p0Findings.push(`缺少或无法解析 ${phase.phaseId.toUpperCase()} 自动生成报告：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (aggregation.rate < 1) {
    p0Findings.push(`阶段聚合契约通过率不达标：${toRateLabel(aggregation.rate)}。`);
  }
  if (readiness.rate < 1) {
    p0Findings.push(`放行就绪契约通过率不达标：${toRateLabel(readiness.rate)}。`);
  }
  if (stage.rate < 1) {
    p0Findings.push(`放行阶段判定契约通过率不达标：${toRateLabel(stage.rate)}。`);
  }
  if (rollback.rate < 1) {
    p0Findings.push(`回滚观察清单契约通过率不达标：${toRateLabel(rollback.rate)}。`);
  }

  for (const status of statuses) {
    if (status.decision === 'no-go' || status.p0Count > 0) {
      p0Findings.push(`${status.phaseId.toUpperCase()} 仍存在阻断项，不能进入协作生产放行。`);
    } else if (status.decision === 'go-with-gray' || status.p1Count > 0) {
      p1Findings.push(`${status.phaseId.toUpperCase()} 需要灰度观察后再全量放行。`);
    } else if (status.p2Count > 0) {
      p2Findings.push(`${status.phaseId.toUpperCase()} 存在观察项，放行后需持续监测。`);
    }
  }

  if (run.status !== 0 || run.signal) {
    p0Findings.push('vitest 执行失败，协作生产放行契约测试未完成。');
  }

  const decision = p0Findings.length > 0 ? 'no-go' : (p1Findings.length > 0 ? 'go-with-gray' : 'go');
  const markdown = buildReport({
    mode,
    aggregation,
    readiness,
    stage,
    rollback,
    statuses,
    p0Findings,
    p1Findings,
    p2Findings,
    decision,
  });

  await mkdir(path.dirname(reportOutputPath), { recursive: true });
  await writeFile(reportOutputPath, markdown, 'utf8');

  console.log(`[m14-collaboration-promotion] Report written: ${path.relative(workspaceRoot, reportOutputPath)}`);
  console.log(`[m14-collaboration-promotion] Gate decision: ${decision}`);

  if (decision === 'no-go' && mode === 'enforce') {
    process.exitCode = 1;
  }
}

await main();
