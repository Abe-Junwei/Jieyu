// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import * as Overview from '../../services/projectOverview';
import type { ProjectOverview } from '../../services/projectOverview';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';

function overview(audioCount: number): ProjectOverview {
  return {
    title: 'Demo',
    updatedAt: '2026-10-08T00:00:00.000Z',
    objectLanguages: [],
    workingLanguages: [],
    audioCount,
    manuscriptCount: 0,
    audioDurationSec: 0,
    speakerCount: 0,
    lexemeCount: 0,
    tokenCount: 0,
    progress: {
      sentenceCount: 0,
      transcribedCount: 0,
      translatedCount: 0,
      annotatedCount: 0,
      transcriptionRate: null,
      translationRate: null,
      annotationRate: null,
    },
  };
}

describe('ProjectOverviewPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rereads the audio count on mount even when the app-wide staleTime would keep the cached value', async () => {
    // 与 main.tsx 一致的 5 分钟 staleTime；缓存里是导入前的 3 条录音 | Same 5-minute staleTime as main.tsx.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    });
    client.setQueryData(['project-overview', 'text-1', 'zh-CN'], overview(3));
    const load = vi.spyOn(Overview, 'loadProjectOverview').mockResolvedValue(overview(4));

    const view = render(
      <QueryClientProvider client={client}>
        <LocaleProvider locale="zh-CN">
          <ProjectOverviewPanel textId="text-1" records={[]} />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    const count = () =>
      view.container.querySelector('.project-overview-recordings dd')?.textContent;
    await vi.waitFor(() => expect(count()).toBe('4'));
    expect(load).toHaveBeenCalledWith('text-1', 'zh-CN');
  });
});
