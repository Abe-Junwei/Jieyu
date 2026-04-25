import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = process.cwd();
const DEFAULT_PROFILE = 'lite';
const SUPPORTED_PROFILES = new Set(['lite', 'core', 'collab-cloud', 'full']);
const DEFAULT_MODE = 'enforce';

const PROFILE_PIPELINES = {
  lite: [
    { id: 'check.docs-governance', script: 'check:docs-governance', module: 'docs' },
    { id: 'check.architecture-guard', script: 'check:architecture-guard', module: 'architecture' },
  ],
  core: [
    { id: 'check.docs-governance', script: 'check:docs-governance', module: 'docs' },
    { id: 'check.architecture-guard', script: 'check:architecture-guard', module: 'architecture' },
    { id: 'report.m5-trend', script: 'report:m5-trend', module: 'observability' },
    { id: 'gate.m6-release', script: 'gate:m6-release', module: 'release' },
    { id: 'check.m7-extension-foundation', script: 'check:m7-extension-foundation', module: 'extension' },
  ],
  'collab-cloud': [
    { id: 'check.docs-governance', script: 'check:docs-governance', module: 'docs' },
    { id: 'check.architecture-guard', script: 'check:architecture-guard', module: 'architecture' },
    { id: 'report.m5-trend', script: 'report:m5-trend', module: 'observability' },
    { id: 'gate.m6-release', script: 'gate:m6-release', module: 'release' },
    { id: 'check.m7-extension-foundation', script: 'check:m7-extension-foundation', module: 'extension' },
    { id: 'gate.collaboration-cloud', script: 'gate:collaboration-cloud', module: 'collaboration' },
  ],
  full: [
    { id: 'check.docs-governance', script: 'check:docs-governance', module: 'docs' },
    { id: 'check.architecture-guard', script: 'check:architecture-guard', module: 'architecture' },
    { id: 'report.m5-trend', script: 'report:m5-trend', module: 'observability' },
    { id: 'gate.m6-release', script: 'gate:m6-release', module: 'release' },
    { id: 'check.m7-extension-foundation', script: 'check:m7-extension-foundation', module: 'extension' },
    { id: 'perf.track', script: 'perf:track', module: 'performance' },
    { id: 'perf.ai', script: 'perf:ai', module: 'performance' },
    { id: 'test.timeline-cqrs-phase9', script: 'test:timeline-cqrs-phase9', module: 'performance' },
  ],
};

function parseArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  const raw = match.slice(prefix.length).trim();
  return raw.length > 0 ? raw : null;
}

function parseCsvArgValue(name) {
  const raw = parseArgValue(name);
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseReleaseProfile() {
  const profile = (parseArgValue('--profile') ?? DEFAULT_PROFILE).toLowerCase();
  if (SUPPORTED_PROFILES.has(profile)) return profile;
  return DEFAULT_PROFILE;
}

function parseMode() {
  const mode = (parseArgValue('--mode') ?? DEFAULT_MODE).toLowerCase();
  return mode === 'shadow' ? 'shadow' : 'enforce';
}

function resolveAiRequestIds() {
  const fromArg = parseCsvArgValue('--ai-request-ids');
  if (fromArg.length > 0) {
    return [...new Set(fromArg)];
  }

  const fromEnvRaw = String(process.env.RELEASE_EVIDENCE_AI_REQUEST_IDS ?? '').trim();
  if (!fromEnvRaw) return [];
  const fromEnv = fromEnvRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(fromEnv)];
}

function resolveAiCardsFixturePath() {
  const fromArg = parseArgValue('--ai-cards-fixture');
  if (fromArg) {
    return path.isAbsolute(fromArg)
      ? fromArg
      : path.join(workspaceRoot, fromArg);
  }

  const fromEnv = String(process.env.RELEASE_EVIDENCE_AI_CARDS_FIXTURE ?? '').trim();
  if (!fromEnv) return null;
  return path.isAbsolute(fromEnv)
    ? fromEnv
    : path.join(workspaceRoot, fromEnv);
}

function resolveAiAuditExportPath() {
  const fromArg = parseArgValue('--ai-audit-export');
  if (fromArg) {
    return path.isAbsolute(fromArg)
      ? fromArg
      : path.join(workspaceRoot, fromArg);
  }

  const fromEnv = String(process.env.RELEASE_EVIDENCE_AI_AUDIT_EXPORT ?? '').trim();
  if (!fromEnv) return null;
  return path.isAbsolute(fromEnv)
    ? fromEnv
    : path.join(workspaceRoot, fromEnv);
}

function resolveExtensionCapabilityAuditExportPath() {
  const fromArg = parseArgValue('--extension-capability-audit-export');
  if (fromArg) {
    return path.isAbsolute(fromArg)
      ? fromArg
      : path.join(workspaceRoot, fromArg);
  }

  const fromEnv = String(process.env.RELEASE_EVIDENCE_EXTENSION_CAPABILITY_AUDIT_EXPORT ?? '').trim();
  if (!fromEnv) return null;
  return path.isAbsolute(fromEnv)
    ? fromEnv
    : path.join(workspaceRoot, fromEnv);
}

function resolvePerfJsonReportPath() {
  const fromArg = parseArgValue('--perf-json-report');
  if (fromArg) {
    return path.isAbsolute(fromArg)
      ? fromArg
      : path.join(workspaceRoot, fromArg);
  }

  const fromEnv = String(process.env.RELEASE_EVIDENCE_PERF_JSON_REPORT ?? '').trim();
  if (!fromEnv) return null;
  return path.isAbsolute(fromEnv)
    ? fromEnv
    : path.join(workspaceRoot, fromEnv);
}

function resolveAiRequestSampleLimit() {
  const raw = parseArgValue('--ai-request-limit')
    ?? String(process.env.RELEASE_EVIDENCE_AI_REQUEST_LIMIT ?? '').trim();
  if (!raw) return 3;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.min(20, Math.floor(parsed));
}

function resolveCostEstimatorVersion() {
  const fromArg = parseArgValue('--cost-estimator-version');
  if (fromArg) return fromArg;
  const fromEnv = String(process.env.RELEASE_EVIDENCE_COST_ESTIMATOR_VERSION ?? '').trim();
  if (fromEnv) return fromEnv;
  return 'v1.provider_usage_or_unknown';
}

function resolveRequireCostGuardTrendReady() {
  if (hasFlag('--require-cost-guard-trend-ready')) return true;
  const fromEnv = String(process.env.RELEASE_EVIDENCE_REQUIRE_COST_GUARD_TREND_READY ?? '').trim().toLowerCase();
  return fromEnv === '1' || fromEnv === 'true' || fromEnv === 'yes';
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getTimestampParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return {
    iso: now.toISOString(),
    dateLabel: `${year}${month}${day}`,
    timeLabel: `${hour}${minute}${second}`,
  };
}

