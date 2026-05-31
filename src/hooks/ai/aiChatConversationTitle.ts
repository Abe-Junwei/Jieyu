import { t, type Locale } from '../../i18n';
import type { AiConversationManagementApi } from './aiConversationManager.types';
import { isDefaultConversationTitle } from './conversationTitleGeneration';

export function resolveAiChatConversationTitle(
  locale: Locale,
  management: AiConversationManagementApi | null | undefined,
  conversationId: string | null | undefined,
  messages?: ReadonlyArray<{ role: string; content?: string }>,
): string {
  if (!management?.enabled) {
    return t(locale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, '');
  }
  const active = management.conversations.find((row) => row.id === conversationId);
  const trimmed = active?.title?.trim() ?? '';
  if (!trimmed || isDefaultConversationTitle(locale, trimmed)) {
    const firstUser = messages?.find((row) => row.role === 'user' && row.content?.trim());
    if (firstUser?.content?.trim()) {
      return t(locale, 'ai.chat.conversationList.titleGenerating');
    }
    return t(locale, 'ai.chat.conversationList.newConversation');
  }
  return trimmed;
}
