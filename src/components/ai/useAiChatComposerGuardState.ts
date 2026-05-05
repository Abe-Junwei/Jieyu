import { useMemo } from 'react';
import { escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';
import { isSendTurnPersistLayerRecoveryHintMessage } from '../../ai/chat/sendTurnPersistRecoveryUi';

export function useAiChatComposerGuardState({
  aiLastError,
  cardMessages,
  aiMessages,
  aiIsStreaming,
  onSendAiMessage,
  activeProviderLabel,
  aiConversationId,
  hasToolPending,
  hasVoiceDialogueBlocking,
}: {
  aiLastError: string | null | undefined;
  cardMessages: {
    layerMismatchWarning: string;
    highRiskPending: string;
    voiceDialogueBlocking: string;
  };
  aiMessages: Array<{ role?: string; content?: string }> | null | undefined;
  aiIsStreaming: boolean | undefined;
  onSendAiMessage: ((text: string) => void | Promise<void>) | undefined;
  activeProviderLabel: string;
  aiConversationId: string | null | undefined;
  hasToolPending: boolean;
  hasVoiceDialogueBlocking: boolean;
}) {
  const errorWarningText = useMemo(() => {
    const raw = (aiLastError ?? '').trim();
    if (!raw) return null;
    const isLayerMismatch = escapedUnicodeRegExp('\\u672a\\u627e\\u5230\\u5339\\u914d.?\\u5f53\\u524d.?\\u7684\\u8f6c\\u5199\\u5c42|no matching\\s+"?current"?\\s+transcription\\s+layer', 'i').test(raw);
    return isLayerMismatch
      ? cardMessages.layerMismatchWarning
      : `⚠ ${raw}`;
  }, [aiLastError, cardMessages]);

  const persistLayerRecoveryActions = useMemo(() => {
    const raw = (aiLastError ?? '').trim();
    if (!isSendTurnPersistLayerRecoveryHintMessage(raw)) return null;
    const msgs = aiMessages ?? [];
    let lastUserText = '';
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (m?.role === 'user') {
        lastUserText = m.content?.trim() ?? '';
        break;
      }
    }
    const canRetryLastSend = Boolean(lastUserText);
    return {
      canRetryLastSend,
      onRetry: async () => {
        if (aiIsStreaming || !onSendAiMessage || !lastUserText) return;
        await onSendAiMessage(lastUserText);
      },
      onCopyDiagnostics: async () => {
        const payload = {
          kind: 'jieyu_ai_chat_persist_recovery' as const,
          v: 1,
          lastError: raw,
          providerLabel: activeProviderLabel,
          conversationId: aiConversationId ?? null,
          lastUserMessagePresent: canRetryLastSend,
          messageCount: msgs.length,
          ts: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        };
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        } catch {
          // Non-secure context, permission denied, or test env without clipboard mock
        }
      },
    };
  }, [activeProviderLabel, aiConversationId, aiLastError, aiIsStreaming, aiMessages, onSendAiMessage]);

  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return cardMessages.highRiskPending;
    }
    if (hasVoiceDialogueBlocking) {
      return cardMessages.voiceDialogueBlocking;
    }
    return null;
  }, [hasToolPending, hasVoiceDialogueBlocking, cardMessages]);

  return {
    errorWarningText,
    persistLayerRecoveryActions,
    inputBlockedReason,
  };
}