function sanitizeSegment(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function resolveOutputPath(profile) {
  const cliOutput = parseArgValue('--output');
  if (cliOutput) {
    return path.isAbsolute(cliOutput)
      ? cliOutput
      : path.join(workspaceRoot, cliOutput);
  }

  const ts = getTimestampParts();
  const fileName = `release-evidence-${ts.dateLabel}-${ts.timeLabel}-${sanitizeSegment(profile)}.json`;
  return path.join(
    workspaceRoot,
    'docs',
    'execution',
    'release-gates',
    'release-evidence',
    fileName,
  );
}

function resolveLogsDir(outputPath) {
  const fromArg = parseArgValue('--logs-dir');
  if (fromArg) {
    return path.isAbsolute(fromArg)
      ? fromArg
      : path.join(workspaceRoot, fromArg);
  }

  const outputDir = path.dirname(outputPath);
  const outputBase = path.basename(outputPath, path.extname(outputPath));
  return path.join(outputDir, 'logs', outputBase);
}

function resolveEnvironmentTag() {
  return process.env.CI ? 'ci' : 'local';
}

function readGitShortSha() {
  const run = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (run.status !== 0 || run.signal) return 'unknown';
  const sha = String(run.stdout ?? '').trim();
  return sha || 'unknown';
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

function getPipelineSteps(profile) {
  const steps = PROFILE_PIPELINES[profile];
  return Array.isArray(steps) ? steps : PROFILE_PIPELINES[DEFAULT_PROFILE];
}

function sanitizeFileSegment(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function summarizeOutput(outputText, status) {
  const lines = String(outputText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return status === 'passed'
      ? 'Command completed with no captured output.'
      : 'Command failed with no captured output.';
  }

  if (status === 'failed') {
    const preferred = lines.find((line) => /error|failed|exception|cannot/i.test(line));
    if (preferred) return preferred;
  }

  return lines[lines.length - 1] ?? 'No summary line.';
}

async function runPipelineStep(input) {
  const {
    step,
    index,
    total,
    logsDir,
    dryRun,
  } = input;

  const command = `npm run -s ${step.script}`;
  const logFileName = `${String(index + 1).padStart(2, '0')}-${sanitizeFileSegment(step.id)}.log`;
  const logPath = path.join(logsDir, logFileName);

  if (dryRun) {
    const dryLog = [
      `[release-evidence] Dry run step ${index + 1}/${total}`,
      `Command: ${command}`,
      'Execution skipped due to --dry-run.',
      '',
    ].join('\n');
    await writeFile(logPath, dryLog, 'utf8');
    return {
      id: step.id,
      module: step.module,
      script: step.script,
      command,
      status: 'skipped',
      exitCode: null,
      durationMs: 0,
      logPath,
      summary: 'Dry run mode: step was not executed.',
    };
  }

  const startedAt = Date.now();
  const run = spawnSync('npm', ['run', '-s', step.script], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;
  const combinedOutput = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const status = run.status === 0 && !run.signal ? 'passed' : 'failed';
  const exitCode = run.status ?? 1;
  const summary = summarizeOutput(combinedOutput, status);
  const logBody = [
    `[release-evidence] Step ${index + 1}/${total}`,
    `StepId: ${step.id}`,
    `Module: ${step.module}`,
    `Script: ${step.script}`,
    `Command: ${command}`,
    `Status: ${status}`,
    `ExitCode: ${exitCode}`,
    `Signal: ${run.signal ?? ''}`,
    `DurationMs: ${durationMs}`,
    '',
    '--- stdout ---',
    String(run.stdout ?? ''),
    '',
    '--- stderr ---',
    String(run.stderr ?? ''),
    '',
  ].join('\n');
  await writeFile(logPath, logBody, 'utf8');

  return {
    id: step.id,
    module: step.module,
    script: step.script,
    command,
    status,
    exitCode,
    durationMs,
    logPath,
    summary,
    combinedOutput,
  };
}

function countByStatus(stepResults, status) {
  return stepResults.filter((item) => item.status === status).length;
}

function toRelativePath(filePath) {
  return path.relative(workspaceRoot, filePath) || filePath;
}

function parseJsonMaybe(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function normalizeAuditRow(rawRow) {
  if (!rawRow || typeof rawRow !== 'object') return null;

  const requestId = typeof rawRow.requestId === 'string'
    ? rawRow.requestId
    : (typeof rawRow.request_id === 'string' ? rawRow.request_id : '');
  if (!requestId.trim()) return null;

  const collection = typeof rawRow.collection === 'string' ? rawRow.collection : '';
  const field = typeof rawRow.field === 'string' ? rawRow.field : '';
  const timestamp = typeof rawRow.timestamp === 'string'
    ? rawRow.timestamp
    : (typeof rawRow.createdAt === 'string' ? rawRow.createdAt : '');
  const newValue = typeof rawRow.newValue === 'string'
    ? rawRow.newValue
    : (typeof rawRow.new_value === 'string' ? rawRow.new_value : '');
  const metadataJson = typeof rawRow.metadataJson === 'string'
    ? rawRow.metadataJson
    : (typeof rawRow.metadata_json === 'string' ? rawRow.metadata_json : '');

  return {
    requestId: requestId.trim(),
    collection,
    field,
    timestamp,
    newValue,
    metadataJson,
  };
}

function parseAuditRowsFromNdjson(rawText) {
  const rows = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parsed = parseJsonMaybe(line);
    const row = normalizeAuditRow(parsed);
    if (row) rows.push(row);
  }
  return rows;
}

function parseAuditRowsFromJson(rawText) {
  const parsed = parseJsonMaybe(rawText);
  if (!parsed) return [];

  const candidateRows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rows)
      ? parsed.rows
      : Array.isArray(parsed.auditLogs)
        ? parsed.auditLogs
        : Array.isArray(parsed.audit_logs)
          ? parsed.audit_logs
          : [];

  const rows = [];
  for (const candidate of candidateRows) {
    const row = normalizeAuditRow(candidate);
    if (row) rows.push(row);
  }
  return rows;
}

async function loadAiAuditExportRows(auditExportPath) {
  if (!auditExportPath) {
    return {
      rows: [],
      readError: null,
    };
  }

  try {
    const rawText = await readFile(auditExportPath, 'utf8');
    const lower = auditExportPath.toLowerCase();
    const rows = lower.endsWith('.ndjson')
      ? parseAuditRowsFromNdjson(rawText)
      : parseAuditRowsFromJson(rawText);
    return {
      rows,
      readError: null,
    };
  } catch (error) {
    return {
      rows: [],
      readError: toErrorPayload(error),
    };
  }
}

function getMetadataObject(row) {
  const parsed = parseJsonMaybe(row.metadataJson);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function extractToolNameFromDecisionRow(row) {
  const metadata = getMetadataObject(row);
  const fromMetadata = typeof metadata?.toolCall?.name === 'string'
    ? metadata.toolCall.name.trim()
    : '';
  if (fromMetadata) return fromMetadata;

  const parts = String(row.newValue ?? '').split(':').map((part) => part.trim()).filter(Boolean);
  return parts[1] ?? 'unknown';
}

function extractDecisionFromDecisionRow(row) {
  const parts = String(row.newValue ?? '').split(':').map((part) => part.trim()).filter(Boolean);
  return {
    decision: parts[0] ?? 'unknown',
    reason: parts[2] ?? undefined,
  };
}

function selectLatestRows(rows) {
  const toTimestamp = (value) => {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return [...rows].sort((a, b) => {
    const at = toTimestamp(a.timestamp);
    const bt = toTimestamp(b.timestamp);
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (at !== null && bt === null) return 1;
    if (at === null && bt !== null) return -1;
    return String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? ''));
  });
}

function buildAiCardFromAuditRows(requestId, rows, auditExportPath) {
  const scopedRows = rows.filter((row) => row.requestId === requestId && row.collection === 'ai_messages');
  if (scopedRows.length === 0) return null;

  const decisionRows = selectLatestRows(scopedRows.filter((row) => row.field === 'ai_tool_call_decision'));
  if (decisionRows.length === 0) {
    return {
      requestId,
      status: 'skipped',
      source: 'audit_export',
      skipReason: 'no_decision_rows',
      toolName: 'unknown',
      replayable: false,
      latestDecision: { decision: 'unknown' },
      diff: { matches: null },
      auditLogQueryHint: buildAuditLogQueryHint(requestId),
      auditExportPath: toRelativePath(auditExportPath),
    };
  }

  const latestDecisionRow = decisionRows[decisionRows.length - 1];
  const latestDecisionMeta = getMetadataObject(latestDecisionRow);
  const latestDecisionBase = extractDecisionFromDecisionRow(latestDecisionRow);
  const toolCall = latestDecisionMeta?.toolCall && typeof latestDecisionMeta.toolCall === 'object'
    ? latestDecisionMeta.toolCall
    : null;
  const toolName = extractToolNameFromDecisionRow(latestDecisionRow);
  const replayable = typeof toolCall?.name === 'string'
    && toolCall.name.trim().length > 0
    && !!toolCall.arguments
    && typeof toolCall.arguments === 'object';

  return {
    requestId,
    status: 'ready',
    source: 'audit_export',
    toolName,
    replayable,
    latestDecision: {
      decision: latestDecisionBase.decision,
      ...(latestDecisionBase.reason ? { reason: latestDecisionBase.reason } : {}),
      ...(typeof latestDecisionMeta?.executed === 'boolean' ? { executed: latestDecisionMeta.executed } : {}),
      ...(typeof latestDecisionMeta?.message === 'string' && latestDecisionMeta.message.trim().length > 0
        ? { message: latestDecisionMeta.message.trim() }
        : {}),
      ...(typeof latestDecisionRow.timestamp === 'string' && latestDecisionRow.timestamp.trim().length > 0
        ? { timestamp: latestDecisionRow.timestamp.trim() }
        : {}),
    },
    diff: { matches: null },
    auditLogQueryHint: buildAuditLogQueryHint(requestId),
    auditExportPath: toRelativePath(auditExportPath),
  };
}

function collectRequestIdsFromAuditRows(rows, limit) {
  const ordered = selectLatestRows(rows.filter((row) => row.collection === 'ai_messages' && row.field === 'ai_tool_call_decision'));
  const selected = [];
  const seen = new Set();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const row = ordered[index];
    if (!row) continue;
    if (seen.has(row.requestId)) continue;
    seen.add(row.requestId);
    selected.push(row.requestId);
    if (selected.length >= limit) break;
  }
  return selected;
}

function buildAuditLogQueryHint(requestId) {
  return `collection=ai_messages;field=ai_tool_call_decision;requestId=${requestId}`;
}

function normalizeDiff(rawDiff) {
  if (!rawDiff || typeof rawDiff !== 'object') {
    return { matches: null };
  }
  const matches = typeof rawDiff.matches === 'boolean' ? rawDiff.matches : null;
  const baselinePath = typeof rawDiff.baselinePath === 'string' && rawDiff.baselinePath.trim().length > 0
    ? rawDiff.baselinePath.trim()
    : undefined;
  return {
    matches,
    ...(baselinePath ? { baselinePath } : {}),
  };
}

function normalizeAiCardFromFixture(rawCard, requestId) {
  const toolName = typeof rawCard.toolName === 'string' && rawCard.toolName.trim().length > 0
    ? rawCard.toolName.trim()
    : 'unknown';
  const replayable = typeof rawCard.replayable === 'boolean' ? rawCard.replayable : false;
  const latestDecision = rawCard.latestDecision && typeof rawCard.latestDecision === 'object'
    ? {
        decision: typeof rawCard.latestDecision.decision === 'string' && rawCard.latestDecision.decision.trim().length > 0
          ? rawCard.latestDecision.decision.trim()
          : 'unknown',
        ...(typeof rawCard.latestDecision.reason === 'string' && rawCard.latestDecision.reason.trim().length > 0
          ? { reason: rawCard.latestDecision.reason.trim() }
          : {}),
      }
    : { decision: 'unknown' };
  const diff = normalizeDiff(rawCard.diff);
  const goldenSnapshotPath = typeof rawCard.goldenSnapshotPath === 'string' && rawCard.goldenSnapshotPath.trim().length > 0
    ? rawCard.goldenSnapshotPath.trim()
    : undefined;

  return {
    requestId,
    status: 'ready',
    source: 'fixture',
    toolName,
    replayable,
    latestDecision,
    diff,
    ...(goldenSnapshotPath ? { goldenSnapshotPath } : {}),
    auditLogQueryHint: buildAuditLogQueryHint(requestId),
  };
}

async function loadAiCardsFixtureMap(fixturePath) {
  if (!fixturePath) {
    return {
      cardMap: new Map(),
      readError: null,
    };
  }

  try {
    const rawText = await readFile(fixturePath, 'utf8');
    const parsed = JSON.parse(rawText);
    const cards = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.cards)
        ? parsed.cards
        : (parsed && typeof parsed === 'object' && typeof parsed.requestId === 'string')
          ? [parsed]
        : [];
    const cardMap = new Map();
    for (const rawCard of cards) {
      if (!rawCard || typeof rawCard !== 'object') continue;
      const requestId = typeof rawCard.requestId === 'string' ? rawCard.requestId.trim() : '';
      if (!requestId) continue;
      cardMap.set(requestId, rawCard);
    }
    return {
      cardMap,
      readError: null,
    };
  } catch (error) {
    return {
      cardMap: new Map(),
      readError: toErrorPayload(error),
    };
  }
}

function buildAiEvidenceCardsSection(input) {
  const {
    requestIds,
    fixturePath,
    fixtureMap,
    fixtureReadError,
    auditExportPath,
    auditRows,
    auditReadError,
  } = input;

  if (requestIds.length === 0) {
    return {
      summary: {
        total: 0,
        ready: 0,
        skipped: 0,
      },
      status: 'skipped',
      skipReason: 'no_request_ids_provided',
      cards: [],
    };
  }

  const cards = requestIds.map((requestId) => {
    if (auditExportPath) {
      const fromAudit = buildAiCardFromAuditRows(requestId, auditRows, auditExportPath);
      if (fromAudit) return fromAudit;
    }

    const fixtureCard = fixtureMap.get(requestId);
    if (fixtureCard && typeof fixtureCard === 'object') {
      return normalizeAiCardFromFixture(fixtureCard, requestId);
    }
    return {
      requestId,
      status: 'skipped',
      source: fixturePath ? 'request-id-only' : 'request-id-only',
      skipReason: auditExportPath
        ? 'request_id_not_found_in_audit_export'
        : fixturePath
          ? 'request_id_not_found_in_fixture'
          : 'no_fixture_source',
      toolName: 'unknown',
      replayable: false,
      latestDecision: { decision: 'unknown' },
      diff: { matches: null },
      auditLogQueryHint: buildAuditLogQueryHint(requestId),
    };
  });

  const ready = cards.filter((card) => card.status === 'ready').length;
  const skipped = cards.filter((card) => card.status === 'skipped').length;

  const section = {
    summary: {
      total: cards.length,
      ready,
      skipped,
    },
    status: ready > 0 ? 'partial_or_ready' : 'skipped',
    cards,
  };

  if (fixturePath) {
    section.fixturePath = toRelativePath(fixturePath);
  }
  if (auditExportPath) {
    section.auditExportPath = toRelativePath(auditExportPath);
  }
  if (fixtureReadError) {
    section.fixtureReadError = fixtureReadError;
  }
  if (auditReadError) {
    section.auditReadError = auditReadError;
  }
  if (ready === 0 && !fixtureReadError) {
    section.skipReason = auditExportPath
      ? 'no_matching_request_id_in_audit_export'
      : fixturePath
        ? 'no_matching_request_id_in_fixture'
        : 'no_fixture_source';
  }
  return section;
}

const PERF_STEP_CARD_DEFS = [
  {
    cardId: 'track_layout_baseline',
    title: 'Track layout baseline',
    script: 'perf:track',
    metricKind: 'medianMs',
    cases: [
      { label: '2k', maxMs: 120 },
      { label: '5k', maxMs: 260 },
    ],
  },
  {
    cardId: 'timeline_index_baseline',
    title: 'Timeline unit index baseline',
    script: 'test:timeline-cqrs-phase9',
    metricKind: 'elapsedMs',
    cases: [
      { label: '1k', maxMs: 80 },
      { label: '5k', maxMs: 250 },
      { label: '10k', maxMs: 500 },
    ],
  },
  {
    cardId: 'ai_baseline',
    title: 'AI baseline',
    script: 'perf:ai',
    metricKind: 'elapsedMs',
    cases: [],
  },
];

function mapPerfCardStatus(stepResult) {
  if (!stepResult) return 'not_run';
  if (stepResult.status === 'passed') return 'passed';
  if (stepResult.status === 'failed') return 'failed';
  if (stepResult.status === 'skipped') return 'skipped';
  return 'not_run';
}

function parsePerfObservedValues(stepResult, definition) {
  if (!stepResult || typeof stepResult.combinedOutput !== 'string') return [];
  const output = stepResult.combinedOutput;

  if (definition.script === 'perf:track') {
    const matches = [...output.matchAll(/\[Track Perf Baseline\]\[(2k|5k)\][\s\S]*?medianMs:\s*([0-9]+(?:\.[0-9]+)?)/g)];
    return matches.map((match) => ({
      label: String(match[1]),
      observedMs: Number(match[2]),
    })).filter((item) => Number.isFinite(item.observedMs));
  }

  if (definition.script === 'test:timeline-cqrs-phase9') {
    const matches = [...output.matchAll(/builds\s+([0-9_]+)\s+units under\s+([0-9]+)ms[\s\S]*?expected\s+([0-9]+(?:\.[0-9]+)?)\s+to be less than\s+([0-9]+)/g)];
    return matches.map((match) => ({
      label: `${String(match[1]).replaceAll('_', '')}`.replace(/^1000$/, '1k').replace(/^5000$/, '5k').replace(/^10000$/, '10k'),
      observedMs: Number(match[3]),
    })).filter((item) => Number.isFinite(item.observedMs));
  }

  if (definition.script === 'perf:ai') {
    const embedding = output.match(/\[AI Perf Baseline\]\[embedding\][\s\S]*?elapsedMs:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (embedding?.[1]) {
      const value = Number(embedding[1]);
      if (Number.isFinite(value)) {
        return [{ label: 'embedding', observedMs: value }];
      }
    }
  }

  return [];
}

function parsePerfObservedValuesFromJsonReport(reportJson, definition) {
  if (!reportJson || typeof reportJson !== 'object') return [];

  // Preferred normalized payload written by CI helpers.
  if (Array.isArray(reportJson.cards)) {
    const filtered = reportJson.cards.filter((item) => item?.script === definition.script);
    return filtered
      .map((item) => ({
        label: typeof item.label === 'string' ? item.label.trim() : '',
        observedMs: Number(item.observedMs),
      }))
      .filter((item) => item.label.length > 0 && Number.isFinite(item.observedMs));
  }

  // Fallback for direct vitest JSON reporter output.
  if (!Array.isArray(reportJson.testResults)) return [];
  const lines = [];
  for (const suite of reportJson.testResults) {
    if (!Array.isArray(suite?.assertionResults)) continue;
    for (const assertion of suite.assertionResults) {
      const title = typeof assertion?.fullName === 'string'
        ? assertion.fullName
        : (typeof assertion?.title === 'string' ? assertion.title : '');
      if (!title) continue;
      const duration = Number(assertion?.duration ?? assertion?.durationMs ?? NaN);
      if (!Number.isFinite(duration)) continue;
      lines.push({ title, duration });
    }
  }

  if (definition.script === 'perf:track') {
    return lines
      .map((line) => {
        const m = line.title.match(/\b(2k|5k)\b/i);
        if (!m) return null;
        return { label: m[1].toLowerCase(), observedMs: line.duration };
      })
      .filter(Boolean);
  }

  if (definition.script === 'test:timeline-cqrs-phase9') {
    return lines
      .map((line) => {
        const m = line.title.match(/\b(1k|5k|10k|1000|5000|10000)\b/i);
        if (!m) return null;
        const label = String(m[1]).toLowerCase()
          .replace(/^1000$/, '1k')
          .replace(/^5000$/, '5k')
          .replace(/^10000$/, '10k');
        return { label, observedMs: line.duration };
      })
      .filter(Boolean);
  }

  if (definition.script === 'perf:ai') {
    const hit = lines.find((line) => /embedding/i.test(line.title));
    if (hit) return [{ label: 'embedding', observedMs: hit.duration }];
  }

  return [];
}

async function loadPerfJsonReport(reportPath) {
  if (!reportPath) {
    return { report: null, readError: null };
  }

  try {
    const rawText = await readFile(reportPath, 'utf8');
    const parsed = parseJsonMaybe(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return {
        report: null,
        readError: {
          name: 'InvalidPerfJsonReport',
          message: 'perf json report is not a valid object payload',
        },
      };
    }
    return { report: parsed, readError: null };
  } catch (error) {
    return { report: null, readError: toErrorPayload(error) };
  }
}

function buildPerfEvidenceSection(stepResults, releaseProfile, perfJsonReport, perfJsonReportPath, perfJsonReportReadError) {
  const cards = PERF_STEP_CARD_DEFS.map((definition) => {
    const stepResult = stepResults.find((item) => item.script === definition.script);
    const status = mapPerfCardStatus(stepResult);
    const observedFromReport = parsePerfObservedValuesFromJsonReport(perfJsonReport, definition);
    const observedFromOutput = parsePerfObservedValues(stepResult, definition);
    const observed = observedFromReport.length > 0 ? observedFromReport : observedFromOutput;
    const thresholds = definition.cases;
    const thresholdMaxMs = thresholds.length > 0
      ? Math.max(...thresholds.map((item) => item.maxMs))
      : null;
    const metricObservedMs = observed.length > 0
      ? Math.max(...observed.map((item) => item.observedMs))
      : null;
    return {
      id: definition.cardId,
      title: definition.title,
      script: definition.script,
      status,
      elapsedMs: stepResult ? stepResult.durationMs : null,
      thresholdMaxMs,
      metricObservedMs,
      metricKind: definition.metricKind,
      checks: thresholds.map((target) => {
        const hit = observed.find((item) => item.label === target.label);
        return {
          label: target.label,
          maxMs: target.maxMs,
          observedMs: hit ? hit.observedMs : null,
          passed: hit ? hit.observedMs < target.maxMs : null,
        };
      }),
      summary: stepResult ? stepResult.summary : 'Step is not part of current profile pipeline.',
    };
  });

  const passed = cards.filter((card) => card.status === 'passed').length;
  const failed = cards.filter((card) => card.status === 'failed').length;
  const skipped = cards.filter((card) => card.status === 'skipped' || card.status === 'not_run').length;
  const hasProfilePerfStep = stepResults.some((item) => item.module === 'performance');

  if (!hasProfilePerfStep) {
    const out = {
      status: 'skipped',
      skipReason: 'profile_without_performance_steps',
      summary: {
        total: cards.length,
        passed,
        failed,
        skipped,
      },
      cards,
      profile: releaseProfile,
    };
    if (perfJsonReportPath) {
      out.perfJsonReportPath = toRelativePath(perfJsonReportPath);
    }
    if (perfJsonReportReadError) {
      out.perfJsonReportReadError = perfJsonReportReadError;
    }
    return out;
  }

  const out = {
    status: failed > 0 ? 'degraded' : 'ready_or_partial',
    summary: {
      total: cards.length,
      passed,
      failed,
      skipped,
    },
    cards,
    profile: releaseProfile,
  };
  if (perfJsonReportPath) {
    out.perfJsonReportPath = toRelativePath(perfJsonReportPath);
  }
  if (perfJsonReportReadError) {
    out.perfJsonReportReadError = perfJsonReportReadError;
  }
  return out;
}

function normalizeExtensionCapabilityAuditRow(rawRow) {
  if (!rawRow || typeof rawRow !== 'object') return null;
  const extensionId = typeof rawRow.extensionId === 'string'
    ? rawRow.extensionId.trim()
    : (typeof rawRow.extension_id === 'string' ? rawRow.extension_id.trim() : '');
  if (!extensionId) return null;
  const capability = typeof rawRow.capability === 'string' ? rawRow.capability.trim() : '';
  const ok = rawRow.ok === true || rawRow.ok === false ? rawRow.ok : null;
  if (ok === null) return null;
  return {
    extensionId,
    capability,
    ok,
  };
}

function parseExtensionCapabilityAuditRowsFromNdjson(rawText) {
  const rows = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parsed = parseJsonMaybe(line);
    const row = normalizeExtensionCapabilityAuditRow(parsed);
    if (row) rows.push(row);
  }
  return rows;
}

function parseExtensionCapabilityAuditRowsFromJson(rawText) {
  const parsed = parseJsonMaybe(rawText);
  if (!parsed) return [];
  const candidateRows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rows)
      ? parsed.rows
      : Array.isArray(parsed.audit)
        ? parsed.audit
        : [];
  const rows = [];
  for (const candidate of candidateRows) {
    const row = normalizeExtensionCapabilityAuditRow(candidate);
    if (row) rows.push(row);
  }
  return rows;
}

