import { useEffect } from 'react';
import type { PendingAiToolCall } from './useAiChat.types';
import { publishAssistantDialogueChatToolLayer } from '../../services/assistantDialogueState';

/** ADR-0028: keep chat pending-tool in the shared assistant dialogue read model. */
export function useSyncAssistantDialogueChatTool(pendingToolCall: PendingAiToolCall | null): void {
  useEffect(() => {
    publishAssistantDialogueChatToolLayer(pendingToolCall);
    return () => {
      publishAssistantDialogueChatToolLayer(null);
    };
  }, [pendingToolCall]);
}
