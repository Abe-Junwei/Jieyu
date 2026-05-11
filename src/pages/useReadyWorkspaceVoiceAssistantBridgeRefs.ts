import { useCallback, useRef, type MutableRefObject } from 'react';

import type { AdoptionItem } from '../ai/vertical/adoptionQueue';

/** Refs + stable flush callback for sidebar / bridge wiring (Toast-sensitive stable identity on flush). */
export function useReadyWorkspaceVoiceAssistantBridgeRefs(): {
  voiceAiAssistantMessageBridgeRef: MutableRefObject<
    ((assistantMessageId: string, content: string) => void) | null
  >;
  adoptionItemsPushSinkRef: MutableRefObject<((items: AdoptionItem[]) => void) | null>;
  flushVoiceAiAssistantMessage: (assistantMessageId: string, content: string) => void;
} {
  const voiceAiAssistantMessageBridgeRef = useRef<
    ((assistantMessageId: string, content: string) => void) | null
  >(null);
  const adoptionItemsPushSinkRef = useRef<((items: AdoptionItem[]) => void) | null>(null);
  const flushVoiceAiAssistantMessage = useCallback(
    (assistantMessageId: string, content: string) => {
      voiceAiAssistantMessageBridgeRef.current?.(assistantMessageId, content);
    },
    [],
  );

  return {
    voiceAiAssistantMessageBridgeRef,
    adoptionItemsPushSinkRef,
    flushVoiceAiAssistantMessage,
  };
}
