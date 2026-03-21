// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UtteranceDocType } from '../../db';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import {
  AiPanelContext,
  DEFAULT_AI_PANEL_CONTEXT_VALUE,
  type AiPanelContextValue,
} from '../contexts/AiPanelContext';

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

describe('AiAnalysisPanel embedding integration', () => {
  it('invokes similarity search callback from embedding card', () => {
    const onFindSimilarUtterances = vi.fn().mockResolvedValue(undefined);

    render(
      <AiPanelContext.Provider value={makeContextValue({ onFindSimilarUtterances })}>
        <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
      </AiPanelContext.Provider>,
    );

    const findSimilarBtn = screen.getByRole('button', { name: /Find Similar|检索相似句/i });
    fireEvent.click(findSimilarBtn);

    expect(onFindSimilarUtterances).toHaveBeenCalledTimes(1);
  });

  it('invokes jump callback and highlights active similarity match', () => {
    const onJumpToEmbeddingMatch = vi.fn();

    render(
      <AiPanelContext.Provider
        value={makeContextValue({
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
        })}
      >
        <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
      </AiPanelContext.Provider>,
    );

    const matchBtn = screen.getByRole('button', { name: /U2/i });
    expect(matchBtn.className).toContain('ai-embed-match-btn-active');

    fireEvent.click(matchBtn);
    expect(onJumpToEmbeddingMatch).toHaveBeenCalledWith('utt-2');
  });

  it('does not render AI chat decision logs inside analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider
        value={makeContextValue({
          aiChatEnabled: true,
          aiToolDecisionLogs: [
            {
              id: 'audit-1',
              toolName: 'delete_layer',
              decision: 'cancelled',
              timestamp: new Date('2026-03-18T10:00:00.000Z').toISOString(),
            },
          ],
        })}
      >
        <AiAnalysisPanel isCollapsed={false} />
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/最近 AI 决策日志|Recent AI Decisions/i)).toBeNull();
    expect(screen.queryByText(/delete_layer/)).toBeNull();
    expect(screen.queryByText(/已取消执行|Cancelled/i)).toBeNull();
  });

  it('does not render pending high-risk preview in analysis panel after hub decoupling', () => {
    render(
      <AiPanelContext.Provider
        value={makeContextValue({
          aiChatEnabled: true,
          aiPendingToolCall: {
            call: {
              name: 'delete_layer',
              arguments: { layerId: 'layer-jp' },
            },
            assistantMessageId: 'ast-1',
            riskSummary: 'Delete an entire layer and all its rows',
            impactPreview: [
              'Target layer: layer-jp',
              'All utterance texts in this layer may be removed',
            ],
          },
        })}
      >
        <AiAnalysisPanel isCollapsed={false} />
      </AiPanelContext.Provider>,
    );

    expect(screen.queryByText(/高风险工具调用待确认|High-risk tool call pending confirmation/i)).toBeNull();
    expect(screen.queryByText(/风险摘要|Risk summary/i)).toBeNull();
    expect(screen.queryByText(/Target layer: layer-jp/)).toBeNull();
  });

  it('renders embedding fallback warning when provided', () => {
    render(
      <AiPanelContext.Provider
        value={makeContextValue({
          aiEmbeddingWarning: 'Running fallback embedding (model unavailable). Retrieval quality may degrade.',
        })}
      >
        <AiAnalysisPanel isCollapsed={false} activeTab="embedding" />
      </AiPanelContext.Provider>,
    );

    expect(screen.getByText(/fallback embedding/i)).toBeTruthy();
  });
});
