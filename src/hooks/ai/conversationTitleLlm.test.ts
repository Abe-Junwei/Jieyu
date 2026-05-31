// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import {
  generateConversationTitleWithLlm,
  isLlmTitleGenerationDisabled,
  sanitizeLlmConversationTitle,
} from './conversationTitleLlm';

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

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('sanitizeLlmConversationTitle', () => {
  it('strips quotes and takes first line', () => {
    expect(sanitizeLlmConversationTitle('「语段校对」\n第二行')).toBe('语段校对');
  });
});

describe('generateConversationTitleWithLlm', () => {
  it('returns sanitized title from provider stream', async () => {
    createAiChatProviderMock.mockReturnValue({
      id: 'mock',
      chat: async function* () {
        yield { delta: '语段风险' };
        yield { delta: '校对', done: true };
      },
    });

    const title = await generateConversationTitleWithLlm('请检查语段', {
      locale: 'zh-CN',
      settings: makeSettings(),
    });
    expect(title).toBe('语段风险校对');
  });

  it('returns null when stream reports error', async () => {
    createAiChatProviderMock.mockReturnValue({
      id: 'mock',
      chat: async function* () {
        yield { delta: '', error: 'rate limited' };
      },
    });

    const title = await generateConversationTitleWithLlm('hello', {
      locale: 'en-US',
      settings: makeSettings(),
    });
    expect(title).toBeNull();
  });
});

describe('isLlmTitleGenerationDisabled', () => {
  it('respects VITE_AI_CONVERSATION_LLM_TITLE_ENABLED=false', () => {
    vi.stubEnv('VITE_AI_CONVERSATION_LLM_TITLE_ENABLED', 'false');
    expect(isLlmTitleGenerationDisabled()).toBe(true);
  });
});
