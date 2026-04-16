// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('audit log indexed query', () => {
  beforeEach(async () => {
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
    await clearAuditLogs();
  });

  it('reads recent ai tool decision logs via [collection+field+timestamp] index', async () => {
    expect(db.audit_logs.schema.idxByName['[collection+field+timestamp]']).toBeDefined();

    const now = Date.now();
    const rows = [
      {
        id: 'audit-1',
        collection: 'ai_messages',
        documentId: 'ast-1',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'pending:delete_layer',
        newValue: 'cancelled:delete_layer',
        source: 'human' as const,
        timestamp: new Date(now - 1000).toISOString(),
      },
      {
        id: 'audit-2',
        collection: 'ai_messages',
        documentId: 'ast-2',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'pending:delete_transcription_segment',
        newValue: 'confirmed:delete_transcription_segment',
        source: 'human' as const,
        timestamp: new Date(now).toISOString(),
      },
      {
        id: 'audit-ignore-1',
        collection: 'units',
        documentId: 'utt-1',
        action: 'update' as const,
        field: 'text',
        oldValue: 'a',
        newValue: 'b',
        source: 'human' as const,
        timestamp: new Date(now + 1000).toISOString(),
      },
    ];

    await db.audit_logs.bulkPut(rows);

    const queried = await db.audit_logs
      .where('[collection+field+timestamp]')
      .between(
        ['ai_messages', 'ai_tool_call_decision', ''],
        ['ai_messages', 'ai_tool_call_decision', '\uffff'],
      )
      .reverse()
      .toArray();

    expect(queried.map((item) => item.id)).toEqual(['audit-2', 'audit-1']);
    expect(queried.every((item) => item.collection === 'ai_messages')).toBe(true);
    expect(queried.every((item) => item.field === 'ai_tool_call_decision')).toBe(true);
  });

  it('reads ai tool decision logs via [collection+field+requestId] index', async () => {
    expect(db.audit_logs.schema.idxByName['[collection+field+requestId]']).toBeDefined();

    await db.audit_logs.bulkPut([
      {
        id: 'audit-req-1',
        collection: 'ai_messages',
        documentId: 'ast-1',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_transcription_text',
        newValue: 'auto_confirmed:set_transcription_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T00:00:00.000Z',
        requestId: 'toolreq_123',
        metadataJson: JSON.stringify({ schemaVersion: 1, phase: 'decision', executed: true }),
      },
      {
        id: 'audit-req-2',
        collection: 'ai_messages',
        documentId: 'ast-2',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_translation_text',
        newValue: 'auto_confirmed:set_translation_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T00:00:01.000Z',
        requestId: 'toolreq_456',
      },
    ]);

    const queried = await db.audit_logs
      .where('[collection+field+requestId]')
      .equals(['ai_messages', 'ai_tool_call_decision', 'toolreq_123'])
      .toArray();

    expect(queried.map((item) => item.id)).toEqual(['audit-req-1']);
    expect(queried[0]?.requestId).toBe('toolreq_123');
  });
});
