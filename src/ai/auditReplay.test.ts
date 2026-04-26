// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { buildAiToolGoldenSnapshot, diffAiToolSnapshot, listRecentAiToolDecisionLogs, loadAiToolReplayBundle, serializeAiToolGoldenSnapshot } from './auditReplay';

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('audit replay helpers', () => {
  beforeEach(async () => {
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
    await clearAuditLogs();
  });

  it('loads a replay bundle by requestId from structured audit metadata', async () => {
    await db.audit_logs.bulkPut([
      {
        id: 'intent-1',
        collection: 'ai_messages',
        documentId: 'msg-1',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute', confidence: 0.98 }),
        source: 'ai' as const,
        timestamp: '2026-03-21T10:00:00.000Z',
        requestId: 'toolreq_bundle_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          requestId: 'toolreq_bundle_1',
          assistantMessageId: 'assistant-1',
          toolCall: {
            name: 'set_transcription_text',
            arguments: { unitId: 'u1', text: 'hello' },
            requestId: 'toolreq_bundle_1',
          },
          context: { userText: '把这句改成 hello', providerId: 'mock' },
        }),
      },
      {
        id: 'decision-1',
        collection: 'ai_messages',
        documentId: 'msg-1',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_transcription_text',
        newValue: 'auto_confirmed:set_transcription_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T10:00:01.000Z',
        requestId: 'toolreq_bundle_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          requestId: 'toolreq_bundle_1',
          assistantMessageId: 'assistant-1',
          source: 'ai',
          toolCall: {
            name: 'set_transcription_text',
            arguments: { unitId: 'u1', text: 'hello' },
            requestId: 'toolreq_bundle_1',
          },
          context: { userText: '把这句改成 hello', providerId: 'mock' },
          executed: true,
          outcome: 'auto_confirmed',
          message: '已写入。',
        }),
      },
    ]);

    const bundle = await loadAiToolReplayBundle('toolreq_bundle_1');

    expect(bundle).not.toBeNull();
    expect(bundle?.requestId).toBe('toolreq_bundle_1');
    expect(bundle?.toolName).toBe('set_transcription_text');
    expect(bundle?.replayable).toBe(true);
    expect(bundle?.toolCall?.arguments).toEqual({ unitId: 'u1', text: 'hello' });
    expect(bundle?.context).toEqual({ userText: '把这句改成 hello', providerId: 'mock' });
    expect(bundle?.intentAssessment).toEqual({ decision: 'execute', confidence: 0.98 });
    expect(bundle?.latestDecision?.decision).toBe('auto_confirmed');
    expect(bundle?.latestDecision?.executed).toBe(true);
    expect(bundle?.latestDecision?.message).toBe('已写入。');
  });

  it('falls back to compact decision rows when structured metadata is unavailable', async () => {
    await db.audit_logs.put({
      id: 'decision-legacy-1',
      collection: 'ai_messages',
      documentId: 'msg-2',
      action: 'update' as const,
      field: 'ai_tool_call_decision',
      oldValue: 'pending:delete_layer',
      newValue: 'confirm_failed:delete_layer:duplicate_requestId',
      source: 'human' as const,
      timestamp: '2026-03-21T11:00:00.000Z',
      requestId: 'toolreq_legacy_1',
    });

    const bundle = await loadAiToolReplayBundle('toolreq_legacy_1');

    expect(bundle).not.toBeNull();
    expect(bundle?.toolName).toBe('delete_layer');
    expect(bundle?.replayable).toBe(false);
    expect(bundle?.latestDecision?.decision).toBe('confirm_failed');
    expect(bundle?.latestDecision?.reason).toBe('duplicate_requestId');
  });

  it('lists recent ai tool decision logs via the shared helper', async () => {
    await db.audit_logs.bulkPut([
      {
        id: 'decision-list-1',
        collection: 'ai_messages',
        documentId: 'msg-3',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_transcription_text',
        newValue: 'auto_confirmed:set_transcription_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T12:00:00.000Z',
        requestId: 'toolreq_list_1',
      },
      {
        id: 'decision-list-2',
        collection: 'ai_messages',
        documentId: 'msg-4',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'pending:delete_layer',
        newValue: 'cancelled:delete_layer',
        source: 'human' as const,
        timestamp: '2026-03-21T12:00:01.000Z',
        requestId: 'toolreq_list_2',
      },
    ]);

    const logs = await listRecentAiToolDecisionLogs(2);

    expect(logs).toEqual([
      {
        id: 'decision-list-2',
        decision: 'cancelled',
        toolName: 'delete_layer',
        requestId: 'toolreq_list_2',
        timestamp: '2026-03-21T12:00:01.000Z',
      },
      {
        id: 'decision-list-1',
        decision: 'auto_confirmed',
        toolName: 'set_transcription_text',
        requestId: 'toolreq_list_1',
        timestamp: '2026-03-21T12:00:00.000Z',
      },
    ]);
  });

  it('builds and serializes golden snapshots from replay bundles', async () => {
    await db.audit_logs.bulkPut([
      {
        id: 'intent-export-1',
        collection: 'ai_messages',
        documentId: 'msg-export',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute' }),
        source: 'ai' as const,
        timestamp: '2026-03-21T13:00:00.000Z',
        requestId: 'toolreq_export_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          requestId: 'toolreq_export_1',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
          context: { userText: '补一条翻译' },
        }),
      },
      {
        id: 'decision-export-1',
        collection: 'ai_messages',
        documentId: 'msg-export',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_translation_text',
        newValue: 'auto_confirmed:set_translation_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T13:00:01.000Z',
        requestId: 'toolreq_export_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          requestId: 'toolreq_export_1',
          source: 'ai',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
          context: { userText: '补一条翻译' },
          executed: true,
          outcome: 'auto_confirmed',
          message: '已写入翻译。',
          reason: 'user_directive_confirmation_required',
        }),
      },
    ]);

    const bundle = await loadAiToolReplayBundle('toolreq_export_1');
    expect(bundle).not.toBeNull();

    const snapshot = buildAiToolGoldenSnapshot(bundle!);
    expect(snapshot.requestId).toBe('toolreq_export_1');
    expect(snapshot.toolName).toBe('set_translation_text');
    expect(snapshot.latestDecision?.decision).toBe('auto_confirmed');
    expect(snapshot.latestDecision?.reasonLabelEn).toBe('User preference requires confirmation before execution.');
    expect(snapshot.latestDecision?.reasonLabelZh).toBe('用户偏好要求先确认再执行');
    expect(snapshot.decisions[0]?.reasonLabelEn).toBe('User preference requires confirmation before execution.');

    const serialized = serializeAiToolGoldenSnapshot(bundle!);
    expect(JSON.parse(serialized)).toMatchObject({
      schemaVersion: 1,
      requestId: 'toolreq_export_1',
      toolName: 'set_translation_text',
      latestDecision: {
        reasonLabelEn: 'User preference requires confirmation before execution.',
      },
    });
  });

  it('diffAiToolSnapshot: 与自身重建的 bundle 对比 matches=true | matches=true when diffed against self-rehydrated bundle', async () => {
    await db.audit_logs.bulkPut([
      {
        id: 'intent-diff-1',
        collection: 'ai_messages',
        documentId: 'msg-diff',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute' }),
        source: 'ai' as const,
        timestamp: '2026-03-21T14:00:00.000Z',
        requestId: 'toolreq_diff_1',
        metadataJson: JSON.stringify({
          phase: 'intent',
          requestId: 'toolreq_diff_1',
          toolCall: { name: 'delete_transcription_segment', arguments: { segmentId: 'seg_x1' } },
          context: { userText: '删掉' },
        }),
      },
      {
        id: 'decision-diff-1',
        collection: 'ai_messages',
        documentId: 'msg-diff',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: '',
        newValue: 'confirmed:delete_transcription_segment',
        source: 'ai' as const,
        timestamp: '2026-03-21T14:00:01.000Z',
        requestId: 'toolreq_diff_1',
        metadataJson: JSON.stringify({
          phase: 'decision',
          requestId: 'toolreq_diff_1',
          toolCall: { name: 'delete_transcription_segment', arguments: { segmentId: 'seg_x1' } },
          context: { userText: '删掉' },
          executed: true,
          outcome: 'confirmed',
        }),
      },
    ]);

    const bundle = await loadAiToolReplayBundle('toolreq_diff_1');
    expect(bundle).not.toBeNull();

    const snapshot = buildAiToolGoldenSnapshot(bundle!);
    const diff = diffAiToolSnapshot(snapshot, bundle!);

    expect(diff.matches).toBe(true);
    const changed = diff.fields.filter((f) => f.changed);
    expect(changed).toHaveLength(0);
  });

  it('diffAiToolSnapshot: toolName 或 decision 变化时报告 changed 字段 | reports changed fields when toolName or decision differs', async () => {
    await db.audit_logs.put({
      id: 'decision-drift-1',
      collection: 'ai_messages',
      documentId: 'msg-drift',
      action: 'update' as const,
      field: 'ai_tool_call_decision',
      oldValue: '',
      newValue: 'cancelled:delete_layer',
      source: 'ai' as const,
      timestamp: '2026-03-21T15:00:00.000Z',
      requestId: 'toolreq_drift_1',
    });

    const bundle = await loadAiToolReplayBundle('toolreq_drift_1');
    expect(bundle).not.toBeNull();

    // 基准快照：手工构造一个 toolName 不同的快照 | Baseline: manually craft a snapshot with different toolName
    const baselineSnapshot = buildAiToolGoldenSnapshot(bundle!);
    const alteredBaseline = { ...baselineSnapshot, toolName: 'set_transcription_text', decisions: [{ ...baselineSnapshot.decisions[0]!, decision: 'confirmed' }], ...(baselineSnapshot.latestDecision ? { latestDecision: { ...baselineSnapshot.latestDecision, decision: 'confirmed' } } : {}) };

    const diff = diffAiToolSnapshot(alteredBaseline, bundle!);

    expect(diff.matches).toBe(false);
    const changedLabels = diff.fields.filter((f) => f.changed).map((f) => f.label);
    expect(changedLabels).toContain('toolName');
    expect(changedLabels).toContain('latestDecision.decision');
  });
});