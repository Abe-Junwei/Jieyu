import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readArg(name) {
  const prefix = `${name}=`;
  const matched = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!matched) return null;
  return matched.slice(prefix.length).trim();
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function resolvePathWithinRepo(rawPath, fallbackRelativePath) {
  const effective = rawPath && rawPath.length > 0 ? rawPath : fallbackRelativePath;
  return path.isAbsolute(effective) ? effective : path.resolve(repoRoot, effective);
}

function nowIso() {
  return new Date().toISOString();
}

function runCase(item) {
  const startedAt = Date.now();
  const result = spawnSync(item.command, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  const endedAt = Date.now();
  const elapsedMs = Math.max(0, endedAt - startedAt);
  const status = result.status === 0 ? 'passed' : 'failed';
  return {
    id: item.id,
    name: item.name,
    category: item.category ?? 'uncategorized',
    goldenTaskCount: Number.isFinite(Number(item.goldenTaskCount)) ? Math.max(0, Number(item.goldenTaskCount)) : 0,
    trajectorySignals: Array.isArray(item.trajectorySignals)
      ? [...new Set(item.trajectorySignals.filter((signal) => typeof signal === 'string' && signal.trim().length > 0).map((signal) => signal.trim()))]
      : [],
    command: item.command,
    status,
    exitCode: result.status ?? 1,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    elapsedMs,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function trimOutput(value, maxChars = 5000) {
  if (typeof value !== 'string') return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function main() {
  const mode = readArg('--mode') ?? 'enforce';
  if (mode !== 'enforce' && mode !== 'shadow') {
    process.stderr.write(`invalid --mode value: ${mode}\n`);
    process.exit(1);
  }
  const suitePath = resolvePathWithinRepo(readArg('--suite'), 'scripts/agent-evals/suite.v1.json');
  const reportPath = resolvePathWithinRepo(
    readArg('--report'),
    'docs/execution/release-gates/release-evidence/agent-evals-report.json',
  );
  const suite = JSON.parse(readFileSync(suitePath, 'utf8'));
  const cases = Array.isArray(suite.cases) ? suite.cases : [];
  if (cases.length === 0) {
    process.stderr.write(`agent eval suite has no cases: ${path.relative(repoRoot, suitePath)}\n`);
    process.exit(1);
  }

  const startedAt = nowIso();
  const caseResults = [];
  for (const item of cases) {
    process.stdout.write(`\n[agent-evals] running case ${item.id}: ${item.command}\n`);
    const result = runCase(item);
    caseResults.push(result);
    process.stdout.write(`[agent-evals] ${item.id}: ${result.status} (${result.elapsedMs}ms)\n`);
    if (result.status === 'failed' && hasFlag('--fail-fast')) {
      break;
    }
  }
  const endedAt = nowIso();

  const total = caseResults.length;
  const failed = caseResults.filter((item) => item.status === 'failed').length;
  const passed = total - failed;
  const passRate = total > 0 ? Number((passed / total).toFixed(4)) : 0;
  const requiredPassRate = Number(suite?.thresholds?.requiredPassRate ?? 1);
  const maxFailedCases = Number(suite?.thresholds?.maxFailedCases ?? 0);
  const coveredGoldenTasks = caseResults.reduce((sum, item) => sum + (Number.isFinite(Number(item.goldenTaskCount)) ? Number(item.goldenTaskCount) : 0), 0);
  const requiredGoldenTasksMin = Number(suite?.thresholds?.requiredGoldenTasksMin ?? 0);
  const coveredTrajectorySignals = [...new Set(caseResults.flatMap((item) => Array.isArray(item.trajectorySignals) ? item.trajectorySignals : []))];
  const requiredTrajectorySignals = Array.isArray(suite?.thresholds?.requiredTrajectorySignals)
    ? [...new Set(suite.thresholds.requiredTrajectorySignals.filter((signal) => typeof signal === 'string' && signal.trim().length > 0).map((signal) => signal.trim()))]
    : [];
  const missingTrajectorySignals = requiredTrajectorySignals.filter((signal) => !coveredTrajectorySignals.includes(signal));
  const thresholdPassed = passRate >= requiredPassRate
    && failed <= maxFailedCases
    && coveredGoldenTasks >= requiredGoldenTasksMin
    && missingTrajectorySignals.length === 0;

  const report = {
    schemaVersion: 1,
    generatedAt: endedAt,
    mode,
    suite: {
      suiteId: suite.suiteId ?? 'unknown',
      version: suite.version ?? 1,
      description: suite.description ?? '',
      suitePath: path.relative(repoRoot, suitePath),
    },
    summary: {
      total,
      passed,
      failed,
      passRate,
      requiredPassRate,
      maxFailedCases,
      coveredGoldenTasks,
      requiredGoldenTasksMin,
      coveredTrajectorySignals,
      requiredTrajectorySignals,
      missingTrajectorySignals,
      thresholdPassed,
      startedAt,
      endedAt,
    },
    cases: caseResults.map((item) => ({
      ...item,
      stdout: trimOutput(item.stdout),
      stderr: trimOutput(item.stderr),
    })),
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n[agent-evals] report written: ${path.relative(repoRoot, reportPath)}\n`);
  process.stdout.write(
    `[agent-evals] summary: passed=${passed}/${total}, passRate=${passRate}, goldenTasks=${coveredGoldenTasks}, missingTrajectorySignals=${missingTrajectorySignals.length}, thresholdPassed=${thresholdPassed}\n`,
  );

  if (mode === 'enforce' && !thresholdPassed) {
    process.exit(1);
  }
}

main();
