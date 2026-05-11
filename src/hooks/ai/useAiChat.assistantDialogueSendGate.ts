/**
 * ADR-0028: single gate for typed send vs shared assistant dialogue read model.
 */

import type { PendingAiToolCall } from './useAiChat.types';
import {
  getAssistantDialogueSnapshot,
  isAssistantChatComposerBlocked,
} from '../../services/assistantDialogueState';

export function isAiChatSendBlockedByAssistantDialogue(
  pendingToolCall: PendingAiToolCall | null,
): boolean {
  return isAssistantChatComposerBlocked({
    hasToolPending: Boolean(pendingToolCall),
    dialoguePrimary: getAssistantDialogueSnapshot().primary,
  });
}
