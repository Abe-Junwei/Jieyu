// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from './engine';

describe('mcp_tool_call_audits Dexie table (v48)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(async () => {
    // no-op
  });

  it('can insert and retrieve an MCP tool call audit doc', async () => {
    const doc = {
      id: 'mcp_aud_test_001',
      schemaVersion: 1 as const,
      timestamp: new Date().toISOString(),
      jsonRpcId: 7,
      toolName: 'jieyu_list_segments',
      argumentsJson: '{"limit":10}',
      runtimeContextJson: '{"textId":"t-1"}',
      outcome: 'success' as const,
      durationMs: 12,
      toolResultJson: '{"content":[{"type":"text","text":"[]"}]}',
    };

    const jieyuDb = await getDb();
    await jieyuDb.collections.mcp_tool_call_audits.insert(doc);
    const retrieved = await jieyuDb.collections.mcp_tool_call_audits.findOne({ selector: { id: 'mcp_aud_test_001' } }).exec();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.toJSON().toolName).toBe('jieyu_list_segments');
    expect(retrieved!.toJSON().outcome).toBe('success');
    expect(retrieved!.toJSON().argumentsJson).toContain('limit');
  });
});
