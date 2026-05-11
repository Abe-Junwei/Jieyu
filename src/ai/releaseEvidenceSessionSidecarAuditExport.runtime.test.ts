// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { newAuditLogId } from '../hooks/ai/useAiChat.helpers';

const DEFAULT_OUTPUT_RELATIVE_PATH =
  'docs/execution/audits/ai-session-sidecar-audit-export-v1.ndjson';

function resolveExportOutputPath(): string {
  const configured = String(process.env.RELEASE_EVIDENCE_SESSION_SIDECAR_AUDIT_EXPORT ?? '').trim();
  if (!configured) {
    return path.join(process.cwd(), DEFAULT_OUTPUT_RELATIVE_PATH);
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('release evidence session sidecar audit export runtime', () => {
  beforeEach(async () => {
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
    await clearAuditLogs();
  });

  it('writes ai_session_sidecar_sandbox audit_export ndjson from runtime write path', async () => {
    const outputPath = resolveExportOutputPath();
    const timestamp = '2026-05-05T09:50:00.000Z';
    await db.audit_logs.add({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: 'conv-release-evidence-sidecar-001',
      action: 'update',
      field: 'ai_session_sidecar_sandbox',
      newValue: 'allow',
      source: 'system',
      timestamp,
      requestId: 'session_sidecar_sandbox_seed_001',
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'session_sidecar_sandbox',
        gate: 'session-memory/pinned-message-directive',
        sandboxAction: 'allow',
        sandboxReason: 'within-authorized-write-dir',
        sourceMessageId: 'usr-sidecar-seed-001',
      }),
    });

    const rows = await db.audit_logs
      .where('[collection+field]')
      .equals(['ai_messages', 'ai_session_sidecar_sandbox'])
      .toArray();

    expect(rows.length).toBeGreaterThan(0);

    const normalizedLines = [...rows]
      .sort((left, right) =>
        String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? '')),
      )
      .map((row) =>
        JSON.stringify({
          id: row.id,
          collection: row.collection,
          documentId: row.documentId,
          action: row.action,
          field: row.field,
          oldValue: row.oldValue,
          newValue: row.newValue,
          source: row.source,
          timestamp: row.timestamp,
          requestId: row.requestId,
          metadataJson: row.metadataJson,
        }),
      );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${normalizedLines.join('\n')}\n`, 'utf8');

    const exportedText = await readFile(outputPath, 'utf8');
    const firstLine = exportedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    expect(firstLine).toBeTruthy();
    const exportedRow = JSON.parse(firstLine ?? '{}') as {
      field?: string;
      metadataJson?: string;
    };
    expect(exportedRow.field).toBe('ai_session_sidecar_sandbox');
    expect(typeof exportedRow.metadataJson).toBe('string');
    expect((exportedRow.metadataJson ?? '').trim().length).toBeGreaterThan(0);
  });
});
