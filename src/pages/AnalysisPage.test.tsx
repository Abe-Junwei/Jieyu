// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPanelProvider } from '../contexts/AiPanelContext';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import { AnalysisPage } from './AnalysisPage';

const { mockListByTextId } = vi.hoisted(() => ({
  mockListByTextId: vi.fn(),
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listByTextId: mockListByTextId,
    },
  },
}));

vi.mock('./TranscriptionPage.AnalysisRuntime', () => ({
  TranscriptionPageAnalysisRuntime: (props: {
    embedding: { source: { selectedUnit: { id?: string } | null } };
  }) => (
    <div data-testid="analysis-runtime">{props.embedding.source.selectedUnit?.id ?? 'none'}</div>
  ),
}));

function renderPage(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <AiPanelProvider>
              <AnalysisPage />
            </AiPanelProvider>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockListByTextId.mockReset();
});

describe('AnalysisPage', () => {
  it('shows an empty state when no transcription scope is available', () => {
    renderPage('/analysis');
    expect(screen.getByText('还没有可分析的转写记录。请先打开转写工作台。')).toBeTruthy();
  });

  it('selects the deep-linked unit in the analysis runtime', async () => {
    mockListByTextId.mockResolvedValue([
      {
        id: 'uid-9',
        textId: 'tid-1',
        mediaId: 'mid-1',
        startTime: 0,
        endTime: 1,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    renderPage('/analysis?tab=embedding&textId=tid-1&mediaId=mid-1&unitId=uid-9');
    expect(await screen.findByTestId('analysis-runtime', {}, { timeout: 4000 })).toHaveTextContent(
      'uid-9',
    );
  });
});
