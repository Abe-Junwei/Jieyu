#!/usr/bin/env node

import fs from 'node:fs';
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

function toAbsolutePath(rawPath, fallbackRelativePath) {
  const effective = rawPath && rawPath.length > 0 ? rawPath : fallbackRelativePath;
  return path.isAbsolute(effective) ? effective : path.resolve(repoRoot, effective);
}

function parseJsonMaybe(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toRelativePath(absolutePath) {
  const relative = path.relative(repoRoot, absolutePath);
  if (!relative || relative.startsWith('..')) return absolutePath;
  return relative;
}

function toRates(summary) {
  const total = Number(summary?.total ?? 0);
  const allow = Number(summary?.allow ?? 0);
  const ask = Number(summary?.ask ?? 0);
  const deny = Number(summary?.deny ?? 0);
  return {
    allowRate: total > 0 ? Number((allow / total).toFixed(4)) : 0,
    askRate: total > 0 ? Number((ask / total).toFixed(4)) : 0,
    denyRate: total > 0 ? Number((deny / total).toFixed(4)) : 0,
  };
}

function appendHistoryRecord(historyPath, report, reportPath) {
  const historyRecord = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    status: report.status,
    summary: report.summary,
    rates: report.rates,
    parseErrorCount: Number(report.parseErrorCount ?? 0),
    reportPath: toRelativePath(reportPath),
  };
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.appendFileSync(historyPath, `${JSON.stringify(historyRecord)}\n`, 'utf8');
}

function parseAuditRows(auditExportPath) {
  const text = fs.readFileSync(auditExportPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = [];
  const parseErrors = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object') rows.push(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      parseErrors.push({ line: index + 1, message });
    }
  }

  return { rows, parseErrors };
}

function pickLatestRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const requestId = typeof row.requestId === 'string' && row.requestId.trim().length > 0
      ? row.requestId.trim()
      : null;
    const documentId = typeof row.documentId === 'string' && row.documentId.trim().length > 0
      ? row.documentId.trim()
      : null;
    const id = typeof row.id === 'string' && row.id.trim().length > 0
      ? row.id.trim()
      : null;
    const key = requestId ?? documentId ?? id ?? `row-${byKey.size + 1}`;
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function buildReport(input) {
  const { auditExportPath, rows, parseErrors } = input;
  const filteredRows = pickLatestRows(
    rows.filter((row) => row.collection === 'ai_messages' && row.field === 'ai_session_sidecar_sandbox'),
  );

  if (filteredRows.length === 0) {
    const summary = {
      total: 0,
      allow: 0,
      ask: 0,
      deny: 0,
      unknown: 0,
    };
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'skipped',
      skipReason: 'no_session_sidecar_sandbox_rows',
      auditExportPath: toRelativePath(auditExportPath),
      summary,
      rates: toRates(summary),
      distributions: {
        actions: {},
        reasons: {},
        gates: {},
      },
      parseErrorCount: parseErrors.length,
    };
  }

  const actions = new Map();
  const reasons = new Map();
  const gates = new Map();
  const summary = {
    total: filteredRows.length,
    allow: 0,
    ask: 0,
    deny: 0,
    unknown: 0,
  };

  for (const row of filteredRows) {
    const metadata = parseJsonMaybe(row.metadataJson) ?? parseJsonMaybe(row.metadata_json) ?? {};
    const action = typeof metadata.sandboxAction === 'string' && metadata.sandboxAction.trim().length > 0
      ? metadata.sandboxAction.trim()
      : (typeof row.newValue === 'string' && row.newValue.trim().length > 0 ? row.newValue.trim() : 'unknown');
    const reason = typeof metadata.sandboxReason === 'string' && metadata.sandboxReason.trim().length > 0
      ? metadata.sandboxReason.trim()
      : 'unknown';
    const gate = typeof metadata.gate === 'string' && metadata.gate.trim().length > 0
      ? metadata.gate.trim()
      : 'unknown';

    actions.set(action, (actions.get(action) ?? 0) + 1);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    gates.set(gate, (gates.get(gate) ?? 0) + 1);

    if (action === 'allow') summary.allow += 1;
    else if (action === 'ask') summary.ask += 1;
    else if (action === 'deny') summary.deny += 1;
    else summary.unknown += 1;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'ready_or_partial',
    auditExportPath: toRelativePath(auditExportPath),
    summary,
    rates: toRates(summary),
    distributions: {
      actions: Object.fromEntries([...actions.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      reasons: Object.fromEntries([...reasons.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      gates: Object.fromEntries([...gates.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    },
    parseErrorCount: parseErrors.length,
  };
}

function run() {
  const auditExportPath = toAbsolutePath(
    readArg('--audit-export'),
    'docs/execution/audits/ai-tool-decision-audit-export-v1.ndjson',
  );
  const outputPath = toAbsolutePath(
    readArg('--output'),
    'docs/execution/release-gates/release-evidence/release-evidence-session-sidecar-sandbox-baseline.json',
  );
  const historyPath = toAbsolutePath(
    readArg('--history'),
    'docs/execution/release-gates/release-evidence/release-evidence-session-sidecar-sandbox-baseline.history.ndjson',
  );

  const { rows, parseErrors } = parseAuditRows(auditExportPath);
  const report = buildReport({ auditExportPath, rows, parseErrors });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  appendHistoryRecord(historyPath, report, outputPath);

  const status = report.status;
  const total = report.summary?.total ?? 0;
  process.stdout.write(`[session-sidecar-baseline] ${status} total=${total} parseErrors=${report.parseErrorCount}\n`);
  process.stdout.write(`[session-sidecar-baseline] Wrote: ${toRelativePath(outputPath)}\n`);
  process.stdout.write(`[session-sidecar-baseline] History: ${toRelativePath(historyPath)}\n`);
}

run();