import { describe, expect, it } from 'vitest';
import {
  buildAiChangeSetFromPendingToolCall,
  validateChangeSetEpoch,
} from './AiChangeSetProtocol';
import type { PendingAiToolCall } from '../chat/chatDomain.types';

function pendingBase(overrides: Partial<PendingAiToolCall> = {}): PendingAiToolCall {
  return {
    call: { name: 'delete_layer', arguments: { layerId: 'L1' } },
    assistantMessageId: 'a1',
    ...overrides,
  };
}

describe('AiChangeSetProtocol', () => {
  it('maps affected ids to change rows and attaches sourceEpoch when captured', () => {
    const cs = buildAiChangeSetFromPendingToolCall(pendingBase({
      readModelEpochCaptured: 7,
      previewContract: { affectedCount: 2, affectedIds: ['u1', 'u2'], reversible: true },
    }));
    expect(cs.sourceEpoch).toBe(7);
    expect(cs.changes).toHaveLength(2);
    expect(cs.changes[0]!.unitId).toBe('u1');
  });

  it('uses a synthetic row when no affected ids', () => {
    const cs = buildAiChangeSetFromPendingToolCall(pendingBase());
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0]!.unitId).toBe('__scope__');
  });

  it('validateChangeSetEpoch skips check when current unset; requires sourceEpoch when current set', () => {
    const cs = buildAiChangeSetFromPendingToolCall(pendingBase({ readModelEpochCaptured: 3 }));
    expect(validateChangeSetEpoch(cs, undefined)).toBe(true);
    expect(validateChangeSetEpoch(cs, 3)).toBe(true);
    expect(validateChangeSetEpoch(cs, 4)).toBe(false);
    const csNoSourceEpoch = buildAiChangeSetFromPendingToolCall(pendingBase());
    expect(validateChangeSetEpoch(csNoSourceEpoch, 1)).toBe(false);
  });

  it('builds change rows from propose_changes pending children', () => {
    const cs = buildAiChangeSetFromPendingToolCall({
      call: {
        name: 'propose_changes',
        arguments: { description: 'Two edits', sourceEpoch: 9 },
      },
      proposedChildCalls: [
        { name: 'set_transcription_text', arguments: { utteranceId: 'seg-1', text: 'hello' } },
        { name: 'undo', arguments: {} },
      ],
      assistantMessageId: 'a1',
      readModelEpochCaptured: 2,
    });
    expect(cs.description).toBe('Two edits');
    expect(cs.sourceEpoch).toBe(9);
    expect(cs.changes).toHaveLength(2);
    expect(cs.changes[0]!.unitId).toBe('seg-1');
    expect(cs.changes[0]!.field).toBe('set_transcription_text');
    expect(cs.changes[1]!.unitId).toBe('step-2');
  });
});
