// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, type Locale } from '../../i18n';
import {
  __unsafeClearAiChatHybridRecommendationCache,
  useAiChatHybridRecommendations,
} from './useAiChatHybridRecommendations';

const { createAiChatProviderMock } = vi.hoisted(() => ({
  createAiChatProviderMock: vi.fn(),
}));

vi.mock('../../ai/providers/providerCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../ai/providers/providerCatalog')>('../../ai/providers/providerCatalog');
  return {
    ...actual,
    createAiChatProvider: createAiChatProviderMock,
  };
});

function withLocale(locale: Locale) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
  };
}

function createStreamingProvider(response: string) {
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    supportsStreaming: true,
    async *chat() {
      yield { delta: response };
      yield { delta: '', done: true };
    },
  };
}

describe('useAiChatHybridRecommendations', () => {
  beforeEach(() => {
    __unsafeClearAiChatHybridRecommendationCache();
    createAiChatProviderMock.mockReset();
    vi.useRealTimers();
  });

  it('returns fallback recommendations immediately without remote refinement on mock provider', () => {
    const { result } = renderHook(() => useAiChatHybridRecommendations({
      locale: 'en-US',
      enabled: true,
      composerIdle: true,
      aiChatSettings: {
        providerKind: 'mock',
        model: 'mock-1',
      } as never,
      connectionTestStatus: 'success',
      primarySuggestion: 'Try asking: review the current translation',
      page: 'transcription',
      selectedLayerType: 'translation',
      selectedText: 'Current draft translation',
    }), { wrapper: withLocale('en-US') });

    expect(result.current.source).toBe('fallback');
    expect(result.current.items[0]?.prompt).toBe('Try asking: review the current translation');
    expect(createAiChatProviderMock).not.toHaveBeenCalled();
  });

  it('refines fallback recommendations with LLM output and caches the result', async () => {
    createAiChatProviderMock.mockReturnValue(createStreamingProvider(JSON.stringify({
      suggestions: [
        { label: 'Review the selected translation for omissions', prompt: 'Review the selected translation for omissions and mistranslations' },
        { label: 'Rewrite the translation more naturally', prompt: 'Rewrite the selected translation more naturally and explain the tradeoffs' },
        { label: 'Pick the next row to fix', prompt: 'Based on current progress, tell me which row I should fix next and why' },
      ],
    })));

    const baseOptions = {
      locale: 'en-US' as const,
      enabled: true,
      composerIdle: true,
      aiChatSettings: {
        providerKind: 'deepseek',
        model: 'deepseek-chat',
      } as never,
      connectionTestStatus: 'success' as const,
      primarySuggestion: 'Try asking: review the current translation',
      page: 'transcription' as const,
      selectedLayerType: 'translation' as const,
      selectedText: 'Current draft translation',
      rowNumber: 3,
      adaptiveIntent: 'review' as const,
      adaptiveResponseStyle: 'detailed' as const,
      adaptiveKeywords: ['translation', 'terminology'],
    };

    const { result, unmount } = renderHook(() => useAiChatHybridRecommendations(baseOptions), {
      wrapper: withLocale('en-US'),
    });

    expect(result.current.source).toBe('fallback');

    await waitFor(() => {
      expect(result.current.source).toBe('llm');
    }, { timeout: 2000 });
    expect(result.current.items[0]?.prompt).toBe('Review the selected translation for omissions and mistranslations');
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);

    unmount();

    const secondRender = renderHook(() => useAiChatHybridRecommendations(baseOptions), {
      wrapper: withLocale('en-US'),
    });
    expect(secondRender.result.current.source).toBe('llm');
    expect(secondRender.result.current.items[0]?.prompt).toBe('Review the selected translation for omissions and mistranslations');
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh remote recommendations for non-significant context changes', async () => {
    createAiChatProviderMock.mockReturnValue(createStreamingProvider(JSON.stringify({
      suggestions: [
        { label: 'Review row 3', prompt: 'Review row 3 and tell me what to fix first' },
      ],
    })));

    const baseOptions = {
      locale: 'en-US' as const,
      enabled: true,
      composerIdle: true,
      aiChatSettings: {
        providerKind: 'deepseek',
        model: 'deepseek-chat',
      } as never,
      connectionTestStatus: 'success' as const,
      primarySuggestion: 'Try asking: review the current translation',
      page: 'transcription' as const,
      selectedLayerType: 'translation' as const,
      rowNumber: 3,
      adaptiveIntent: 'review' as const,
      adaptiveResponseStyle: 'detailed' as const,
      adaptiveKeywords: ['translation'],
      selectedText: 'Current draft translation',
    };

    const { result, rerender, unmount } = renderHook((props: {
      confidence?: number | null;
    }) => useAiChatHybridRecommendations({
      ...baseOptions,
      confidence: props.confidence ?? 0.74,
    }), {
      wrapper: withLocale('en-US'),
      initialProps: { confidence: 0.74 },
    });

    await waitFor(() => {
      expect(result.current.source).toBe('llm');
    }, { timeout: 2000 });
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);

    rerender({ confidence: 0.52 });

    expect(result.current.source).toBe('llm');
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);
    unmount();
  });
});
