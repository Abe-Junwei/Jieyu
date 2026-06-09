import { useId, useMemo, useRef, useState } from 'react';
import { normalizeLocale, t, type Locale } from '../i18n';
import { getAiChatCardMessages } from '../i18n/messages';
import {
  aiChatProviderDefinitions,
  getAiChatProviderDefinition,
  type AiChatProviderKind,
} from '../ai/providers/providerCatalog';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../hooks/ai/useAiAssistantHubContextValue';
import { pickVoiceAgentContextValue } from '../hooks/voice/useVoiceAgentContextValue';
import { resolveAiChatConversationTitle } from '../hooks/ai/aiChatConversationTitle';
import { useTranscriptionChatWindowLayout } from './useTranscriptionChatWindowLayout';

/** Stable hub branch when the voice agent UI is dormant (avoids an extra `useMemo` for architecture guard ceilings). */
const DORMANT_VOICE_CONTEXT_FOR_CHAT_WINDOW = pickVoiceAgentContextValue(
  DEFAULT_VOICE_AGENT_CONTEXT_VALUE,
);

export interface UseTranscriptionChatWindowControllerInput {
  locale: string;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
}

export function useTranscriptionChatWindowController({
  locale,
  assistantRuntimeProps,
}: UseTranscriptionChatWindowControllerInput) {
  const uiLocale: Locale = normalizeLocale(locale) ?? 'zh-CN';
  const isZh = uiLocale === 'zh-CN';
  const aiChatState = assistantRuntimeProps.aiChatContextValue;
  const [providerConfigOpen, setProviderConfigOpen] = useState(false);
  const [conversationListOpen, setConversationListOpen] = useState(false);
  const floatingTitleButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogId = useId();
  const windowTitleId = `${dialogId}-title`;

  const layout = useTranscriptionChatWindowLayout({
    uiLocale,
    aiIsStreaming: aiChatState.aiIsStreaming ?? false,
    onSendAiMessage: aiChatState.onSendAiMessage,
  });

  const conversationManagement =
    aiChatState.aiConversationManagement?.enabled === true
      ? aiChatState.aiConversationManagement
      : null;
  const conversationManagementEnabled = conversationManagement !== null;
  const chatTitle = useMemo(
    () =>
      resolveAiChatConversationTitle(
        uiLocale,
        conversationManagement,
        aiChatState.aiConversationId,
        aiChatState.aiMessages ?? [],
      ),
    [aiChatState.aiConversationId, aiChatState.aiMessages, conversationManagement, uiLocale],
  );
  const title = chatTitle;
  const conversationListGroupLabel = t(uiLocale, 'ai.chat.conversationList.groupCurrentText');
  const archivedConversationListGroupLabel = t(uiLocale, 'ai.chat.conversationList.archivedGroup');
  const aiAssistantHubContextValue = useMemo(
    () => pickAiAssistantHubContextValue(aiChatState, DORMANT_VOICE_CONTEXT_FOR_CHAT_WINDOW),
    [aiChatState],
  );
  const providerKind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
  const pinnedCount = aiChatState.aiSessionMemory?.pinnedMessageIds?.length ?? 0;
  const connectionStatus = aiChatState.aiConnectionTestStatus ?? 'idle';
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
  const toolFeedbackStyleResolved: 'concise' | 'detailed' =
    aiChatState.aiChatSettings?.toolFeedbackStyle === 'concise' ? 'concise' : 'detailed';
  const activeProviderDefinition = aiChatState.aiChatSettings
    ? getAiChatProviderDefinition(aiChatState.aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');
  const providerStatusLabel = useMemo(() => {
    const kind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
    return cardMessages.providerStatusLabel(kind, aiChatState.aiConnectionTestStatus);
  }, [aiChatState.aiChatSettings?.providerKind, aiChatState.aiConnectionTestStatus, cardMessages]);
  const providerStatusTone = useMemo(() => {
    const kind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
    if (aiChatState.aiConnectionTestStatus === 'error') return 'error';
    if (aiChatState.aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama' || kind === 'webllm') return 'local';
    return 'idle';
  }, [aiChatState.aiChatSettings?.providerKind, aiChatState.aiConnectionTestStatus]);
  const providerGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = [
      'deepseek',
      'qwen',
      'anthropic',
      'gemini',
      'ollama',
      'minimax',
    ];
    const compatibleKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'webllm', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((provider) => [provider.kind, provider]));
    const pick = (kinds: AiChatProviderKind[]) =>
      kinds
        .map((kind) => byKind.get(kind))
        .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));
    return [
      { label: cardMessages.providerGroupOfficial, items: pick(directKinds) },
      { label: cardMessages.providerGroupCompatible, items: pick(compatibleKinds) },
      { label: cardMessages.providerGroupLocalCustom, items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, [cardMessages]);

  const toggleConversationList = () => {
    setConversationListOpen((prev) => {
      const next = !prev;
      if (next && conversationManagement) {
        void conversationManagement.refreshConversations();
      }
      return next;
    });
    if (providerConfigOpen) {
      setProviderConfigOpen(false);
    }
  };

  const toggleProviderConfig = () => {
    setProviderConfigOpen((prev) => {
      const next = !prev;
      if (next) {
        setConversationListOpen(false);
      }
      return next;
    });
  };

  return {
    aiAssistantHubContextValue,
    aiChatState,
    cardMessages,
    chatTitle,
    connectionStatus,
    conversationListGroupLabel,
    archivedConversationListGroupLabel,
    conversationListOpen,
    conversationManagement,
    conversationManagementEnabled,
    floatingTitleButtonRef,
    isZh,
    pinnedCount,
    providerConfigOpen,
    providerGroups,
    providerKind,
    providerStatusLabel,
    providerStatusTone,
    activeProviderDefinition,
    setConversationListOpen,
    setProviderConfigOpen,
    title,
    toggleConversationList,
    toggleProviderConfig,
    toolFeedbackStyleResolved,
    uiLocale,
    windowTitleId,
    ...layout,
  };
}
