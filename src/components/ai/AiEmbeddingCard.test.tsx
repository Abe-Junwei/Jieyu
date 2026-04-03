// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { EmbeddingProvider, DEFAULT_EMBEDDING_CONTEXT_VALUE, type EmbeddingContextValue } from '../../contexts/EmbeddingContext';
import { pickEmbeddingContextValue } from '../../hooks/useEmbeddingContextValue';
import { AiEmbeddingCard } from './AiEmbeddingCard';

function makeEmbeddingContextValue(overrides: Partial<EmbeddingContextValue> = {}): EmbeddingContextValue {
  return pickEmbeddingContextValue({
    ...DEFAULT_EMBEDDING_CONTEXT_VALUE,
    ...overrides,
  });
}

function renderCard(overrides: Partial<EmbeddingContextValue> = {}) {
  const value = makeEmbeddingContextValue(overrides);
  return render(
    <LocaleProvider locale="zh-CN">
      <EmbeddingProvider value={value}>
        <AiEmbeddingCard />
      </EmbeddingProvider>
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('AiEmbeddingCard', () => {
  it('renders provider controls, task summary, and similarity result shell', () => {
    const view = renderCard({
      selectedUtterance: { id: 'utt-2' } as EmbeddingContextValue['selectedUtterance'],
      aiEmbeddingLastResult: {
        taskId: 'task-1',
        total: 10,
        generated: 7,
        skipped: 3,
        modelId: 'local-e5',
        modelVersion: '1.0.0',
        completedAt: '2026-04-03T00:00:00.000Z',
      },
      aiEmbeddingTasks: [
        { id: 'task-pending', taskType: 'embed', status: 'pending', updatedAt: '2026-04-03T00:00:00.000Z' },
        { id: 'task-done', taskType: 'embed', status: 'done', updatedAt: '2026-04-03T00:00:01.000Z', modelId: 'local-e5' },
        { id: 'task-failed', taskType: 'gloss', status: 'failed', updatedAt: '2026-04-03T00:00:02.000Z', errorMessage: 'quota' },
      ],
      aiEmbeddingMatches: [
        { utteranceId: 'utt-2', score: 0.93, label: 'U2', text: '相似句内容' },
      ],
      aiEmbeddingWarning: 'Fallback embedding active',
      onJumpToEmbeddingMatch: vi.fn(),
    });

    const root = view.container.querySelector('.transcription-ai-card') as HTMLDivElement;
    const activeMatch = screen.getByRole('button', { name: /U2/i });

    expect(root).toBeTruthy();
    expect(screen.getByText('向量索引')).toBeTruthy();
    expect(screen.getByRole('button', { name: '构建当前媒体' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '向量化笔记' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '向量化 PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '检索相似句' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '刷新' })).toBeTruthy();
    expect(screen.getByText('最近完成: 7/10（跳过 3）')).toBeTruthy();
    expect(screen.getByText('排队 1')).toBeTruthy();
    expect(screen.getByText('完成 1')).toBeTruthy();
    expect(screen.getByText('失败 1')).toBeTruthy();
    expect(screen.getByText('Fallback embedding active')).toBeTruthy();
    expect(activeMatch.className).toContain('ai-embed-match-btn-active');
    expect(screen.getByText('93.0%')).toBeTruthy();
  });

  it('tests provider connectivity and dispatches action callbacks', async () => {
    const onBuildUtteranceEmbeddings = vi.fn(async () => undefined);
    const onBuildNotesEmbeddings = vi.fn(async () => undefined);
    const onBuildPdfEmbeddings = vi.fn(async () => undefined);
    const onFindSimilarUtterances = vi.fn(async () => undefined);
    const onRefreshEmbeddingTasks = vi.fn(async () => undefined);
    const onTestEmbeddingProvider = vi.fn(async () => ({ available: false, error: 'offline' }));

    renderCard({
      selectedUtterance: { id: 'utt-1' } as EmbeddingContextValue['selectedUtterance'],
      onBuildUtteranceEmbeddings,
      onBuildNotesEmbeddings,
      onBuildPdfEmbeddings,
      onFindSimilarUtterances,
      onRefreshEmbeddingTasks,
      onTestEmbeddingProvider,
    });

    fireEvent.click(screen.getByRole('button', { name: '测试' }));
    fireEvent.click(screen.getByRole('button', { name: '构建当前媒体' }));
    fireEvent.click(screen.getByRole('button', { name: '向量化笔记' }));
    fireEvent.click(screen.getByRole('button', { name: '向量化 PDF' }));
    fireEvent.click(screen.getByRole('button', { name: '检索相似句' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    await waitFor(() => {
      expect(onTestEmbeddingProvider).toHaveBeenCalledTimes(1);
      expect(screen.getByText(': offline')).toBeTruthy();
    });

    expect(onBuildUtteranceEmbeddings).toHaveBeenCalledTimes(1);
    expect(onBuildNotesEmbeddings).toHaveBeenCalledTimes(1);
    expect(onBuildPdfEmbeddings).toHaveBeenCalledTimes(1);
    expect(onFindSimilarUtterances).toHaveBeenCalledTimes(1);
    expect(onRefreshEmbeddingTasks).toHaveBeenCalledTimes(1);
  });
});