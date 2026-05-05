import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

type CitationActionPayload = {
  type: 'note' | 'unit' | 'pdf' | 'schema';
  refId: string;
};

export function useAiChatMessageInteractionController({
  onToggleAiMessagePin,
  onJumpToCitation,
}: {
  onToggleAiMessagePin: ((messageId: string) => void) | undefined;
  onJumpToCitation: ((type: 'note' | 'unit' | 'pdf' | 'schema', refId: string, citation?: { snippet?: string }) => Promise<void> | void) | undefined;
}) {
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [optimisticUnpinnedMessageIds, setOptimisticUnpinnedMessageIds] = useState<Set<string>>(new Set());
  const [optimisticPinnedMessageIds, setOptimisticPinnedMessageIds] = useState<Set<string>>(new Set());
  const copiedMessageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copiedMessageTimerRef.current);
      }
    };
  }, []);

  const toggleMessagePin = useCallback((messageId: string, isPinned: boolean): void => {
    if (!onToggleAiMessagePin) return;
    if (isPinned) {
      setOptimisticPinnedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setOptimisticUnpinnedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    } else {
      setOptimisticUnpinnedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setOptimisticPinnedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    }
    onToggleAiMessagePin(messageId);
  }, [onToggleAiMessagePin]);

  const clearOptimisticPins = useCallback((): void => {
    setOptimisticUnpinnedMessageIds(new Set());
    setOptimisticPinnedMessageIds(new Set());
  }, []);

  const copyAssistantMessage = useCallback((messageId: string, content: string): void => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(content);
    if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(copiedMessageTimerRef.current);
    }
    setCopiedMessageId(messageId);
    if (typeof window !== 'undefined') {
      copiedMessageTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1200);
    }
  }, []);

  const toggleReasoning = useCallback((messageId: string): void => {
    setExpandedReasoningIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const activateCitation = useCallback((citation: CitationActionPayload, rawCitation?: { snippet?: string }): void => {
    if (!onJumpToCitation) return;
    void onJumpToCitation(citation.type, citation.refId, rawCitation);
  }, [onJumpToCitation]);

  return {
    expandedReasoningIds,
    copiedMessageId,
    optimisticUnpinnedMessageIds,
    optimisticPinnedMessageIds,
    setOptimisticUnpinnedMessageIds: setOptimisticUnpinnedMessageIds as Dispatch<SetStateAction<Set<string>>>,
    setOptimisticPinnedMessageIds: setOptimisticPinnedMessageIds as Dispatch<SetStateAction<Set<string>>>,
    clearOptimisticPins,
    toggleMessagePin,
    copyAssistantMessage,
    toggleReasoning,
    activateCitation,
  };
}
