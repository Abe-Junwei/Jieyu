import { describe, expect, it } from 'vitest';
import { mapAuditRowToAiToolDecisionLog, parseAiToolDecision } from './toolDecisionLog';

describe('tool decision log helpers', () => {
  it('parses decision and tool name from compact decision string', () => {
    expect(parseAiToolDecision('confirmed:delete_layer')).toEqual({
      decision: 'confirmed',
      toolName: 'delete_layer',
    });
  });

  it('ignores trailing reason segments and keeps primary decision + tool', () => {
    expect(parseAiToolDecision('confirm_failed:delete_layer:exception')).toEqual({
      decision: 'confirm_failed',
      toolName: 'delete_layer',
      reason: 'exception',
    });
  });

  it('parses auto execution decisions', () => {
    expect(parseAiToolDecision('auto_confirmed:rename_layer')).toEqual({
      decision: 'auto_confirmed',
      toolName: 'rename_layer',
    });
    expect(parseAiToolDecision('auto_failed:rename_layer:no_executor')).toEqual({
      decision: 'auto_failed',
      toolName: 'rename_layer',
      reason: 'no_executor',
    });
  });

  it('maps audit row into ai decision log item', () => {
    const row = {
      id: 'audit-1',
      newValue: 'cancelled:delete_transcription_segment',
      timestamp: '2026-03-18T11:00:00.000Z',
    };

    expect(mapAuditRowToAiToolDecisionLog(row)).toEqual({
      id: 'audit-1',
      decision: 'cancelled',
      toolName: 'delete_transcription_segment',
      timestamp: '2026-03-18T11:00:00.000Z',
    });
  });

  it('maps audit row with reason into ai decision log item', () => {
    const row = {
      id: 'audit-2',
      newValue: 'auto_failed:rename_layer:exception',
      timestamp: '2026-03-18T12:00:00.000Z',
    };

    expect(mapAuditRowToAiToolDecisionLog(row)).toEqual({
      id: 'audit-2',
      decision: 'auto_failed',
      toolName: 'rename_layer',
      reason: 'exception',
      timestamp: '2026-03-18T12:00:00.000Z',
    });
  });

  it('prefers structured metadata for replay-ready decision logs', () => {
    const row = {
      id: 'audit-3',
      newValue: 'auto_failed:rename_layer:exception',
      requestId: 'toolreq_abc123',
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'decision',
        requestId: 'toolreq_abc123',
        toolCall: { name: 'set_transcription_text' },
        outcome: 'auto_confirmed',
      }),
      timestamp: '2026-03-18T13:00:00.000Z',
    };

    expect(mapAuditRowToAiToolDecisionLog(row)).toEqual({
      id: 'audit-3',
      decision: 'auto_confirmed',
      toolName: 'set_transcription_text',
      requestId: 'toolreq_abc123',
      timestamp: '2026-03-18T13:00:00.000Z',
    });
  });

  it('falls back to compact decision string when metadata is malformed', () => {
    const row = {
      id: 'audit-4',
      newValue: 'confirm_failed:delete_layer:duplicate_requestId',
      metadataJson: '{bad json',
      timestamp: '2026-03-18T14:00:00.000Z',
    };

    expect(mapAuditRowToAiToolDecisionLog(row)).toEqual({
      id: 'audit-4',
      decision: 'confirm_failed',
      toolName: 'delete_layer',
      reason: 'duplicate_requestId',
      timestamp: '2026-03-18T14:00:00.000Z',
    });
  });

  it('adds bilingual labels for known policy reason codes', () => {
    const row = {
      id: 'audit-5',
      metadataJson: JSON.stringify({
        phase: 'decision',
        toolCall: { name: 'delete_layer' },
        outcome: 'policy_blocked',
        reason: 'user_directive_deny_destructive',
      }),
      timestamp: '2026-03-18T15:00:00.000Z',
    };
    expect(mapAuditRowToAiToolDecisionLog(row)).toMatchObject({
      id: 'audit-5',
      toolName: 'delete_layer',
      decision: 'policy_blocked',
      reason: 'user_directive_deny_destructive',
      reasonLabelEn: 'Blocked by user safety preference for destructive actions.',
      reasonLabelZh: '已被用户安全偏好阻断高风险破坏性操作',
    });
  });
});
