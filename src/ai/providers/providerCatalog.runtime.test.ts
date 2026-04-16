import { describe, expect, it } from 'vitest';
import { applyAiChatSettingsPatch, getAiChatProviderDefinition, getDefaultAiChatSettings } from './providerCatalog';

describe('providerCatalog runtime fallbacks', () => {
  it('returns mapped definition for valid kind', () => {
    const def = getAiChatProviderDefinition('mock');
    expect(def.kind).toBe('mock');
  });

  it('falls back to mock definition for unknown runtime kind', () => {
    const def = getAiChatProviderDefinition('unknown-provider' as unknown as Parameters<typeof getAiChatProviderDefinition>[0]);
    expect(def.kind).toBe('mock');
  });

  it('restores previous model after switching providers back and forth', () => {
    const minimax = getDefaultAiChatSettings('minimax');
    const withCustomMiniMaxModel = applyAiChatSettingsPatch(minimax, { model: 'MiniMax-Text-01-custom' });

    const switchedToQwen = applyAiChatSettingsPatch(withCustomMiniMaxModel, { providerKind: 'qwen' });
    expect(switchedToQwen.providerKind).toBe('qwen');

    const switchedBackToMiniMax = applyAiChatSettingsPatch(switchedToQwen, { providerKind: 'minimax' });
    expect(switchedBackToMiniMax.providerKind).toBe('minimax');
    expect(switchedBackToMiniMax.model).toBe('MiniMax-Text-01-custom');
  });

  it('keeps per-provider model memories for multiple providers', () => {
    const initial = getDefaultAiChatSettings('minimax');
    const minimaxPatched = applyAiChatSettingsPatch(initial, { model: 'minimax-model-a' });
    const toGemini = applyAiChatSettingsPatch(minimaxPatched, { providerKind: 'gemini' });
    const geminiPatched = applyAiChatSettingsPatch(toGemini, { model: 'gemini-model-b' });
    const toQwen = applyAiChatSettingsPatch(geminiPatched, { providerKind: 'qwen' });
    const qwenPatched = applyAiChatSettingsPatch(toQwen, { model: 'qwen-model-c' });

    const backToGemini = applyAiChatSettingsPatch(qwenPatched, { providerKind: 'gemini' });
    expect(backToGemini.model).toBe('gemini-model-b');

    const backToMiniMax = applyAiChatSettingsPatch(backToGemini, { providerKind: 'minimax' });
    expect(backToMiniMax.model).toBe('minimax-model-a');

    const backToQwen = applyAiChatSettingsPatch(backToMiniMax, { providerKind: 'qwen' });
    expect(backToQwen.model).toBe('qwen-model-c');
  });

  it('restores previous baseUrl after switching providers back and forth', () => {
    const minimax = getDefaultAiChatSettings('minimax');
    const withCustomMiniMaxBaseUrl = applyAiChatSettingsPatch(minimax, { baseUrl: 'https://mini.example/v1' });

    const switchedToQwen = applyAiChatSettingsPatch(withCustomMiniMaxBaseUrl, { providerKind: 'qwen' });
    expect(switchedToQwen.providerKind).toBe('qwen');

    const switchedBackToMiniMax = applyAiChatSettingsPatch(switchedToQwen, { providerKind: 'minimax' });
    expect(switchedBackToMiniMax.providerKind).toBe('minimax');
    expect(switchedBackToMiniMax.baseUrl).toBe('https://mini.example/v1');
  });

  it('keeps per-provider baseUrl memories for multiple providers', () => {
    const initial = getDefaultAiChatSettings('minimax');
    const minimaxPatched = applyAiChatSettingsPatch(initial, { baseUrl: 'https://mini.example/v1' });
    const toGemini = applyAiChatSettingsPatch(minimaxPatched, { providerKind: 'gemini' });
    const geminiPatched = applyAiChatSettingsPatch(toGemini, { baseUrl: 'https://gemini.example/v1beta' });
    const toQwen = applyAiChatSettingsPatch(geminiPatched, { providerKind: 'qwen' });
    const qwenPatched = applyAiChatSettingsPatch(toQwen, { baseUrl: 'https://qwen.example/compatible-mode/v1' });

    const backToGemini = applyAiChatSettingsPatch(qwenPatched, { providerKind: 'gemini' });
    expect(backToGemini.baseUrl).toBe('https://gemini.example/v1beta');

    const backToMiniMax = applyAiChatSettingsPatch(backToGemini, { providerKind: 'minimax' });
    expect(backToMiniMax.baseUrl).toBe('https://mini.example/v1');

    const backToQwen = applyAiChatSettingsPatch(backToMiniMax, { providerKind: 'qwen' });
    expect(backToQwen.baseUrl).toBe('https://qwen.example/compatible-mode/v1');
  });

  it('provides default settings for webllm', () => {
    const webllm = getDefaultAiChatSettings('webllm');
    expect(webllm.providerKind).toBe('webllm');
    expect(webllm.model).toContain('Llama');
    expect(webllm.apiKey).toBe('');
  });
});
