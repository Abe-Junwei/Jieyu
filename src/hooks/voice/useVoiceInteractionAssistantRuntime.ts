import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useLocale, t } from '../../i18n';
import { useGlobalContext } from '../../services/GlobalContextService';
import { useToast } from '../../contexts/ToastContext';
import {
  isAssistantWebSpeechTtsSupported,
  speakAssistantReplyWithWebSpeechTts,
  stopAssistantWebSpeechTts,
} from '../../utils/assistantWebSpeechTts';
import type { useVoiceAgent } from './useVoiceAgent';

interface VoiceMessageLike {
  role?: string;
  status?: string;
  content?: string;
}

export interface UseVoiceInteractionAssistantRuntimeInput {
  featureVoiceEnabled: boolean;
  aiIsStreaming: boolean;
  aiMessages: VoiceMessageLike[];
  voiceAgent: ReturnType<typeof useVoiceAgent>;
  voiceAgentRef: MutableRefObject<ReturnType<typeof useVoiceAgent> | null>;
  voiceAiAssistantMessageBridgeRef?:
    | MutableRefObject<((assistantMessageId: string, content: string) => void) | null>
    | undefined;
}

export function useVoiceInteractionAssistantRuntime({
  featureVoiceEnabled,
  aiIsStreaming,
  aiMessages,
  voiceAgent,
  voiceAgentRef,
  voiceAiAssistantMessageBridgeRef,
}: UseVoiceInteractionAssistantRuntimeInput) {
  const locale = useLocale();
  const { showToast } = useToast();
  const { profile, updatePreference } = useGlobalContext();
  const assistantTtsEnabled = profile.preferences.assistantTtsEnabled;
  const onSetAssistantTtsEnabled = useCallback(
    (on: boolean) => {
      updatePreference('assistantTtsEnabled', on);
    },
    [updatePreference],
  );
  const assistantTtsSupported = useMemo(() => isAssistantWebSpeechTtsSupported(), []);
  const assistantTtsUnsupportedHintShownRef = useRef(false);

  useEffect(() => {
    if (
      !assistantTtsEnabled ||
      assistantTtsSupported ||
      assistantTtsUnsupportedHintShownRef.current
    )
      return;
    assistantTtsUnsupportedHintShownRef.current = true;
    showToast(
      t(locale, 'transcription.voiceWidget.settings.assistantTtsUnsupported'),
      'warning',
      5000,
    );
  }, [assistantTtsEnabled, assistantTtsSupported, locale, showToast]);

  const prevAiStreamingRef = useRef(false);

  useEffect(() => {
    const ref = voiceAiAssistantMessageBridgeRef;
    if (!ref) return;
    ref.current = (_assistantMessageId, content) => {
      voiceAgentRef.current?.notifyAiStreamFinished?.(content);
      if (
        featureVoiceEnabled &&
        assistantTtsEnabled &&
        assistantTtsSupported &&
        content.trim().length > 0
      ) {
        speakAssistantReplyWithWebSpeechTts(content, locale);
      }
    };
    return () => {
      ref.current = null;
    };
  }, [
    assistantTtsEnabled,
    assistantTtsSupported,
    featureVoiceEnabled,
    locale,
    voiceAgentRef,
    voiceAiAssistantMessageBridgeRef,
  ]);

  useEffect(() => {
    const wasStreaming = prevAiStreamingRef.current;
    const isStreaming = aiIsStreaming;

    if (!wasStreaming && isStreaming) {
      stopAssistantWebSpeechTts();
      voiceAgent.notifyAiStreamStarted?.();
    }

    if (wasStreaming && !isStreaming && !voiceAiAssistantMessageBridgeRef) {
      const latestAssistant = aiMessages.find((m) => m.role === 'assistant' && m.status === 'done');
      voiceAgent.notifyAiStreamFinished?.(latestAssistant?.content);
    }

    prevAiStreamingRef.current = isStreaming;
  }, [aiIsStreaming, aiMessages, voiceAgent, voiceAiAssistantMessageBridgeRef]);

  return {
    assistantTtsEnabled,
    assistantTtsSupported,
    onSetAssistantTtsEnabled,
  };
}
