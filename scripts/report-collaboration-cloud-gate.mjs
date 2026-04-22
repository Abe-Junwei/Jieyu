import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const tmpDir = path.join(workspaceRoot, '.tmp', 'collaboration-cloud');
const vitestJsonPath = path.join(tmpDir, 'collaboration-cloud.vitest.json');
const reportOutputPath = path.join(
  workspaceRoot,
  'docs',
  'execution',
  'archive',
  'release-gates-auto',
  'collaboration-cloud-gate-report-auto.md',
);

const TEST_FILES = [
  'src/collaboration/cloud/cloudSyncProtocol.test.ts',
  'src/collaboration/cloud/collaborationProtocolGuard.test.ts',
  'src/collaboration/cloud/collaborationSyncDerived.test.ts',
  'src/collaboration/cloud/collaborationPhase6.test.ts',
  'src/collaboration/cloud/CollaborationSyncBridge.persistence.test.ts',
  'src/collaboration/cloud/CollaborationPresenceService.test.ts',
  'src/collaboration/cloud/CollaborationClientStateStore.test.ts',
  'src/hooks/useTranscriptionCollaborationBridge.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.conflict.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.applyRemote.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.presence.test.tsx',
  'src/components/transcription/CollaborationCloudPanel.test.tsx',
];

const PROTOCOL_SUITES = [
  'src/collaboration/cloud/cloudSyncProtocol.test.ts',
  'src/collaboration/cloud/collaborationProtocolGuard.test.ts',
  'src/collaboration/cloud/collaborationSyncDerived.test.ts',
];

const SERVICE_SUITES = [
  'src/collaboration/cloud/collaborationPhase6.test.ts',
  'src/collaboration/cloud/CollaborationSyncBridge.persistence.test.ts',
  'src/collaboration/cloud/CollaborationPresenceService.test.ts',
  'src/collaboration/cloud/CollaborationClientStateStore.test.ts',
];

const WORKSPACE_ENTRY_SUITES = [
  'src/hooks/useTranscriptionCollaborationBridge.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.conflict.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.applyRemote.test.tsx',
  'src/hooks/useTranscriptionCloudSyncActions.presence.test.tsx',
  'src/components/transcription/CollaborationCloudPanel.test.tsx',
];

function parseModeArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!raw) return 'enforce';
  const mode = raw.slice('--mode='.length).trim().toLowerCase();
  return mode === 'shadow' ? 'shadow' : 'enforce';
}

function toRateLabel(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function resolveSuiteAssertions(report, suiteSuffixes) {
  const suites = (report.testResults ?? []).filter((suite) => (
    suiteSuffixes.some((suffix) => String(suite.name ?? '').includes(suffix))
  ));

  return suites.flatMap((suite) => (suite.assertionResults ?? []).map((assertion) => ({
    title: String(assertion.title ?? ''),
    status: String(assertion.status ?? ''),
  })));
}

function resolveTotals(report, suiteSuffixes) {
  const assertions = resolveSuiteAssertions(report, suiteSuffixes);
  const total = assertions.length;
  const passed = assertions.filter((item) => item.status === 'passed').length;
  return {
    total,
    passed,
    rate: total > 0 ? passed / total : 0,
  };
}

function buildReport({
  mode,
  protocol,
  service,
  workspaceEntry,
  p0Findings,
  p1Findings,
  p2Findings,
  decision,
}) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];

  lines.push('# Collaboration Cloud Gate Report (Auto Generated)');
  lines.push('');
  lines.push(`- Generated At: ${generatedAt}`);
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Decision: ${decision}`);
  lines.push('');

  lines.push('## Contract Metrics');
  lines.push('');
  lines.push('| Metric | Target | Current | Status |');
  lines.push('|---|---:|---:|---|');
  lines.push(`| protocol_contract_pass_rate | 100% | ${toRateLabel(protocol.rate)} (${protocol.passed}/${protocol.total}) | ${protocol.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| cloud_service_contract_pass_rate | 100% | ${toRateLabel(service.rate)} (${service.passed}/${service.total}) | ${service.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push(`| workspace_entry_contract_pass_rate | 100% | ${toRateLabel(workspaceEntry.rate)} (${workspaceEntry.passed}/${workspaceEntry.total}) | ${workspaceEntry.rate === 1 ? 'PASS' : 'FAIL'} |`);
  lines.push('');

  lines.push('## Findings By Severity');
  lines.push('');
  lines.push(`- P0 Count: ${p0Findings.length}`);
  for (const finding of p0Findings) {
    lines.push(`- P0: ${finding}`);
  }
  lines.push(`- P1 Count: ${p1Findings.length}`);
  for (const finding of p1Findings) {
    lines.push(`- P1: ${finding}`);
  }
  lines.push(`- P2 Count: ${p2Findings.length}`);
  for (const finding of p2Findings) {
    lines.push(`- P2: ${finding}`);
  }
  lines.push('');

  lines.push('## Decision Semantics');
  lines.push('');
  lines.push('1. enforce mode: any P0 leads to non-zero exit code.');
  lines.push('2. shadow mode: P0 is reported but does not block.');
  lines.push('3. Cloud gate requires all three contract pass rates to reach 100%.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = parseModeArg();

  await mkdir(tmpDir, { recursive: true });

  const args = [
    'vitest',
    'run',
    ...TEST_FILES,
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
    console.error('[collaboration-cloud-gate] Missing vitest json report.');
    process.exitCode = 1;
    return;
  }

  const protocol = resolveTotals(report, PROTOCOL_SUITES);
  const service = resolveTotals(report, SERVICE_SUITES);
  const workspaceEntry = resolveTotals(report, WORKSPACE_ENTRY_SUITES);

  const p0Findings = [];
  const p1Findings = [];
  const p2Findings = [];

  if (protocol.rate < 1) {
    p0Findings.push(`Protocol contract pass rate is below 100%: ${toRateLabel(protocol.rate)}.`);
  }
  if (service.rate < 1) {
    p0Findings.push(`Cloud service contract pass rate is below 100%: ${toRateLabel(service.rate)}.`);
  }
  if (workspaceEntry.rate < 1) {
    p0Findings.push(`Workspace entry contract pass rate is below 100%: ${toRateLabel(workspaceEntry.rate)}.`);
  }
  if (run.status !== 0 || run.signal) {
    p0Findings.push('Vitest execution failed for collaboration cloud contracts.');
  }

  const decision = p0Findings.length > 0
    ? 'no-go'
    : (p1Findings.length > 0 ? 'go-with-gray' : 'go');

  const markdown = buildReport({
    mode,
    protocol,
    service,
    workspaceEntry,
    p0Findings,
    p1Findings,
    p2Findings,
    decision,
  });

  await mkdir(path.dirname(reportOutputPath), { recursive: true });
  await writeFile(reportOutputPath, markdown, 'utf8');

  console.log(`[collaboration-cloud-gate] Report written: ${path.relative(workspaceRoot, reportOutputPath)}`);
  console.log(`[collaboration-cloud-gate] Gate decision: ${decision}`);

  if (p0Findings.length > 0 && mode === 'enforce') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[collaboration-cloud-gate] Unexpected error:', error);
  process.exitCode = 1;
});