async function loadExtensionCapabilityAuditRows(auditExportPath) {
  if (!auditExportPath) {
    return { rows: [], readError: null };
  }
  try {
    const rawText = await readFile(auditExportPath, 'utf8');
    const lower = auditExportPath.toLowerCase();
    const rows = lower.endsWith('.ndjson')
      ? parseExtensionCapabilityAuditRowsFromNdjson(rawText)
      : parseExtensionCapabilityAuditRowsFromJson(rawText);
    return { rows, readError: null };
  } catch (error) {
    return { rows: [], readError: toErrorPayload(error) };
  }
}

function buildExtensionCapabilityAuditSection(input) {
  const { auditExportPath, auditRows, readError } = input;
  if (!auditExportPath) {
    return {
      status: 'skipped',
      skipReason: 'no_extension_capability_audit_source',
      capabilityAuditSummary: [],
    };
  }

  if (auditRows.length === 0) {
    const out = {
      status: 'skipped',
      skipReason: 'empty_extension_capability_audit_rows',
      auditExportPath: toRelativePath(auditExportPath),
      capabilityAuditSummary: [],
    };
    if (readError) out.readError = readError;
    return out;
  }

  const grouped = new Map();
  for (const row of auditRows) {
    if (!grouped.has(row.extensionId)) {
      grouped.set(row.extensionId, {
        extensionId: row.extensionId,
        total: 0,
        success: 0,
        failed: 0,
      });
    }
    const slot = grouped.get(row.extensionId);
    slot.total += 1;
    if (row.ok) slot.success += 1;
    else slot.failed += 1;
  }

  const capabilityAuditSummary = [...grouped.values()]
    .map((item) => ({
      extensionId: item.extensionId,
      total: item.total,
      success: item.success,
      failed: item.failed,
      successRate: item.total > 0 ? Number((item.success / item.total).toFixed(4)) : 0,
    }))
    .sort((a, b) => a.extensionId.localeCompare(b.extensionId));

  const out = {
    status: 'ready_or_partial',
    auditExportPath: toRelativePath(auditExportPath),
    capabilityAuditSummary,
  };
  if (readError) out.readError = readError;
  return out;
}

