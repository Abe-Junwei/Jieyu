// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { db } from '../db';
import { useAiChatToolAudit } from './useAiChat.toolAudit';

const NOW = new Date().toISOString();

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('useAiChatToolAudit', () => {
  beforeEach(async () => {
    await clearAuditLogs();
  });

  afterEach(async () => {
    await clearAuditLogs();
  });

  it('treats structured decision metadata as authoritative for executed=false', async () => {
    await db.audit_logs.put({
      id: 'audit-1',
      collection: 'ai_messages',
      documentId: 'assistant-1',
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue: 'pending:propose_changes',
      newValue: 'confirm_failed:propose_changes:invalid_child_args',
      source: 'human',
      timestamp: NOW,
      requestId: 'req-1',
      metadataJson: JSON.stringify({ phase: 'decision', executed: false }),
    });

    const { result } = renderHook(() => useAiChatToolAudit());

    await expect(result.current.hasPersistedExecutionForRequest('req-1')).resolves.toBe(false);
  });

  it('returns true when structured decision metadata says executed=true', async () => {
    await db.audit_logs.put({
      id: 'audit-2',
      collection: 'ai_messages',
      documentId: 'assistant-1',
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue: 'pending:delete_layer',
      newValue: 'confirmed:delete_layer',
      source: 'human',
      timestamp: NOW,
      requestId: 'req-2',
      metadataJson: JSON.stringify({ phase: 'decision', executed: true }),
    });

    const { result } = renderHook(() => useAiChatToolAudit());

    await expect(result.current.hasPersistedExecutionForRequest('req-2')).resolves.toBe(true);
  });
});
