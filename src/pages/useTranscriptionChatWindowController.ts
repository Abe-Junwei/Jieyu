import { useId, useMemo, useRef, useState } from 'react';
import { normalizeLocale, t, type Locale } from '../i18n';
import { getAiChatCardMessages } from '../i18n/messages';
import { getAiChatProviderDefinition } from '../ai/providers/providerCatalog';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { resolveAiChatConversationTitle } from '../hooks/ai/aiChatConversationTitle';
import { useTranscriptionChatWindowLayout } from './useTranscriptionChatWindowLayout';

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
    pendingToolCall: aiChatState.aiPendingToolCall,
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
  const attentionCount = Number(Boolean(aiChatState.aiPendingToolCall));
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
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
    attentionCount,
    aiChatState,
    cardMessages,
    chatTitle,
    conversationListGroupLabel,
    archivedConversationListGroupLabel,
    conversationListOpen,
    conversationManagement,
    conversationManagementEnabled,
    floatingTitleButtonRef,
    isZh,
    providerConfigOpen,
    providerStatusLabel,
    providerStatusTone,
    activeProviderDefinition,
    setConversationListOpen,
    setProviderConfigOpen,
    title,
    toggleConversationList,
    toggleProviderConfig,
    uiLocale,
    windowTitleId,
    ...layout,
  };
}
