// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAiChatSettings } from '../providers/providerCatalog';
import { loadAiChatSettingsFromStorage, persistAiChatSettings } from './aiChatSettingsStorage';

describe('aiChatSettingsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remembers the base URL origin for the index.html CSP script (BF3-1)', async () => {
    await persistAiChatSettings(
      normalizeAiChatSettings({
        providerKind: 'openai-compatible',
        baseUrl: 'https://llm.example.org:8443/v1/',
        model: 'm',
      }),
    );
    expect(window.localStorage.getItem('jieyu.csp.aiOrigin')).toBe('https://llm.example.org:8443');

    await persistAiChatSettings(
      normalizeAiChatSettings({
        providerKind: 'openai-compatible',
        baseUrl: 'not a url',
        model: 'm',
      }),
    );
    expect(window.localStorage.getItem('jieyu.csp.aiOrigin')).toBeNull();
  });

  it('redacts secrets when secure crypto is unavailable', async () => {
    const cryptoWithoutSubtle = {
      ...window.crypto,
      subtle: undefined,
    } as unknown as Crypto;

    vi.stubGlobal('crypto', cryptoWithoutSubtle);

    await persistAiChatSettings(
      normalizeAiChatSettings({
        providerKind: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-plain-fallback',
        apiKeysByProvider: {
          deepseek: 'sk-plain-fallback',
        },
      }),
    );

    expect(window.localStorage.getItem('jieyu.aiChat.settings.secure')).toBeNull();
    const plainPayload = JSON.parse(
      window.localStorage.getItem('jieyu.aiChat.settings') ?? '{}',
    ) as {
      providerKind?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      apiKeysByProvider?: Record<string, string>;
      baseUrlsByProvider?: Record<string, string>;
      modelsByProvider?: Record<string, string>;
    };

    expect(plainPayload.providerKind).toBe('deepseek');
    expect(plainPayload.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(plainPayload.model).toBe('deepseek-chat');
    expect(plainPayload.apiKey).toBe('');
    expect(plainPayload.apiKeysByProvider).toEqual({});
    expect(plainPayload.baseUrlsByProvider?.deepseek).toBe('https://api.deepseek.com/v1');
    expect(plainPayload.modelsByProvider?.deepseek).toBe('deepseek-chat');
  });

  it('loads redacted plaintext fallback without reintroducing secrets', async () => {
    window.localStorage.setItem(
      'jieyu.aiChat.settings',
      JSON.stringify({
        providerKind: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: '',
        apiKeysByProvider: {},
      }),
    );

    const loaded = await loadAiChatSettingsFromStorage();

    expect(loaded.providerKind).toBe('deepseek');
    expect(loaded.apiKey).toBe('');
    expect(loaded.apiKeysByProvider.deepseek).toBe('');
  });
});
