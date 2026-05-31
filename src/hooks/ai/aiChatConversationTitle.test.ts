import { describe, expect, it } from 'vitest';
import { resolveAiChatConversationTitle } from './aiChatConversationTitle';
import type { AiConversationManagementApi } from './aiConversationManager.types';

describe('resolveAiChatConversationTitle', () => {
  it('uses legacy title when conversation management is off', () => {
    expect(resolveAiChatConversationTitle('zh-CN', null, 'c1')).toBe('AI 对话');
  });

  it('uses newConversation label when active row has default title', () => {
    const management = {
      enabled: true,
      activeConversationId: 'c1',
      conversations: [{ id: 'c1', title: '默认会话', updatedAt: '2026-01-01T00:00:00.000Z' }],
      archivedConversations: [],
      refreshConversations: async () => {},
      startNewConversation: async () => {},
      switchConversation: async () => {},
      clearCurrentConversation: () => {},
      archiveConversation: async () => {},
      deleteConversation: async () => {},
    } satisfies AiConversationManagementApi;

    expect(resolveAiChatConversationTitle('zh-CN', management, 'c1')).toBe('新对话');
  });

  it('shows titleGenerating while Dexie title is still default and user message exists', () => {
    const management = {
      enabled: true,
      activeConversationId: 'c1',
      conversations: [{ id: 'c1', title: '默认会话', updatedAt: '2026-01-01T00:00:00.000Z' }],
      archivedConversations: [],
      refreshConversations: async () => {},
      startNewConversation: async () => {},
      switchConversation: async () => {},
      clearCurrentConversation: () => {},
      archiveConversation: async () => {},
      deleteConversation: async () => {},
    } satisfies AiConversationManagementApi;

    expect(
      resolveAiChatConversationTitle('zh-CN', management, 'c1', [
        { role: 'user', content: '请总结语段风险' },
      ]),
    ).toBe('正在生成标题…');
  });

  it('uses Dexie title when set', () => {
    const management = {
      enabled: true,
      activeConversationId: 'c1',
      conversations: [{ id: 'c1', title: '语段校对', updatedAt: '2026-01-01T00:00:00.000Z' }],
      archivedConversations: [],
      refreshConversations: async () => {},
      startNewConversation: async () => {},
      switchConversation: async () => {},
      clearCurrentConversation: () => {},
      archiveConversation: async () => {},
      deleteConversation: async () => {},
    } satisfies AiConversationManagementApi;

    expect(resolveAiChatConversationTitle('zh-CN', management, 'c1')).toBe('语段校对');
  });
});
