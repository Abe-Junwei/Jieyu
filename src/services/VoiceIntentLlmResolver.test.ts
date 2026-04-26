import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseVoiceIntentFromLlmResponse, parseVoiceIntentFromLlmResponseDetailed, resolveVoiceIntentWithLlmUsingConfig } from './VoiceIntentLlmResolver';

const { createAiChatProviderMock } = vi.hoisted(() => ({
  createAiChatProviderMock: vi.fn(),
}));

vi.mock('../ai/providers/providerCatalog', () => ({
  createAiChatProvider: createAiChatProviderMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeAiChatSettings() {
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
  } as const;
}

describe('VoiceIntentLlmResolver', () => {
  it('parses action intent JSON', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '{"type":"action","actionId":"undo"}',
      '撤回',
    );
    expect(parsed).toEqual({ type: 'action', actionId: 'undo', confidence: 1, raw: '撤回' });
  });

  it('parses tool_call JSON shape', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '{"tool_call":{"name":"set_translation_text","arguments":{"text":"你好"}}}',
      '翻译成你好',
    );
    expect(parsed).toEqual({
      type: 'tool',
      toolName: 'set_translation_text',
      params: { text: '你好' },
      raw: '翻译成你好',
    });
  });

  it('returns null for invalid action id', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '{"type":"action","actionId":"not_a_real_action"}',
      '无效操作',
    );
    expect(parsed).toBeNull();
  });

  it('returns diagnosable error details for invalid action id', () => {
    const parsed = parseVoiceIntentFromLlmResponseDetailed(
      '{"type":"action","actionId":"not_a_real_action"}',
      '无效操作',
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorKind).toBe('invalid-action');
    }
  });

  it('returns diagnosable error details for invalid json', () => {
    const parsed = parseVoiceIntentFromLlmResponseDetailed(
      '{bad json',
      '坏 JSON',
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorKind).toBe('invalid-json');
    }
  });

  it('parses fenced json', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '```json\n{"type":"chat","text":"请再说一遍"}\n```',
      '再说一遍',
    );
    expect(parsed).toEqual({ type: 'chat', text: '请再说一遍', raw: '再说一遍' });
  });

  it('parses custom schema fields', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '{"kind":"action","action":"redo"}',
      '重做一下',
      {
        typeField: 'kind',
        actionIdField: 'action',
      },
    );
    expect(parsed).toEqual({ type: 'action', actionId: 'redo', confidence: 1, raw: '重做一下' });
  });

  it('routes command and analysis through the same resolver path while keeping mode-specific prompts', async () => {
    const capturedUserContents: string[] = [];
    createAiChatProviderMock.mockImplementation(() => ({
      chat: async function* (messages: Array<{ role: string; content: string }>) {
        const userMessage = messages.find((message) => message.role === 'user');
        if (userMessage) capturedUserContents.push(userMessage.content);
        yield { delta: '{"type":"chat","text":"ok"}', done: true };
      },
    }));

    const transcript = '请帮我总结并标注重点';
    const settings = makeAiChatSettings();

    const commandResult = await resolveVoiceIntentWithLlmUsingConfig({
      transcript,
      mode: 'command',
      settings,
      recentContext: ['[chat] hi'],
    }, {});

    const analysisResult = await resolveVoiceIntentWithLlmUsingConfig({
      transcript,
      mode: 'analysis',
      settings,
      recentContext: ['[chat] hi'],
    }, {});

    expect(commandResult.ok).toBe(true);
    expect(analysisResult.ok).toBe(true);
    if (commandResult.ok && analysisResult.ok) {
      expect(commandResult.intent.type).toBe('chat');
      expect(analysisResult.intent.type).toBe('chat');
      expect(commandResult.intent.raw).toBe(transcript);
      expect(analysisResult.intent.raw).toBe(transcript);
    }

    expect(createAiChatProviderMock).toHaveBeenCalledTimes(2);
    expect(capturedUserContents).toHaveLength(2);
    expect(capturedUserContents[0]).toContain('mode=command');
    expect(capturedUserContents[1]).toContain('mode=analysis');
    expect(capturedUserContents[0]).toContain('modePrompt=');
    expect(capturedUserContents[1]).toContain('modePrompt=');
  });
});
