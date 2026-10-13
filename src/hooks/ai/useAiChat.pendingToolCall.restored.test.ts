import { describe, expect, it } from 'vitest';
import type { PendingAiToolCall } from '../../ai/chat/chatDomain.types';
import { isRestoredV2Card } from './useAiChat.pendingToolCall';

describe('S4: restored v2 cards are identified by the explicit flag', () => {
  const base = {
    call: { name: 'delete_transcription_segment', arguments: {} },
    runtimeV2: { conversationId: 'c', approvalId: 'a' },
  } as unknown as PendingAiToolCall;

  it('an epochless in-page v2 card is not treated as restored', () => {
    expect(isRestoredV2Card(base)).toBe(false);
  });

  it('a card restored from Dexie is', () => {
    expect(isRestoredV2Card({ ...base, restored: true })).toBe(true);
  });
});