const COST_GUARD_BUDGET_REASONS = new Set([
  'budget_exceeded',
  'context_budget_exceeded',
  'session_budget_exceeded',
  'cost_budget_exceeded',
]);

const COST_GUARD_RETRY_REASONS = new Set([
  'retry_with_compact_context',
  'retry_after_output_cap',
  'retry_budget_upgrade',
]);

const COST_GUARD_OUTPUT_CAP_REASONS = new Set([
  'output_cap_triggered',
  'output_token_cap_exceeded',
  'completion_output_capped',
]);

const PROGRESSIVE_SUCCESS_DECISIONS = new Set(['confirmed', 'auto_confirmed']);
const PROGRESSIVE_ADVANCED_REASON_CODES = new Set([
  'retry_with_compact_context',
  'retry_after_output_cap',
  'retry_budget_upgrade',
  'context_budget_exceeded',
  'session_budget_exceeded',
  'cost_budget_exceeded',
  'output_cap_triggered',
  'output_token_cap_exceeded',
  'completion_output_capped',
]);

function toFixedRate(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  if (!Number.isFinite(numerator) || numerator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function buildProgressiveDisclosureCard(input) {
  const {
    id,
    numerator,
    denominator,
    numeratorSource,
    denominatorSource,
    fullSampleRequestIds,
    releaseProfile,
  } = input;
  return {
    id,
    status: 'ready_or_partial',
    value: toFixedRate(numerator, denominator),
    numerator,
    denominator,
    numeratorSource,
    denominatorSource,
    ...(releaseProfile === 'full' ? { sampleRequestIds: fullSampleRequestIds.slice(0, 10) } : {}),
  };
}

function buildProgressiveDisclosureSection(input) {
  const {
    auditExportPath,
    auditRows,
    releaseProfile,
  } = input;

  if (!auditExportPath) {
    return {
      status: 'skipped',
      skipReason: 'no_audit_export_source',
      cards: [],
    };
  }

  const decisionRows = selectLatestRows(
    auditRows.filter((row) => row.collection === 'ai_messages' && row.field === 'ai_tool_call_decision'),
  );

  if (decisionRows.length === 0) {
    return {
      status: 'skipped',
      skipReason: 'no_decision_rows',
      auditExportPath: toRelativePath(auditExportPath),
      cards: [],
    };
  }

  const requestStats = new Map();
  for (const row of decisionRows) {
    if (!requestStats.has(row.requestId)) {
      requestStats.set(row.requestId, {
        latestDecision: 'unknown',
        clarifyCount: 0,
        hasAdvancedEntry: false,
      });
    }
    const slot = requestStats.get(row.requestId);
    const decision = extractDecisionFromDecisionRow(row);
    const reason = String(decision.reason ?? '').trim();
    const metadata = getMetadataObject(row);

    slot.latestDecision = decision.decision;
    if (decision.decision === 'clarify') {
      slot.clarifyCount += 1;
    }
    const advancedByReason = PROGRESSIVE_ADVANCED_REASON_CODES.has(reason);
    const advancedByDecision = decision.decision === 'retry' || decision.decision === 'capped';
    const advancedByMetadata = isRetryTriggeredByMetadata(metadata)
      || isOutputCapTriggeredByMetadata(metadata)
      || isBudgetTriggeredByMetadata(metadata);
    if (advancedByReason || advancedByDecision || advancedByMetadata) {
      slot.hasAdvancedEntry = true;
    }
  }

  const total = requestStats.size;
  const firstPassIds = [];
  const clarifyThenSuccessIds = [];
  const advancedEntryIds = [];
  const clarifyLoopIds = [];

  for (const [requestId, item] of requestStats.entries()) {
    const success = PROGRESSIVE_SUCCESS_DECISIONS.has(item.latestDecision);
    if (success && item.clarifyCount === 0) firstPassIds.push(requestId);
    if (success && item.clarifyCount === 1) clarifyThenSuccessIds.push(requestId);
    if (item.hasAdvancedEntry) advancedEntryIds.push(requestId);
    if (!success && item.clarifyCount >= 2) clarifyLoopIds.push(requestId);
  }

  return {
    status: 'ready_or_partial',
    auditExportPath: toRelativePath(auditExportPath),
    cards: [
      buildProgressiveDisclosureCard({
        id: 'first_pass_resolution_rate',
        numerator: firstPassIds.length,
        denominator: total,
        numeratorSource: 'ai_messages.ai_tool_call_decision latestDecision in {confirmed,auto_confirmed} and clarifyCount=0',
        denominatorSource: 'distinct requestId in ai_messages.ai_tool_call_decision',
        fullSampleRequestIds: firstPassIds,
        releaseProfile,
      }),
      buildProgressiveDisclosureCard({
        id: 'clarify_then_success_rate',
        numerator: clarifyThenSuccessIds.length,
        denominator: total,
        numeratorSource: 'ai_messages.ai_tool_call_decision latestDecision in {confirmed,auto_confirmed} and clarifyCount=1',
        denominatorSource: 'distinct requestId in ai_messages.ai_tool_call_decision',
        fullSampleRequestIds: clarifyThenSuccessIds,
        releaseProfile,
      }),
      buildProgressiveDisclosureCard({
        id: 'advanced_entry_reach_rate',
        numerator: advancedEntryIds.length,
        denominator: total,
        numeratorSource: 'ai_messages.ai_tool_call_decision reason in advanced set OR decision in {retry,capped}',
        denominatorSource: 'distinct requestId in ai_messages.ai_tool_call_decision',
        fullSampleRequestIds: advancedEntryIds,
        releaseProfile,
      }),
      buildProgressiveDisclosureCard({
        id: 'clarify_loop_rate',
        numerator: clarifyLoopIds.length,
        denominator: total,
        numeratorSource: 'ai_messages.ai_tool_call_decision clarifyCount>=2 and latestDecision not in {confirmed,auto_confirmed}',
        denominatorSource: 'distinct requestId in ai_messages.ai_tool_call_decision',
        fullSampleRequestIds: clarifyLoopIds,
        releaseProfile,
      }),
    ],
  };
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMemoryRecallShapeSnapshot(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;

  const candidates = [
    metadata.memoryRecallShape,
    metadata.ragShape,
    metadata.retrievalShape,
    metadata.recallShape,
    metadata.rag && typeof metadata.rag === 'object' ? metadata.rag.shape : null,
  ].filter((item) => item && typeof item === 'object');

  for (const candidate of candidates) {
    const candidateCount = toFiniteNumber(
      candidate.candidateCount
      ?? candidate.candidatesTotal
      ?? candidate.retrievalCandidateCount,
    );
    const selectedCount = toFiniteNumber(
      candidate.selectedCount
      ?? candidate.selectedCandidates
      ?? candidate.selectedTotal,
    );
    const duplicateSuppressedCount = toFiniteNumber(
      candidate.duplicateSuppressedCount
      ?? candidate.deduplicatedCount
      ?? candidate.duplicateFilteredCount,
    );
    const budgetSuppressedCount = toFiniteNumber(
      candidate.budgetSuppressedCount
      ?? candidate.budgetFilteredCount
      ?? candidate.trimmedByBudgetCount,
    );
    const freshnessBucketRaw = candidate.freshnessBucket
      ?? (candidate.freshness && typeof candidate.freshness === 'object' ? candidate.freshness.bucket : null)
      ?? candidate.freshnessLevel;
    const freshnessBucket = typeof freshnessBucketRaw === 'string' ? freshnessBucketRaw.trim() : '';

    const hasAnyMetric = candidateCount !== null
      || selectedCount !== null
      || duplicateSuppressedCount !== null
      || budgetSuppressedCount !== null
      || freshnessBucket.length > 0;

    if (!hasAnyMetric) continue;
    return {
      candidateCount,
      selectedCount,
      duplicateSuppressedCount,
      budgetSuppressedCount,
      freshnessBucket,
    };
  }

  return null;
}

function buildMemoryRecallShapeSection(input) {
  const {
    auditExportPath,
    auditRows,
    releaseProfile,
  } = input;

  if (!auditExportPath) {
    return {
      status: 'skipped',
      skipReason: 'no_audit_export_source',
      card: null,
    };
  }

  const decisionRows = selectLatestRows(
    auditRows.filter((row) => row.collection === 'ai_messages' && row.field === 'ai_tool_call_decision'),
  );

  if (decisionRows.length === 0) {
    return {
      status: 'skipped',
      skipReason: 'no_decision_rows',
      auditExportPath: toRelativePath(auditExportPath),
      card: null,
    };
  }

  let candidateCountSum = 0;
  let candidateCountSamples = 0;
  let selectedCountSamples = 0;
  let emptySelectionCount = 0;
  let duplicateSuppressionSamples = 0;
  let duplicateSuppressionTriggered = 0;
  let budgetSuppressionSamples = 0;
  let budgetSuppressionTriggered = 0;
  const freshnessDistribution = new Map();
  const sampleRequestIds = [];

  for (const row of decisionRows) {
    const metadata = getMetadataObject(row);
    const snapshot = extractMemoryRecallShapeSnapshot(metadata);
    if (!snapshot) continue;

    sampleRequestIds.push(row.requestId);

    if (snapshot.candidateCount !== null) {
      candidateCountSum += snapshot.candidateCount;
      candidateCountSamples += 1;
    }

    if (snapshot.selectedCount !== null) {
      selectedCountSamples += 1;
      if (snapshot.selectedCount === 0) {
        emptySelectionCount += 1;
      }
    }

    if (snapshot.duplicateSuppressedCount !== null) {
      duplicateSuppressionSamples += 1;
      if (snapshot.duplicateSuppressedCount > 0) {
        duplicateSuppressionTriggered += 1;
      }
    }

    if (snapshot.budgetSuppressedCount !== null) {
      budgetSuppressionSamples += 1;
      if (snapshot.budgetSuppressedCount > 0) {
        budgetSuppressionTriggered += 1;
      }
    }

    if (snapshot.freshnessBucket.length > 0) {
      const current = freshnessDistribution.get(snapshot.freshnessBucket) ?? 0;
      freshnessDistribution.set(snapshot.freshnessBucket, current + 1);
    }
  }

  if (sampleRequestIds.length === 0) {
    return {
      status: 'skipped',
      skipReason: 'no_rag_shape_metadata',
      auditExportPath: toRelativePath(auditExportPath),
      card: null,
    };
  }

  const uniqueSampleRequestIds = [...new Set(sampleRequestIds)];
  const candidateCountAvg = candidateCountSamples > 0
    ? Number((candidateCountSum / candidateCountSamples).toFixed(4))
    : 0;
  const emptySelectionRate = toFixedRate(emptySelectionCount, selectedCountSamples);
  const duplicateSuppressionRate = toFixedRate(duplicateSuppressionTriggered, duplicateSuppressionSamples);
  const budgetSuppressionRate = toFixedRate(budgetSuppressionTriggered, budgetSuppressionSamples);
  const freshnessDistributionObject = Object.fromEntries(
    [...freshnessDistribution.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );

  return {
    status: 'ready_or_partial',
    auditExportPath: toRelativePath(auditExportPath),
    card: {
      id: 'memory_recall_shape_v1',
      status: 'ready_or_partial',
      sampleCount: uniqueSampleRequestIds.length,
      candidateCountAvg,
      emptySelectionRate,
      duplicateSuppressionRate,
      budgetSuppressionRate,
      freshnessDistribution: freshnessDistributionObject,
      numeratorSource: 'ai_messages.ai_tool_call_decision metadata.memoryRecallShape/ragShape',
      denominatorSource: 'decision rows with corresponding metric available',
      ...(releaseProfile === 'full' ? { sampleRequestIds: uniqueSampleRequestIds.slice(0, 10) } : {}),
    },
  };
}

function isRetryTriggeredByMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.retryTriggered === true) return true;
  if (metadata.retry === true) return true;
  if (metadata.retry && typeof metadata.retry === 'object' && metadata.retry.triggered === true) return true;
  if (metadata.contextRetry && typeof metadata.contextRetry === 'object' && metadata.contextRetry.triggered === true) return true;
  return false;
}

function isOutputCapTriggeredByMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.outputCapped === true) return true;
  if (metadata.outputCapTriggered === true) return true;
  if (metadata.outputCap && typeof metadata.outputCap === 'object' && metadata.outputCap.triggered === true) return true;
  return false;
}

function isBudgetTriggeredByMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.budgetTriggered === true) return true;
  if (metadata.sessionBudgetExceeded === true) return true;
  if (metadata.costGuard && typeof metadata.costGuard === 'object' && metadata.costGuard.budgetTriggered === true) {
    return true;
  }
  return false;
}

function buildCostGuardSection(input) {
  const {
    auditExportPath,
    auditRows,
    costEstimatorVersion,
  } = input;

  if (!auditExportPath) {
    return {
      status: 'skipped',
      skipReason: 'no_audit_export_source',
      estimatorVersion: costEstimatorVersion,
      summary: {
        requestCount: 0,
        budgetTriggerCount: 0,
        retryTriggeredCount: 0,
        retrySuccessCount: 0,
        outputCapTriggeredCount: 0,
      },
      trend: {
        bucket: 'day',
        pointCount: 0,
        compareReady: false,
        points: [],
      },
      card: {
        id: 'session_cost_guard_v1',
        status: 'skipped',
        sampleSource: 'none',
      },
    };
  }

  const decisionRows = selectLatestRows(
    auditRows.filter((row) => row.collection === 'ai_messages' && row.field === 'ai_tool_call_decision'),
  );

  if (decisionRows.length === 0) {
    return {
      status: 'skipped',
      skipReason: 'no_decision_rows',
      estimatorVersion: costEstimatorVersion,
      auditExportPath: toRelativePath(auditExportPath),
      summary: {
        requestCount: 0,
        budgetTriggerCount: 0,
        retryTriggeredCount: 0,
        retrySuccessCount: 0,
        outputCapTriggeredCount: 0,
      },
      trend: {
        bucket: 'day',
        pointCount: 0,
        compareReady: false,
        points: [],
      },
      card: {
        id: 'session_cost_guard_v1',
        status: 'skipped',
        sampleSource: 'audit_export',
      },
    };
  }

  const requestStats = new Map();
  for (const row of decisionRows) {
    const decision = extractDecisionFromDecisionRow(row);
    const reason = String(decision.reason ?? '').trim();
    const metadata = getMetadataObject(row);
    const requestId = row.requestId;
    if (!requestStats.has(requestId)) {
      requestStats.set(requestId, {
        hasRetry: false,
        hasBudgetTrigger: false,
        hasOutputCapTrigger: false,
        latestDecision: 'unknown',
        latestTimestamp: '',
      });
    }
    const current = requestStats.get(requestId);
    current.latestDecision = decision.decision;
    current.latestTimestamp = typeof row.timestamp === 'string' ? row.timestamp : '';

    const budgetTriggered = COST_GUARD_BUDGET_REASONS.has(reason) || isBudgetTriggeredByMetadata(metadata);
    if (budgetTriggered) current.hasBudgetTrigger = true;

    const retryTriggered = COST_GUARD_RETRY_REASONS.has(reason) || isRetryTriggeredByMetadata(metadata);
    if (retryTriggered) current.hasRetry = true;

    const outputCapTriggered = COST_GUARD_OUTPUT_CAP_REASONS.has(reason) || isOutputCapTriggeredByMetadata(metadata);
    if (outputCapTriggered) current.hasOutputCapTrigger = true;
  }

  let budgetTriggerCount = 0;
  let retryTriggeredCount = 0;
  let retrySuccessCount = 0;
  let outputCapTriggeredCount = 0;
  const trendByDay = new Map();
  for (const item of requestStats.values()) {
    if (item.hasBudgetTrigger) budgetTriggerCount += 1;
    if (item.hasRetry) retryTriggeredCount += 1;
    if (item.hasOutputCapTrigger) outputCapTriggeredCount += 1;
    if (item.hasRetry && (item.latestDecision === 'confirmed' || item.latestDecision === 'auto_confirmed')) {
      retrySuccessCount += 1;
    }

    const parsedTimestamp = Date.parse(String(item.latestTimestamp ?? ''));
    const dayBucket = Number.isFinite(parsedTimestamp)
      ? new Date(parsedTimestamp).toISOString().slice(0, 10)
      : 'unknown';

    if (!trendByDay.has(dayBucket)) {
      trendByDay.set(dayBucket, {
        requestCount: 0,
        budgetTriggerCount: 0,
        retryTriggeredCount: 0,
        retrySuccessCount: 0,
        outputCapTriggeredCount: 0,
      });
    }

    const slot = trendByDay.get(dayBucket);
    slot.requestCount += 1;
    if (item.hasBudgetTrigger) slot.budgetTriggerCount += 1;
    if (item.hasRetry) slot.retryTriggeredCount += 1;
    if (item.hasOutputCapTrigger) slot.outputCapTriggeredCount += 1;
    if (item.hasRetry && (item.latestDecision === 'confirmed' || item.latestDecision === 'auto_confirmed')) {
      slot.retrySuccessCount += 1;
    }
  }

  const trendPoints = [...trendByDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, item]) => ({
      date,
      requestCount: item.requestCount,
      budgetTriggerCount: item.budgetTriggerCount,
      retryTriggeredCount: item.retryTriggeredCount,
      retrySuccessCount: item.retrySuccessCount,
      outputCapTriggeredCount: item.outputCapTriggeredCount,
    }));

  return {
    status: 'ready_or_partial',
    estimatorVersion: costEstimatorVersion,
    auditExportPath: toRelativePath(auditExportPath),
    summary: {
      requestCount: requestStats.size,
      budgetTriggerCount,
      retryTriggeredCount,
      retrySuccessCount,
      outputCapTriggeredCount,
    },
    trend: {
      bucket: 'day',
      pointCount: trendPoints.length,
      compareReady: trendPoints.length >= 2,
      points: trendPoints,
    },
    card: {
      id: 'session_cost_guard_v1',
      status: 'ready_or_partial',
      sampleSource: 'audit_export',
      counts: {
        budgetTriggerCount,
        retryTriggeredCount,
        retrySuccessCount,
        outputCapTriggeredCount,
      },
    },
  };
}

