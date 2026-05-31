import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_TURN_VIRTUAL_THRESHOLD,
  AI_CHAT_TURN_ESTIMATE_PX,
} from './aiChatMessageThreadVirtual';
import { shouldVirtualizeAiChatTurns } from './useAiChatMessageThreadVirtualizer';

describe('aiChatMessageThreadVirtual', () => {
  it('uses threshold aligned with G1g spec', () => {
    expect(AI_CHAT_TURN_VIRTUAL_THRESHOLD).toBe(20);
    expect(AI_CHAT_TURN_ESTIMATE_PX).toBeGreaterThan(80);
  });

  it('shouldVirtualizeAiChatTurns is false below threshold', () => {
    expect(shouldVirtualizeAiChatTurns(0)).toBe(false);
    expect(shouldVirtualizeAiChatTurns(AI_CHAT_TURN_VIRTUAL_THRESHOLD - 1)).toBe(false);
    expect(shouldVirtualizeAiChatTurns(AI_CHAT_TURN_VIRTUAL_THRESHOLD)).toBe(true);
  });
});

describe('aiChatMessageThreadVirtual perf note', () => {
  it('records baseline constants for manual perf runs (G1g)', () => {
    expect({
      threshold: AI_CHAT_TURN_VIRTUAL_THRESHOLD,
      estimatePx: AI_CHAT_TURN_ESTIMATE_PX,
      /** At 64 turns only ~viewport window + overscan rows mount (not 64). */
      sampleTurnCount: 64,
    }).toEqual({
      threshold: 20,
      estimatePx: 136,
      sampleTurnCount: 64,
    });
  });
});
