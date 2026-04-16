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
      selectedUnit: { id: 'utt-2' } as EmbeddingContextValue['selectedUnit'],
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
        { unitId: 'utt-2', score: 0.93, label: 'U2', text: '相似句内容' },
      ],
      aiEmbeddingWarning: 'Fallback embedding active',
      onJumpToEmbeddingMatch: vi.fn(),
    });

    const root = view.container.querySelector('.transcription-ai-card') as HTMLDivElement;
    const activeMatch = screen.getByRole('button', { name: /U2/i });

    expect(root).toBeTruthy();
    expect(screen.getByText('向量索引')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '引擎' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '最近 AI 任务' })).toBeTruthy();
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
    const onBuildUnitEmbeddings = vi.fn(async () => undefined);
    const onBuildNotesEmbeddings = vi.fn(async () => undefined);
    const onBuildPdfEmbeddings = vi.fn(async () => undefined);
    const onFindSimilarUnits = vi.fn(async () => undefined);
    const onRefreshEmbeddingTasks = vi.fn(async () => undefined);
    const onTestEmbeddingProvider = vi.fn(async () => ({ available: false, error: 'offline' }));

    renderCard({
      selectedUnit: { id: 'utt-1' } as EmbeddingContextValue['selectedUnit'],
      onBuildUnitEmbeddings,
      onBuildNotesEmbeddings,
      onBuildPdfEmbeddings,
      onFindSimilarUnits,
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
      expect(screen.getByText('不可用: offline')).toBeTruthy();
    });

    expect(onBuildUnitEmbeddings).toHaveBeenCalledTimes(1);
    expect(onBuildNotesEmbeddings).toHaveBeenCalledTimes(1);
    expect(onBuildPdfEmbeddings).toHaveBeenCalledTimes(1);
    expect(onFindSimilarUnits).toHaveBeenCalledTimes(1);
    expect(onRefreshEmbeddingTasks).toHaveBeenCalledTimes(1);
  });

  it('surfaces rejected provider tests as unavailable instead of leaving the card stuck in testing state', async () => {
    const onTestEmbeddingProvider = vi.fn(async () => {
      throw new Error('network down');
    });

    renderCard({ onTestEmbeddingProvider });

    fireEvent.click(screen.getByRole('button', { name: '测试' }));

    await waitFor(() => {
      expect(screen.getByText('不可用: network down')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '测试' })).toBeTruthy();
  });
});