function buildReport(input) {
  const {
    generatedAt,
    releaseProfile,
    mode,
    appVersion,
    environment,
    gitShortSha,
    dryRun,
    outputPath,
    logsDir,
    stepResults,
    aiEvidenceCards,
    perfSection,
    costGuardSection,
    extensionCapabilityAudit,
    progressiveDisclosureSection,
    memoryRecallShapeSection,
  } = input;

  const stepPassed = countByStatus(stepResults, 'passed');
  const failed = countByStatus(stepResults, 'failed');
  const stepSkipped = countByStatus(stepResults, 'skipped');
  const aiReady = aiEvidenceCards.summary.ready;
  const aiSkipped = aiEvidenceCards.summary.skipped;

  const steps = stepResults.map((item) => ({
    id: item.id,
    kind: 'gate_script',
    module: item.module,
    script: item.script,
    command: item.command,
    status: item.status,
    exitCode: item.exitCode,
    durationMs: item.durationMs,
    summary: item.summary,
    logPath: toRelativePath(item.logPath),
  }));

  const evidenceIndex = stepResults.map((item) => ({
    conclusionId: item.id,
    conclusion: item.status === 'passed'
      ? `${item.script} passed`
      : item.status === 'failed'
        ? `${item.script} failed`
        : `${item.script} skipped`,
    evidenceType: 'gate_script',
    command: item.command,
    module: item.module,
    exitCode: item.exitCode,
    logPath: toRelativePath(item.logPath),
    keySummary: item.summary,
  }));

  for (const card of aiEvidenceCards.cards) {
    evidenceIndex.push({
      conclusionId: `a2.${card.requestId}`,
      conclusion: card.status === 'ready'
        ? `AI evidence card ready for ${card.requestId}`
        : `AI evidence card skipped for ${card.requestId}`,
      evidenceType: card.status === 'ready' ? 'audit_replay' : 'audit_replay_skipped',
      command: card.status === 'ready'
        ? `ai_card:requestId=${card.requestId}`
        : `ai_card_skipped:requestId=${card.requestId}`,
      module: 'ai-audit',
      exitCode: card.status === 'ready' ? 0 : null,
      logPath: null,
      keySummary: card.status === 'ready'
        ? `${card.toolName}:${card.latestDecision?.decision ?? 'unknown'}`
        : (card.skipReason ?? 'skipped'),
    });
  }

  evidenceIndex.push({
    conclusionId: 'a3.perf.cards',
    conclusion: perfSection.status === 'skipped'
      ? 'A3 perf evidence cards skipped'
      : 'A3 perf evidence cards generated',
    evidenceType: perfSection.status === 'skipped' ? 'perf_cards_skipped' : 'perf_cards',
    command: 'release_evidence:perf_cards',
    module: 'performance',
    exitCode: perfSection.status === 'degraded' ? 1 : 0,
    logPath: null,
    keySummary: `passed=${perfSection.summary.passed};failed=${perfSection.summary.failed};skipped=${perfSection.summary.skipped}`,
  });

  evidenceIndex.push({
    conclusionId: 'b3.extensions.capability-audit-summary',
    conclusion: extensionCapabilityAudit.status === 'skipped'
      ? 'B3 extension capability audit summary skipped'
      : 'B3 extension capability audit summary generated',
    evidenceType: extensionCapabilityAudit.status === 'skipped'
      ? 'extension_capability_audit_skipped'
      : 'extension_capability_audit',
    command: 'release_evidence:extension_capability_audit',
    module: 'extension',
    exitCode: 0,
    logPath: null,
    keySummary: extensionCapabilityAudit.status === 'skipped'
      ? (extensionCapabilityAudit.skipReason ?? 'skipped')
      : `extensions=${extensionCapabilityAudit.capabilityAuditSummary.length}`,
  });

  evidenceIndex.push({
    conclusionId: 'p1.progressive-disclosure.v1',
    conclusion: progressiveDisclosureSection.status === 'skipped'
      ? 'P1-ProgressiveDisclosure card skipped'
      : 'P1-ProgressiveDisclosure card generated',
    evidenceType: progressiveDisclosureSection.status === 'skipped'
      ? 'progressive_disclosure_skipped'
      : 'progressive_disclosure',
    command: 'release_evidence:progressive_disclosure',
    module: 'ai-progressive-disclosure',
    exitCode: 0,
    logPath: null,
    keySummary: progressiveDisclosureSection.status === 'skipped'
      ? (progressiveDisclosureSection.skipReason ?? 'skipped')
      : `cards=${progressiveDisclosureSection.cards.length}`,
  });

  evidenceIndex.push({
    conclusionId: 'p1.rag-shape-telemetry.v1',
    conclusion: memoryRecallShapeSection.status === 'skipped'
      ? 'P1-RagShapeTelemetry card skipped'
      : 'P1-RagShapeTelemetry card generated',
    evidenceType: memoryRecallShapeSection.status === 'skipped'
      ? 'memory_recall_shape_skipped'
      : 'memory_recall_shape',
    command: 'release_evidence:memory_recall_shape',
    module: 'ai-rag-shape',
    exitCode: 0,
    logPath: null,
    keySummary: memoryRecallShapeSection.status === 'skipped'
      ? (memoryRecallShapeSection.skipReason ?? 'skipped')
      : `sampleCount=${memoryRecallShapeSection.card?.sampleCount ?? 0}`,
  });

  evidenceIndex.push({
    conclusionId: 'p1.cost-guard.v1',
    conclusion: costGuardSection.status === 'skipped'
      ? 'P1-CostGuard card skipped'
      : 'P1-CostGuard card generated',
    evidenceType: costGuardSection.status === 'skipped' ? 'cost_guard_skipped' : 'cost_guard',
    command: 'release_evidence:cost_guard',
    module: 'ai-cost',
    exitCode: 0,
    logPath: null,
    keySummary: `budget=${costGuardSection.summary.budgetTriggerCount};retry=${costGuardSection.summary.retryTriggeredCount};retrySuccess=${costGuardSection.summary.retrySuccessCount};outputCap=${costGuardSection.summary.outputCapTriggeredCount}`,
  });

  evidenceIndex.push({
    conclusionId: 'p1.cost-guard.trend.v1',
    conclusion: costGuardSection.status === 'skipped'
      ? 'P1-CostGuard trend card skipped'
      : 'P1-CostGuard trend card generated',
    evidenceType: costGuardSection.status === 'skipped' ? 'cost_guard_trend_skipped' : 'cost_guard_trend',
    command: 'release_evidence:cost_guard_trend',
    module: 'ai-cost',
    exitCode: 0,
    logPath: null,
    keySummary: costGuardSection.status === 'skipped'
      ? (costGuardSection.skipReason ?? 'skipped')
      : `points=${costGuardSection.trend.pointCount};compareReady=${costGuardSection.trend.compareReady ? 'yes' : 'no'}`,
  });

  return {
    schemaVersion: 1,
    reportType: 'release-evidence',
    degraded: failed > 0,
    metadata: {
      generatedAt,
      releaseProfile,
      mode,
      environment,
      appVersion,
      gitShortSha,
      nodeVersion: process.version,
      workspaceRoot,
      stage: 'A1b',
      dryRun,
      outputPath: toRelativePath(outputPath),
      logsDir: toRelativePath(logsDir),
    },
    summary: {
      total: steps.length + aiEvidenceCards.summary.total,
      passed: stepPassed + aiReady,
      failed,
      skipped: stepSkipped + aiSkipped,
    },
    evidenceIndex,
    steps,
    aiToolEvidenceCards: aiEvidenceCards,
    perf: perfSection,
    progressiveDisclosure: progressiveDisclosureSection,
    memoryRecallShape: memoryRecallShapeSection,
    costGuard: costGuardSection,
    extensions: extensionCapabilityAudit,
  };
}

