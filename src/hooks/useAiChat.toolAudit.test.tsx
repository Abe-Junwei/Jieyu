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

  it('returns false for propose_changes partial-failure audit when metadata.executed is false (retry same parent requestId)', async () => {
    await db.audit_logs.put({
      id: 'audit-propose-partial',
      collection: 'ai_messages',
      documentId: 'assistant-propose-1',
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue: 'pending:propose_changes',
      newValue: 'confirm_failed:propose_changes:child_failed',
      source: 'human',
      timestamp: NOW,
      requestId: 'req-parent-propose',
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'decision',
        outcome: 'confirm_failed',
        executed: false,
        reason: 'child_failed',
        executionProgress: { appliedCount: 1, totalCount: 2, partial: true },
      }),
    });

    const { result } = renderHook(() => useAiChatToolAudit());

    await expect(result.current.hasPersistedExecutionForRequest('req-parent-propose')).resolves.toBe(false);
  });

  it('compact newValue without metadata still treats propose_changes child_failed as persisted (legacy)', async () => {
    await db.audit_logs.put({
      id: 'audit-propose-legacy',
      collection: 'ai_messages',
      documentId: 'assistant-propose-legacy',
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue: 'pending:propose_changes',
      newValue: 'confirm_failed:propose_changes:child_failed',
      source: 'human',
      timestamp: NOW,
      requestId: 'req-legacy-compact',
    });

    const { result } = renderHook(() => useAiChatToolAudit());

    await expect(result.current.hasPersistedExecutionForRequest('req-legacy-compact')).resolves.toBe(true);
  });
});
