// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { patchConversationTitleIfNeeded } from './conversationTitleGeneration';

const { createAiChatProviderMock } = vi.hoisted(() => ({
  createAiChatProviderMock: vi.fn(),
}));

vi.mock('../../ai/providers/providerCatalog', () => ({
  createAiChatProvider: createAiChatProviderMock,
}));

function makeSettings(): AiChatSettings {
  return {
    providerKind: 'mock',
    baseUrl: '',
    model: 'mock-model',
    apiKey: '',
    apiKeysByProvider: {},
    toolFeedbackStyle: 'concise',
    endpointUrl: '',
    authHeaderName: 'Authorization',
    authScheme: 'bearer',
    responseFormat: 'plain-json',
  } as AiChatSettings;
}

describe('patchConversationTitleIfNeeded (LLM)', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await resetJieyuDatabaseSingletonForTests();
  });

  it('writes LLM-generated title to Dexie', async () => {
    createAiChatProviderMock.mockReturnValue({
      id: 'mock',
      chat: async function* () {
        yield { delta: '语段校对任务' };
        yield { delta: '', done: true };
      },
    });

    const db = await getDb();
    await db.collections.ai_conversations.insert({
      id: 'conv-llm',
      title: '默认会话',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: '2026-05-17T10:00:00.000Z',
      updatedAt: '2026-05-17T10:00:00.000Z',
    });

    const patched = await patchConversationTitleIfNeeded('conv-llm', '请帮我校对语段', {
      locale: 'zh-CN',
      settings: makeSettings(),
    });
    expect(patched).toBe(true);

    const row = await db.collections.ai_conversations
      .findOne({ selector: { id: 'conv-llm' } })
      .exec();
    expect(row?.toJSON().title).toBe('语段校对任务');
  });
});