async function writeReport(report, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function toErrorPayload(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: 'Error',
    message: String(error),
  };
}

async function run() {
  const releaseProfile = parseReleaseProfile();
  const mode = parseMode();
  const dryRun = hasFlag('--dry-run');
  const requireCostGuardTrendReady = resolveRequireCostGuardTrendReady();
  const outputPath = resolveOutputPath(releaseProfile);
  const logsDir = resolveLogsDir(outputPath);
  const aiRequestIds = resolveAiRequestIds();
  const aiCardsFixturePath = resolveAiCardsFixturePath();
  const aiAuditExportPath = resolveAiAuditExportPath();
  const extensionCapabilityAuditExportPath = resolveExtensionCapabilityAuditExportPath();
  const perfJsonReportPath = resolvePerfJsonReportPath();
  const aiRequestLimit = resolveAiRequestSampleLimit();
  const costEstimatorVersion = resolveCostEstimatorVersion();
  const generatedAt = getTimestampParts().iso;

  await mkdir(logsDir, { recursive: true });

  const [appVersion] = await Promise.all([
    readAppVersion(),
  ]);

  const plannedSteps = getPipelineSteps(releaseProfile);
  const fixtureLoad = await loadAiCardsFixtureMap(aiCardsFixturePath);
  const auditLoad = await loadAiAuditExportRows(aiAuditExportPath);
  const extensionCapabilityAuditLoad = await loadExtensionCapabilityAuditRows(extensionCapabilityAuditExportPath);
  const perfJsonReportLoad = await loadPerfJsonReport(perfJsonReportPath);
  const resolvedRequestIds = aiRequestIds.length > 0
    ? aiRequestIds
    : collectRequestIdsFromAuditRows(auditLoad.rows, aiRequestLimit);
  const stepResults = [];

  for (let index = 0; index < plannedSteps.length; index += 1) {
    const step = plannedSteps[index];
    if (!step) continue;

    const result = await runPipelineStep({
      step,
      index,
      total: plannedSteps.length,
      logsDir,
      dryRun,
    });
    stepResults.push(result);
    console.log(`[release-evidence] ${result.status.toUpperCase()} ${result.script}`);
  }

  const report = buildReport({
    generatedAt,
    releaseProfile,
    mode,
    appVersion,
    environment: resolveEnvironmentTag(),
    gitShortSha: readGitShortSha(),
    dryRun,
    outputPath,
    logsDir,
    stepResults,
    aiEvidenceCards: buildAiEvidenceCardsSection({
      requestIds: resolvedRequestIds,
      fixturePath: aiCardsFixturePath,
      fixtureMap: fixtureLoad.cardMap,
      fixtureReadError: fixtureLoad.readError,
      auditExportPath: aiAuditExportPath,
      auditRows: auditLoad.rows,
      auditReadError: auditLoad.readError,
    }),
    perfSection: buildPerfEvidenceSection(
      stepResults,
      releaseProfile,
      perfJsonReportLoad.report,
      perfJsonReportPath,
      perfJsonReportLoad.readError,
    ),
    costGuardSection: buildCostGuardSection({
      auditExportPath: aiAuditExportPath,
      auditRows: auditLoad.rows,
      costEstimatorVersion,
    }),
    extensionCapabilityAudit: buildExtensionCapabilityAuditSection({
      auditExportPath: extensionCapabilityAuditExportPath,
      auditRows: extensionCapabilityAuditLoad.rows,
      readError: extensionCapabilityAuditLoad.readError,
    }),
    progressiveDisclosureSection: buildProgressiveDisclosureSection({
      auditExportPath: aiAuditExportPath,
      auditRows: auditLoad.rows,
      releaseProfile,
    }),
    memoryRecallShapeSection: buildMemoryRecallShapeSection({
      auditExportPath: aiAuditExportPath,
      auditRows: auditLoad.rows,
      releaseProfile,
    }),
  });

  if (requireCostGuardTrendReady) {
    const compareReady = report.costGuard?.trend?.compareReady === true;
    const internalStepStatus = compareReady ? 'passed' : 'failed';
    const internalStep = {
      id: 'p1.cost-guard-trend.require-ready',
      kind: 'internal',
      module: 'ai-cost',
      script: 'require-cost-guard-trend-ready',
      command: 'release_evidence:require_cost_guard_trend_ready',
      status: internalStepStatus,
      exitCode: compareReady ? 0 : 1,
      durationMs: 0,
      summary: compareReady
        ? 'CostGuard trend compareReady requirement passed.'
        : 'CostGuard trend compareReady requirement failed.',
      logPath: null,
    };
    report.steps.push(internalStep);
    report.evidenceIndex.push({
      conclusionId: 'p1.cost-guard.trend.require-ready',
      conclusion: compareReady
        ? 'P1-CostGuard trend compareReady requirement passed'
        : 'P1-CostGuard trend compareReady requirement failed',
      evidenceType: compareReady ? 'cost_guard_trend_requirement' : 'cost_guard_trend_requirement_failed',
      command: 'release_evidence:require_cost_guard_trend_ready',
      module: 'ai-cost',
      exitCode: compareReady ? 0 : 1,
      logPath: null,
      keySummary: `compareReady=${compareReady ? 'yes' : 'no'};pointCount=${report.costGuard?.trend?.pointCount ?? 0}`,
    });
    report.summary.total += 1;
    if (compareReady) {
      report.summary.passed += 1;
    } else {
      report.summary.failed += 1;
      report.degraded = true;
    }
    report.metadata = {
      ...report.metadata,
      costGuardTrendRequirement: 'compareReady',
    };
  }

  await writeReport(report, outputPath);
  const displayPath = path.relative(workspaceRoot, outputPath) || outputPath;
  console.log(`[release-evidence] Wrote: ${displayPath}`);
  if (report.degraded) {
    console.warn('[release-evidence] Report marked as degraded.');
  }

  if (report.degraded && mode === 'enforce') {
    process.exitCode = 1;
  }
}

