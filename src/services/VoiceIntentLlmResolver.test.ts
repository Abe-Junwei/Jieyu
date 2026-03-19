import { describe, expect, it } from 'vitest';
import { parseVoiceIntentFromLlmResponse } from './VoiceIntentLlmResolver';

describe('VoiceIntentLlmResolver', () => {
  it('parses action intent JSON', () => {
    const parsed = parseVoiceIntentFromLlmResponse(
      '{"type":"action","actionId":"undo"}',
      '撤回',
    );
    expect(parsed).toEqual({ type: 'action', actionId: 'undo', raw: '撤回' });
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
    expect(parsed).toEqual({ type: 'action', actionId: 'redo', raw: '重做一下' });
  });
});
