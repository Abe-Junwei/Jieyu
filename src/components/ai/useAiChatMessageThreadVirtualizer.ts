import { useEffect, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AI_CHAT_STICK_TO_BOTTOM_THRESHOLD_PX,
  AI_CHAT_TURN_ESTIMATE_PX,
  AI_CHAT_TURN_VIRTUAL_OVERSCAN,
  AI_CHAT_TURN_VIRTUAL_THRESHOLD,
} from './aiChatMessageThreadVirtual';
import type { AiChatTurnRowData } from './AiChatTurnRow';

export function shouldVirtualizeAiChatTurns(turnCount: number): boolean {
  return turnCount >= AI_CHAT_TURN_VIRTUAL_THRESHOLD;
}

export function useAiChatMessageThreadVirtualizer({
  enabled,
  turns,
  messageViewportRef,
  messagesLength,
  streamingThreadScrollSignature,
  aiIsStreaming,
}: {
  enabled: boolean;
  turns: readonly AiChatTurnRowData[];
  messageViewportRef: RefObject<HTMLDivElement | null>;
  messagesLength: number;
  streamingThreadScrollSignature: number;
  aiIsStreaming: boolean | undefined;
}) {
  const turnVirtualizer = useVirtualizer({
    count: enabled ? turns.length : 0,
    getScrollElement: () => messageViewportRef.current,
    estimateSize: () => AI_CHAT_TURN_ESTIMATE_PX,
    overscan: AI_CHAT_TURN_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const turn = turns[index];
      if (!turn) return String(index);
      return `${turn.user?.id ?? 'nu'}-${turn.assistant?.id ?? 'na'}`;
    },
  });

  const turnVirtualizerRef = useRef(turnVirtualizer);
  turnVirtualizerRef.current = turnVirtualizer;

  const turnsHeadKey = turns[0]?.user?.id ?? turns[0]?.assistant?.id ?? `len-${turns.length}`;

  useEffect(() => {
    if (!enabled || turns.length === 0) return;
    turnVirtualizerRef.current.scrollToIndex(turns.length - 1, { align: 'end' });
  }, [enabled, turnsHeadKey, turns.length]);

  useEffect(() => {
    if (!enabled || messagesLength === 0) return;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    if (typeof window === 'undefined') {
      turnVirtualizerRef.current.scrollToIndex(turns.length - 1, { align: 'end' });
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceFromBottom <= AI_CHAT_STICK_TO_BOTTOM_THRESHOLD_PX) {
        turnVirtualizerRef.current.scrollToIndex(turns.length - 1, { align: 'end' });
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [
    aiIsStreaming,
    enabled,
    messageViewportRef,
    messagesLength,
    streamingThreadScrollSignature,
    turns.length,
  ]);

  return { turnVirtualizer, enabled };
}
