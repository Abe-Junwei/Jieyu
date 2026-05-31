import { useEffect, type RefObject } from 'react';

export function useAiChatAutoScrollController({
  messageViewportRef,
  aiIsStreaming,
  messagesLength,
  streamingThreadScrollSignature,
  enabled = true,
}: {
  messageViewportRef: RefObject<HTMLDivElement | null>;
  aiIsStreaming: boolean | undefined;
  messagesLength: number;
  streamingThreadScrollSignature: number;
  /** G1g: virtualized thread handles stick-to-bottom via `useAiChatMessageThreadVirtualizer`. */
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled || messagesLength === 0) return;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    if (typeof window === 'undefined') {
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }

    const stickThresholdPx = 120;
    const rafId = window.requestAnimationFrame(() => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceFromBottom <= stickThresholdPx) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [aiIsStreaming, enabled, messageViewportRef, messagesLength, streamingThreadScrollSignature]);
}
