// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UtteranceDocType } from '../db';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import {
  AiPanelContext,
  DEFAULT_AI_PANEL_CONTEXT_VALUE,
  type AiPanelContextValue,
} from '../contexts/AiPanelContext';
import {
  EmbeddingProvider,
  DEFAULT_EMBEDDING_CONTEXT_VALUE,
  type EmbeddingContextValue,
} from '../contexts/EmbeddingContext';
import { pickEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  return {
    id: 'utt-1',
    mediaId: 'media-1',
    startTime: 1,
    endTime: 2,
    transcription: { default: 'hello world' },
    words: [],
    ...overrides,
  } as unknown as UtteranceDocType;
}

function makeContextValue(overrides: Partial<AiPanelContextValue> = {}): AiPanelContextValue {
  return {
    ...DEFAULT_AI_PANEL_CONTEXT_VALUE,
    dbName: 'jieyudb',
    utteranceCount: 1,
    translationLayerCount: 1,
    selectedUtterance: makeUtterance(),
    lexemeMatches: [],
    ...overrides,
  };
}

function makeEmbeddingContextValue(overrides: Partial<EmbeddingContextValue> = {}): EmbeddingContextValue {
  return pickEmbeddingContextValue({
    ...DEFAULT_EMBEDDING_CONTEXT_VALUE,
    ...overrides,
  });
}

describe('AiAnalysisPanel embedding integration', () => {
  it('invokes similarity search callback from embedding card', () => {
    const onFindSimilarUtterances = vi.fn().mockResolvedValue(undefined);
    const baseContext = makeContextValue();
    const embeddingContext = makeEmbeddingContextValue({
      selectedUtterance: baseContext.selectedUtterance,
      onFindSimilarUtterances,
    });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingContext}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const findSimilarBtn = screen.getByRole('button', { name: /Find Similar|检索相似句/i });
    fireEvent.click(findSimilarBtn);

    expect(onFindSimilarUtterances).toHaveBeenCalledTimes(1);
  });

  it('invokes jump callback and highlights active similarity match', () => {
    const onJumpToEmbeddingMatch = vi.fn();
    const baseContext = makeContextValue({
      selectedUtterance: makeUtterance({ id: 'utt-2' }),
    });
    const embeddingContext = makeEmbeddingContextValue({
      selectedUtterance: makeUtterance({ id: 'utt-2' }),
      aiEmbeddingMatches: [
        {
          utteranceId: 'utt-2',
          score: 0.93,
          label: 'U2',
          text: 'matched text',
        },
      ],
      onJumpToEmbeddingMatch,
    });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingContext}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    const matchBtn = screen.getByRole('button', { name: /U2/i });
    expect(matchBtn.className).toContain('ai-embed-match-btn-active');

    fireEvent.click(matchBtn);
    expect(onJumpToEmbeddingMatch).toHaveBeenCalledWith('utt-2');
  });

  it('does not render AI chat decision logs inside analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider value={makeContextValue()}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/最近 AI 决策日志|Recent AI Decisions/i)).toBeNull();
    expect(screen.queryByText(/delete_layer/)).toBeNull();
    expect(screen.queryByText(/已取消执行|Cancelled/i)).toBeNull();
  });

  it('does not render pending high-risk preview in analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider value={makeContextValue()}>
        <EmbeddingProvider value={makeEmbeddingContextValue()}>
          <AiAnalysisPanel isCollapsed={false} />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/高风险工具调用待确认|High-risk tool call pending confirmation/i)).toBeNull();
    expect(screen.queryByText(/风险摘要|Risk summary/i)).toBeNull();
    expect(screen.queryByText(/Target layer: layer-jp/)).toBeNull();
  });

  it('renders embedding fallback warning when provided', () => {
    const baseContext = makeContextValue();
    const embeddingCtx = makeEmbeddingContextValue({ aiEmbeddingWarning: 'Running fallback embedding (model unavailable). Retrieval quality may degrade.' });

    render(
      <AiPanelContext.Provider value={baseContext}>
        <EmbeddingProvider value={embeddingCtx}>
          <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
        </EmbeddingProvider>
      </AiPanelContext.Provider>,
    );

    expect(screen.getByText(/fallback embedding/i)).toBeTruthy();
  });
});
