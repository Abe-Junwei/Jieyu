import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const tmpDir = path.join(workspaceRoot, '.tmp', 'm13');
const vitestJsonPath = path.join(tmpDir, 'm13-transaction-sync.vitest.json');
const reportOutputPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'release-gates',
  'M13-跨实体事务同步评审报告-自动生成.md',
);

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

function buildReport({
  mode,
  txn,
  atomic,
  rollback,
  crossEntity,
  p0Findings,
  p1Findings,
  p2Findings,
  decision,
}) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push('# M13 跨实体事务同步评审报告（自动生成）');
  lines.push('');
  lines.push(`- 生成时间：${generatedAt}`);
  lines.push(`- 模式：${mode}`);
  lines.push(`- 结论：${decision}`);
  lines.push('');

  lines.push('## 指标评估结果');
  lines.push('');
  lines.push('| 指标 | 阈值 | 当前值 | 判定 |');
  lines.push('|---|---:|---:|---|');
  lines.push(`| transaction_sync_contract_pass_rate | 100% | ${toRateLabel(txn.rate)} (${txn.passed}/${txn.total}) | ${txn.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| atomicity_contract_pass_rate | 100% | ${toRateLabel(atomic.rate)} (${atomic.passed}/${atomic.total}) | ${atomic.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| rollback_contract_pass_rate | 100% | ${toRateLabel(rollback.rate)} (${rollback.passed}/${rollback.total}) | ${rollback.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| cross_entity_consistency_pass_rate | 100% | ${toRateLabel(crossEntity.rate)} (${crossEntity.passed}/${crossEntity.total}) | ${crossEntity.rate === 1 ? 'PASS' : 'FAIL'} |`);
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
  lines.push('3. M13 要求事务同步、原子性、回滚与跨实体一致性契约均为 100%。');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = parseModeArg();
  await mkdir(tmpDir, { recursive: true });

  const args = [
    'vitest',
    'run',
    'src/collaboration/collaborationTransactionSyncRuntime.test.ts',
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
    console.error('[m13-transaction-sync] Missing vitest json report.');
    process.exitCode = 1;
    return;
  }

  const assertions = report.testResults
    .flatMap((suite) => suite.assertionResults ?? [])
    .map((assertion) => ({
      title: String(assertion.title ?? ''),
      status: String(assertion.status ?? ''),
    }));

  const txn = resolveTotals(assertions, '[txn]');
  const atomic = resolveTotals(assertions, '[atomic]');
  const rollback = resolveTotals(assertions, '[rollback]');
  const crossEntity = resolveTotals(assertions, '[cross-entity]');

  const p0Findings = [];
  const p1Findings = [];
  const p2Findings = [];

  if (txn.rate < 1) {
    p0Findings.push(`事务同步契约通过率不达标：${toRateLabel(txn.rate)}。`);
  }
  if (atomic.rate < 1) {
    p0Findings.push(`原子性契约通过率不达标：${toRateLabel(atomic.rate)}。`);
  }
  if (rollback.rate < 1) {
    p0Findings.push(`回滚契约通过率不达标：${toRateLabel(rollback.rate)}。`);
  }
  if (crossEntity.rate < 1) {
    p0Findings.push(`跨实体一致性契约通过率不达标：${toRateLabel(crossEntity.rate)}。`);
  }

  if (run.status !== 0 || run.signal) {
    p0Findings.push('vitest 执行失败，跨实体事务同步契约测试未完成。');
  }

  const decision = p0Findings.length > 0 ? 'no-go' : (p1Findings.length > 0 ? 'go-with-gray' : 'go');

  const markdown = buildReport({
    mode,
    txn,
    atomic,
    rollback,
    crossEntity,
    p0Findings,
    p1Findings,
    p2Findings,
    decision,
  });

  await mkdir(path.dirname(reportOutputPath), { recursive: true });
  await writeFile(reportOutputPath, markdown, 'utf8');

  console.log(`[m13-transaction-sync] Report written: ${path.relative(workspaceRoot, reportOutputPath)}`);
  console.log(`[m13-transaction-sync] Gate decision: ${decision}`);

  if (p0Findings.length > 0 && mode === 'enforce') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[m13-transaction-sync] Unexpected error:', error);
  process.exitCode = 1;
});
