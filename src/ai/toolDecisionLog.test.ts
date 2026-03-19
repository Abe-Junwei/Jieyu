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
});
