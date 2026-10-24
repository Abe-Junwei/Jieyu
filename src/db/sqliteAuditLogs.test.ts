import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqliteStoragePort } from './sqliteStoragePort';
import type { AuditLogDocType } from './types';

const NOW = '2026-10-24T00:00:00.000Z';
const roots: string[] = [];

function tempFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-audit-'));
  roots.push(root);
  return join(root, 'user-data.sqlite');
}

function audit(id: string, extra: Partial<AuditLogDocType> = {}): AuditLogDocType {
  return {
    id,
    collection: 'ai_messages',
    documentId: `doc-${id}`,
    action: 'update',
    source: 'ai',
    timestamp: NOW,
    ...extra,
  };
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite audit log lists', () => {
  it('lists one collection after reopen and keeps the id order', async () => {
    const file = tempFile();
    const first = openSqliteStoragePort(file);
    const early = audit('audit-b', { requestId: 'req-b', metadataJson: '{"phase":"decision"}' });
    const late = audit('audit-a', { collection: 'speakers' });
    try {
      await first.port.audit.insertAuditLog(early);
      await first.port.audit.insertAuditLog(late);
      await expect(first.port.listAuditLogsByCollection('  ai_messages  ')).resolves.toEqual([
        early,
      ]);
      await expect(first.port.listAuditLogsByCollection('  ')).resolves.toEqual([]);
      await expect(first.port.listAuditLogsByCollection('missing')).resolves.toEqual([]);
    } finally {
      first.close();
    }
    const second = openSqliteStoragePort(file);
    try {
      await expect(second.port.listAuditLogsByCollection('ai_messages')).resolves.toEqual([early]);
      await expect(second.port.listAuditLogsByCollection('speakers')).resolves.toEqual([late]);
    } finally {
      second.close();
    }
  });

  it('lists one field request and skips a row that has no request id', async () => {
    const file = tempFile();
    const opened = openSqliteStoragePort(file);
    const matched = audit('audit-match', {
      field: 'ai_tool_call_decision',
      requestId: 'req-1',
      newValue: 'allow::',
    });
    const otherField = audit('audit-field', {
      field: 'ai_adoption_outcome',
      requestId: 'req-1',
    });
    const noRequest = audit('audit-none', { field: 'ai_tool_call_decision' });
    try {
      await opened.port.audit.insertAuditLog(matched);
      await opened.port.audit.insertAuditLog(otherField);
      await opened.port.audit.insertAuditLog(noRequest);
      await expect(
        opened.port.listAuditLogsByFieldRequest(
          'ai_messages',
          '  ai_tool_call_decision  ',
          'req-1',
        ),
      ).resolves.toEqual([matched]);
      await expect(
        opened.port.listAuditLogsByFieldRequest('ai_messages', 'ai_tool_call_decision', '  '),
      ).resolves.toEqual([]);
    } finally {
      opened.close();
    }
  });

  it('rejects a payload whose filter field is not text and still skips a blank query', async () => {
    const file = tempFile();
    const opened = openSqliteStoragePort(file);
    try {
      await opened.port.audit.insertAuditLog(
        audit('audit-bad', { field: 'ai_tool_call_decision' }),
      );
    } finally {
      opened.close();
    }
    const db = new Database(file);
    db.prepare('UPDATE audit_logs SET payload_json = ? WHERE id = ?').run(
      '{"id":"audit-bad","collection":"ai_messages","field":1,"requestId":"req-1"}',
      'audit-bad',
    );
    db.close();
    const again = openSqliteStoragePort(file);
    try {
      await expect(again.port.listAuditLogsByCollection('  ')).resolves.toEqual([]);
      await expect(again.port.listAuditLogsByCollection('ai_messages')).resolves.toEqual([
        {
          id: 'audit-bad',
          collection: 'ai_messages',
          field: 1,
          requestId: 'req-1',
        },
      ]);
      await expect(
        again.port.listAuditLogsByFieldRequest('ai_messages', 'ai_tool_call_decision', 'req-1'),
      ).rejects.toThrow('audit row is incomplete');
    } finally {
      again.close();
    }
  });
});
