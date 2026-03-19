// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';

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
        collection: 'utterances',
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
});
