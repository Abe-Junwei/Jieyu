import { useEffect, type RefObject } from 'react';

export function useAiChatAutoScrollController({
  messageViewportRef,
  aiIsStreaming,
  messagesLength,
  streamingThreadScrollSignature,
}: {
  messageViewportRef: RefObject<HTMLDivElement | null>;
  aiIsStreaming: boolean | undefined;
  messagesLength: number;
  streamingThreadScrollSignature: number;
}) {
  useEffect(() => {
    if (messagesLength === 0) return;
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
  }, [aiIsStreaming, messageViewportRef, messagesLength, streamingThreadScrollSignature]);
}
