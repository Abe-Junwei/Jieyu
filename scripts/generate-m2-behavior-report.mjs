import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const reportsDir = path.join(workspaceRoot, '.tmp', 'm2');

// 报告输出路径：限制在工作区内防止路径穿越 | Report output: constrain within workspace to prevent path traversal
const rawReportPath = process.env.M2_BEHAVIOR_REPORT_PATH;
const resolvedReportPath = rawReportPath
  ? path.resolve(rawReportPath)
  : path.join(workspaceRoot, 'docs', 'execution', 'audits', 'M2-主路径行为对比报告-自动生成.md');
if (!resolvedReportPath.startsWith(workspaceRoot + path.sep) && resolvedReportPath !== workspaceRoot) {
  throw new Error(`M2_BEHAVIOR_REPORT_PATH must be within workspace root (${workspaceRoot}), got: ${resolvedReportPath}`);
}
const markdownOutputPath = resolvedReportPath;

const suiteMatrix = [
  {
    id: 'import-export-idempotency',
    title: '导入导出幂等性矩阵',
    goal: '同一快照重复导入后，导出结果保持一致；异常样本不污染现有数据',
    files: [
      'src/db/importExportRoundTripIdempotency.test.ts',
      'src/db/importDatabaseFromJson.test.ts',
    ],
  },
  {
    id: 'main-path-e2e',
    title: '主路径 E2E 门禁矩阵',
    goal: '覆盖转写创建 / 编辑 / 保存 / 导出的核心用户路径',
    files: [
      'src/pages/useTranscriptionSegmentCreationController.test.tsx',
      'src/pages/useTranscriptionSegmentMutationController.test.tsx',
      'src/hooks/useTranscriptionPersistence.test.tsx',
      'src/hooks/useImportExport.export.test.tsx',
    ],
  },
];

function toCommandString(args) {
  return ['npx', ...args].join(' ');
}

function collectFailedAssertions(report) {
  const failures = [];
  for (const suite of report.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status === 'failed') {
        failures.push({
          suite: assertion.ancestorTitles?.join(' > ') || suite.name,
          name: assertion.fullName || assertion.title,
          message: (assertion.failureMessages ?? []).join('\n').trim(),
        });
      }
    }
  }
  return failures;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function runSuite(suite) {
  const outputFile = path.join(reportsDir, `${suite.id}.vitest.json`);
  const args = ['vitest', 'run', ...suite.files, '--reporter=json', '--outputFile', outputFile];
  const command = toCommandString(args);
  const startedAt = Date.now();
  // 超时保护：避免 vitest 挂起时永久阻塞 CI | Timeout guard: prevent CI hang when vitest stalls
  const run = spawnSync('npx', args, { cwd: workspaceRoot, encoding: 'utf8', timeout: 120_000 });
  const endedAt = Date.now();

  return {
    id: suite.id,
    title: suite.title,
    goal: suite.goal,
    files: suite.files,
    command,
    outputFile,
    // 保留 signal 信息用于诊断超时/被杀场景 | Preserve signal info for timeout/kill diagnostics
    exitCode: run.status ?? 1,
    signal: run.signal ?? null,
    durationMs: endedAt - startedAt,
    stdout: (run.stdout ?? '').trim(),
    stderr: (run.stderr ?? '').trim(),
  };
}

function formatLocalDateTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function buildMarkdown(results, generatedAt, blocked) {
  const lines = [];
  lines.push('# M2 主路径行为对比报告（自动生成）');
  lines.push('');
  lines.push(`- 生成时间：${generatedAt}`);
  lines.push('- 执行来源：`npm run gate:m2`');
  lines.push(`- 发布判定：${blocked ? '阻断（存在失败）' : '通过（可继续）'}`);
  lines.push('');
  lines.push('## 执行矩阵');
  lines.push('');
  lines.push('| 套件 | 目标 | 测试文件数 | 用例通过 | 用例失败 | 套件通过 | 耗时 |');
  lines.push('|---|---|---:|---:|---:|---:|---:|');
  for (const result of results) {
    const report = result.report;
    lines.push(
      `| ${result.title} | ${result.goal} | ${result.files.length} | ${report?.numPassedTests ?? 0} | ${report?.numFailedTests ?? 0} | ${result.passed ? '是' : '否'} | ${formatDuration(result.durationMs)} |`,
    );
  }
  lines.push('');

  lines.push('## 详情');
  lines.push('');
  for (const result of results) {
    lines.push(`### ${result.title}`);
    lines.push('');
    lines.push(`- 命令：\`${result.command}\``);
    lines.push(`- JSON 报告：\`${path.relative(workspaceRoot, result.outputFile)}\``);
    lines.push(`- 退出码：${result.exitCode}`);
    if (result.signal) {
      lines.push(`- 终止信号：${result.signal}`);
    }
    lines.push(`- 套件状态：${result.passed ? '通过' : '失败'}`);
    if (!result.passed && result.failures.length > 0) {
      lines.push('- 失败断言：');
      for (const failure of result.failures.slice(0, 10)) {
        lines.push(`  - ${failure.name}`);
        if (failure.message) {
          lines.push(`    - ${failure.message.split('\n')[0]}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('## 门禁规则');
  lines.push('');
  lines.push('1. 任一套件失败即阻断发布。');
  lines.push('2. 阻断条件与 CI 的 `m2-mainpath-gate` 作业保持一致。');
  lines.push('3. 仅当全部套件通过时判定为 `go`。');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const rawResults = suiteMatrix.map((suite) => runSuite(suite));

  const results = [];
  for (const raw of rawResults) {
    let report = null;
    try {
      report = await readJson(raw.outputFile);
    } catch {
      report = null;
    }

    const passed = raw.exitCode === 0 && Boolean(report?.success);
    const failures = report ? collectFailedAssertions(report) : [];
    results.push({
      ...raw,
      report,
      passed,
      failures,
    });
  }

  const blocked = results.some((result) => !result.passed);
  const markdown = buildMarkdown(results, formatLocalDateTime(), blocked);
  await writeFile(markdownOutputPath, markdown, 'utf8');

  const relativeReportPath = path.relative(workspaceRoot, markdownOutputPath);
  console.log(`[m2-gate] Report written: ${relativeReportPath}`);
  for (const result of results) {
    const signalSuffix = result.signal ? ` [signal=${result.signal}]` : '';
    console.log(`[m2-gate] ${result.title}: ${result.passed ? 'PASS' : 'FAIL'} (${formatDuration(result.durationMs)})${signalSuffix}`);
  }

  if (blocked) {
    console.error('[m2-gate] Gate failed: release must be blocked.');
    process.exitCode = 1;
    return;
  }

  console.log('[m2-gate] Gate passed: release may proceed.');
}

main().catch((error) => {
  console.error('[m2-gate] Unexpected error', error);
  process.exitCode = 1;
});