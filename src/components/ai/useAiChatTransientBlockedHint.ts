import { useCallback, useEffect, useRef, useState } from 'react';

export function useAiChatTransientBlockedHint(aiIsStreaming: boolean | undefined) {
  const [transientBlockedReason, setTransientBlockedReason] = useState<string | null>(null);
  const blockedHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(blockedHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (aiIsStreaming) return;
    setTransientBlockedReason(null);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
      blockedHintTimerRef.current = null;
    }
  }, [aiIsStreaming]);

  const showTransientBlockedReason = useCallback((reason: string): void => {
    setTransientBlockedReason(reason);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      blockedHintTimerRef.current = window.setTimeout(() => {
        setTransientBlockedReason(null);
        blockedHintTimerRef.current = null;
      }, 1800);
    }
  }, []);

  return {
    transientBlockedReason,
    showTransientBlockedReason,
  };
}