run().catch(async (error) => {
  const releaseProfile = parseReleaseProfile();
  const mode = parseMode();
  const dryRun = hasFlag('--dry-run');
  const outputPath = resolveOutputPath(releaseProfile);
  const logsDir = resolveLogsDir(outputPath);
  const generatedAt = getTimestampParts().iso;
  const degradedFallback = {
    schemaVersion: 1,
    reportType: 'release-evidence',
    degraded: true,
    metadata: {
      generatedAt,
      releaseProfile,
      mode,
      environment: resolveEnvironmentTag(),
      appVersion: '0.0.0-dev',
      gitShortSha: 'unknown',
      nodeVersion: process.version,
      workspaceRoot,
      stage: 'A1b',
      dryRun,
      outputPath: toRelativePath(outputPath),
      logsDir: toRelativePath(logsDir),
    },
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    },
    evidenceIndex: [],
    perf: {
      status: 'skipped',
      skipReason: 'fallback_due_to_unhandled_error',
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      cards: [],
      profile: releaseProfile,
    },
    progressiveDisclosure: {
      status: 'skipped',
      skipReason: 'fallback_due_to_unhandled_error',
      cards: [],
    },
    memoryRecallShape: {
      status: 'skipped',
      skipReason: 'fallback_due_to_unhandled_error',
      card: null,
    },
    costGuard: {
      status: 'skipped',
      skipReason: 'fallback_due_to_unhandled_error',
      estimatorVersion: 'unknown',
      summary: {
        requestCount: 0,
        budgetTriggerCount: 0,
        retryTriggeredCount: 0,
        retrySuccessCount: 0,
        outputCapTriggeredCount: 0,
      },
      trend: {
        bucket: 'day',
        pointCount: 0,
        compareReady: false,
        points: [],
      },
      card: {
        id: 'session_cost_guard_v1',
        status: 'skipped',
        sampleSource: 'none',
      },
    },
    extensions: {
      status: 'skipped',
      skipReason: 'fallback_due_to_unhandled_error',
      capabilityAuditSummary: [],
    },
    steps: [
      {
        id: 'a1b.report.unhandled',
        kind: 'internal',
        status: 'failed',
        exitCode: 1,
        summary: 'Unhandled error; emitted degraded fallback payload.',
        error: toErrorPayload(error),
      },
    ],
  };

  try {
    await writeReport(degradedFallback, outputPath);
    const displayPath = path.relative(workspaceRoot, outputPath) || outputPath;
    console.error(`[release-evidence] Unhandled error; fallback report written: ${displayPath}`);
  } catch (writeError) {
    console.error('[release-evidence] Failed to write fallback report:', writeError);
  }

  console.error(error);
  process.exitCode = 1;
});
