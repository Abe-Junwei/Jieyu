import { useCallback, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { getAiChatCardMessages } from '../../i18n/messages';
import { classifyRecommendationAdoption } from './aiChatCardFollowUps';

type ExposedRecommendation = {
  prompt: string;
  source: 'fallback' | 'llm';
  signature: string;
};

type RecommendationAdoptionEvent = {
  type: 'accepted_exact' | 'accepted_edited';
  source: 'fallback' | 'llm';
  prompt: string;
  signature: string;
  timestamp: string;
};

type TopHybridRecommendation = {
  prompt: string;
};

export function useAiChatComposerActions({
  chatInput,
  setChatInput,
  chatInputRef,
  onSendAiMessage,
  aiIsStreaming,
  sharedDialogueComposerBlocked,
  inputBlockedReason,
  cardMessages,
  showTransientBlockedReason,
  setShowAlertBar,
  exposedRecommendationRef,
  onTrackAiRecommendationEvent,
  setDismissedRecommendationSignature,
  topHybridRecommendation,
  showInlineRecommendation,
  hybridInputSignature,
}: {
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  chatInputRef: RefObject<HTMLInputElement | null>;
  onSendAiMessage: ((text: string) => void | Promise<void>) | undefined;
  aiIsStreaming: boolean | undefined;
  sharedDialogueComposerBlocked: boolean;
  inputBlockedReason: string | null;
  cardMessages: ReturnType<typeof getAiChatCardMessages>;
  showTransientBlockedReason: (reason: string) => void;
  setShowAlertBar: Dispatch<SetStateAction<boolean>>;
  exposedRecommendationRef: MutableRefObject<ExposedRecommendation | null>;
  onTrackAiRecommendationEvent: ((event: RecommendationAdoptionEvent) => void) | undefined;
  setDismissedRecommendationSignature: Dispatch<SetStateAction<string | null>>;
  topHybridRecommendation: TopHybridRecommendation | undefined;
  showInlineRecommendation: boolean;
  hybridInputSignature: string;
}) {
  const submitChatInput = useCallback((): void => {
    const text = chatInput.trim();
    if (!text) return;
    if (!onSendAiMessage) {
      showTransientBlockedReason(cardMessages.chatNotReady);
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(cardMessages.previousReplyStreaming);
      return;
    }
    if (sharedDialogueComposerBlocked) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? cardMessages.pendingActionBeforeSend);
      return;
    }
    const exposedRecommendation = exposedRecommendationRef.current;
    if (exposedRecommendation && onTrackAiRecommendationEvent) {
      const adoptionType = classifyRecommendationAdoption(text, exposedRecommendation.prompt);
      if (adoptionType) {
        onTrackAiRecommendationEvent({
          type: adoptionType,
          source: exposedRecommendation.source,
          prompt: exposedRecommendation.prompt,
          signature: exposedRecommendation.signature,
          timestamp: new Date().toISOString(),
        });
      }
    }
    exposedRecommendationRef.current = null;
    void onSendAiMessage(text);
    setChatInput('');
    setDismissedRecommendationSignature(null);
  }, [
    aiIsStreaming,
    cardMessages.chatNotReady,
    cardMessages.pendingActionBeforeSend,
    cardMessages.previousReplyStreaming,
    chatInput,
    exposedRecommendationRef,
    inputBlockedReason,
    onSendAiMessage,
    onTrackAiRecommendationEvent,
    setChatInput,
    setDismissedRecommendationSignature,
    setShowAlertBar,
    sharedDialogueComposerBlocked,
    showTransientBlockedReason,
  ]);

  const submitFollowUpPrompt = useCallback((prompt: string): void => {
    const normalized = prompt.trim();
    if (!normalized) return;
    if (!onSendAiMessage) {
      showTransientBlockedReason(cardMessages.chatNotReady);
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(cardMessages.previousReplyStreaming);
      return;
    }
    if (sharedDialogueComposerBlocked) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? cardMessages.pendingActionBeforeSend);
      return;
    }
    exposedRecommendationRef.current = null;
    void onSendAiMessage(normalized);
    setChatInput('');
    setDismissedRecommendationSignature(null);
  }, [
    aiIsStreaming,
    cardMessages.chatNotReady,
    cardMessages.pendingActionBeforeSend,
    cardMessages.previousReplyStreaming,
    exposedRecommendationRef,
    inputBlockedReason,
    onSendAiMessage,
    setChatInput,
    setDismissedRecommendationSignature,
    setShowAlertBar,
    sharedDialogueComposerBlocked,
    showTransientBlockedReason,
  ]);

  const applyInlineRecommendation = useCallback((): void => {
    if (!topHybridRecommendation) return;
    setChatInput(topHybridRecommendation.prompt);
    setDismissedRecommendationSignature(null);
    const input = chatInputRef.current;
    if (!input) return;
    if (typeof window === 'undefined') {
      input.focus();
      return;
    }
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, [chatInputRef, setChatInput, setDismissedRecommendationSignature, topHybridRecommendation]);

  const handleComposerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>): void => {
    const native = event.nativeEvent as globalThis.KeyboardEvent;
    if (native.isComposing || native.keyCode === 229) return;

    if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && showInlineRecommendation && (event.key === 'ArrowRight' || event.key === 'Tab')) {
      const input = chatInputRef.current;
      const caretAtStart = !input || ((input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0);
      if (caretAtStart) {
        event.preventDefault();
        applyInlineRecommendation();
        return;
      }
    }

    if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && showInlineRecommendation && event.key === 'Escape') {
      event.preventDefault();
      setDismissedRecommendationSignature(hybridInputSignature);
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    submitChatInput();
  }, [
    applyInlineRecommendation,
    chatInputRef,
    hybridInputSignature,
    setDismissedRecommendationSignature,
    showInlineRecommendation,
    submitChatInput,
  ]);

  return {
    submitChatInput,
    submitFollowUpPrompt,
    applyInlineRecommendation,
    handleComposerKeyDown,
  };
}