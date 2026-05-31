/**
 * §9.3 会话管理对外契约（Plan + UI Spec 共轨类型）。
 */

import type { AiConversationDoc } from '../../db/types';

export type AiConversationListItem = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
  textId?: string;
  clearedAt?: string;
  archived?: boolean;
}>;

export type AiConversationManagementApi = Readonly<{
  enabled: true;
  activeConversationId: string | null;
  conversations: AiConversationListItem[];
  archivedConversations: AiConversationListItem[];
  refreshConversations: () => Promise<void>;
  startNewConversation: () => Promise<void>;
  switchConversation: (conversationId: string) => Promise<void>;
  clearCurrentConversation: () => void;
  archiveConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
}>;

export type AiConversationManagerScope = Readonly<{
  textId?: string;
}>;

export function toAiConversationListItem(row: AiConversationDoc): AiConversationListItem {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    ...(row.textId ? { textId: row.textId } : {}),
    ...(row.clearedAt ? { clearedAt: row.clearedAt } : {}),
    ...(row.archived === true ? { archived: true } : {}),
  };
}
