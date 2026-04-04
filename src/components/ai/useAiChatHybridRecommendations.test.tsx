// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
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

function buildRecommendationEvent(
  prompt: string,
  timestamp: string,
): {
  type: 'shown';
  source: 'llm';
  prompt: string;
  signature: string;
  timestamp: string;
} {
  return {
    type: 'shown',
    source: 'llm',
    prompt,
    signature: `llm:${prompt}`,
    timestamp,
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

  it('falls back immediately when cached llm recommendations enter cooldown', async () => {
    const llmPrompt = 'Review row 3 and tell me what to fix first';
    const now = Date.now();
    createAiChatProviderMock.mockReturnValue(createStreamingProvider(JSON.stringify({
      suggestions: [
        { label: 'Review row 3', prompt: llmPrompt },
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
      selectedText: 'Current draft translation',
    };

    const { result, rerender } = renderHook((telemetry?: {
      recentEvents?: Array<ReturnType<typeof buildRecommendationEvent>>;
      lastShownPrompt?: string;
    }) => useAiChatHybridRecommendations({
      ...baseOptions,
      recommendationTelemetry: telemetry,
    }), {
      wrapper: withLocale('en-US'),
    });

    await waitFor(() => {
      expect(result.current.source).toBe('llm');
    }, { timeout: 2000 });

    rerender({
      recentEvents: [
        buildRecommendationEvent(llmPrompt, new Date(now - 180_000).toISOString()),
        buildRecommendationEvent(llmPrompt, new Date(now - 120_000).toISOString()),
        buildRecommendationEvent(llmPrompt, new Date(now - 60_000).toISOString()),
      ],
      lastShownPrompt: llmPrompt,
    });

    await waitFor(() => {
      expect(result.current.source).toBe('fallback');
    }, { timeout: 2000 });
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);
  });

  it('does not consume remote budget for debounced requests that never start', async () => {
    vi.useFakeTimers();
    createAiChatProviderMock.mockReturnValue(createStreamingProvider(JSON.stringify({
      suggestions: [
        { label: 'Review the latest row', prompt: 'Review the latest row and tell me what to fix first' },
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
    };

    const { result, rerender } = renderHook((props: { selectedText: string }) => useAiChatHybridRecommendations({
      ...baseOptions,
      selectedText: props.selectedText,
    }), {
      wrapper: withLocale('en-US'),
      initialProps: { selectedText: 'Draft 1' },
    });

    for (let index = 2; index <= 8; index += 1) {
      rerender({ selectedText: `Draft ${index}` });
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.source).toBe('llm');
    expect(createAiChatProviderMock).toHaveBeenCalledTimes(1);
  });

  it('uses the latest row context when the request is still within the same significance bucket', async () => {
    vi.useFakeTimers();
    let latestUserPrompt = '';
    createAiChatProviderMock.mockReturnValue({
      id: 'deepseek',
      label: 'DeepSeek',
      supportsStreaming: true,
      async *chat(messages: Array<{ role: string; content: string }>) {
        latestUserPrompt = messages.find((message) => message.role === 'user')?.content ?? '';
        yield {
          delta: JSON.stringify({
            suggestions: [
              { label: 'Review the current row', prompt: 'Review the current row and explain the top issue' },
            ],
          }),
        };
        yield { delta: '', done: true };
      },
    });

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
      selectedLayerType: null,
      selectedText: '',
    };

    const { result, rerender } = renderHook((props: { rowNumber: number }) => useAiChatHybridRecommendations({
      ...baseOptions,
      rowNumber: props.rowNumber,
    }), {
      wrapper: withLocale('en-US'),
      initialProps: { rowNumber: 3 },
    });

    rerender({ rowNumber: 4 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.source).toBe('llm');
    expect(latestUserPrompt).toContain('rowNumber=4');
    expect(latestUserPrompt).not.toContain('rowNumber=3');
  });
});
