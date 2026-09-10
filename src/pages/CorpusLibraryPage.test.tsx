// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import { resetCorpusBasketSessionForTests } from './corpusBasketSession';
import { CORPUS_VIEW_STATE_KEY, resetCorpusViewStateForTests } from './corpusViewState';

const { mockListCorpusIndexByTextId, featureFlagState } = vi.hoisted(() => ({
  mockListCorpusIndexByTextId: vi.fn(),
  featureFlagState: { corpusLibraryPageEnabled: false },
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listCorpusIndexByTextId: mockListCorpusIndexByTextId,
    },
  },
}));

vi.mock('../ai/config/featureFlags', () => ({
  featureFlags: {
    get corpusLibraryPageEnabled() {
      return featureFlagState.corpusLibraryPageEnabled;
    },
  },
}));

import { CorpusLibraryPage } from './CorpusLibraryPage';

const SAMPLE_UNITS = [
  {
    id: 'uid-1',
    textId: 'tid-1',
    mediaId: 'mid-1',
    layerId: '',
    startTime: 1.5,
    endTime: 2,
    defaultText: 'first sentence about tone',
  },
  {
    id: 'uid-2',
    textId: 'tid-1',
    mediaId: 'mid-1',
    layerId: '',
    startTime: 3,
    endTime: 4,
    defaultText: 'second sentence',
  },
  {
    id: 'uid-3',
    textId: 'tid-1',
    mediaId: 'mid-2',
    layerId: '',
    startTime: 0.5,
    endTime: 1,
    defaultText: 'other media sentence',
  },
];

function renderPage(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <CorpusLibraryPage />
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockListCorpusIndexByTextId.mockReset();
  featureFlagState.corpusLibraryPageEnabled = false;
  resetCorpusBasketSessionForTests();
  resetCorpusViewStateForTests();
  vi.unstubAllGlobals();
});

describe('CorpusLibraryPage', () => {
  it('keeps the placeholder panel when the feature flag is off', () => {
    renderPage('/corpus');
    expect(screen.getByRole('heading', { name: '语料库未开放' })).toBeTruthy();
    expect(screen.queryByTestId('corpus-library-workspace')).toBeNull();
  });

  it('lists units from every media in the current text', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const other = await screen.findByTestId('corpus-library-unit-uid-3', {}, { timeout: 4000 });
    expect(screen.getByTestId('corpus-library-unit-uid-1')).toBeTruthy();
    expect(screen.getByTestId('corpus-library-unit-uid-2')).toBeTruthy();
    expect(other.textContent).toContain('mid-2');
  });

  it('toggles a workset unit and readback after remount', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const row = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    const checkbox = row.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox as HTMLInputElement);
    expect((row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);

    cleanup();
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const restored = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    expect((restored.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('keeps the workset when media scope changes', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const row = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    fireEvent.click(row.querySelector('input[type="checkbox"]') as HTMLInputElement);
    cleanup();

    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-2');
    const nextRow = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    expect((nextRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('clears the workset when text scope changes', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const row = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    fireEvent.click(row.querySelector('input[type="checkbox"]') as HTMLInputElement);
    cleanup();

    mockListCorpusIndexByTextId.mockResolvedValue([
      {
        id: 'uid-9',
        textId: 'tid-9',
        mediaId: 'mid-9',
        layerId: '',
        startTime: 0,
        endTime: 1,
        defaultText: 'other text',
      },
    ]);
    renderPage('/corpus?textId=tid-9&mediaId=mid-9');
    const nextRow = await screen.findByTestId('corpus-library-unit-uid-9', {}, { timeout: 4000 });
    expect((nextRow.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('writes filter text to corpusViewState only', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const filter = await screen.findByLabelText('筛选句段', {}, { timeout: 4000 });
    fireEvent.change(filter, { target: { value: 'tone' } });
    expect(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY)).toBe(
      JSON.stringify({ filterText: 'tone' }),
    );
    expect(sessionStorage.getItem('corpusBasket')).toBeNull();
    expect(screen.queryByTestId('corpus-library-unit-uid-2')).toBeNull();
    expect(screen.getByTestId('corpus-library-unit-uid-1')).toBeTruthy();
  });

  it('copies basket markdown even when the list filter hides a selected unit', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const first = await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    const second = screen.getByTestId('corpus-library-unit-uid-2');
    fireEvent.click(first.querySelector('input[type="checkbox"]') as HTMLInputElement);
    fireEvent.click(second.querySelector('input[type="checkbox"]') as HTMLInputElement);
    fireEvent.change(screen.getByLabelText('筛选句段'), { target: { value: 'tone' } });
    expect(screen.queryByTestId('corpus-library-unit-uid-2')).toBeNull();
    fireEvent.click(screen.getByTestId('corpus-library-copy-markdown'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/transcription?textId=tid-1&mediaId=mid-1&unitId=uid-1'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/transcription?textId=tid-1&mediaId=mid-1&unitId=uid-2'),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('second sentence'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('00:01.5-00:02.0'));
  });

  it('does not write the clipboard when the workset is empty', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    await screen.findByTestId('corpus-library-unit-uid-1', {}, { timeout: 4000 });
    expect(screen.getByTestId('corpus-library-copy-plain')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('corpus-library-copy-plain'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('persists and restores list scroll in corpusViewState without dual-writing the URL', async () => {
    featureFlagState.corpusLibraryPageEnabled = true;
    mockListCorpusIndexByTextId.mockResolvedValue(SAMPLE_UNITS);
    window.sessionStorage.setItem(
      CORPUS_VIEW_STATE_KEY,
      JSON.stringify({ filterText: 'tone', listScrollTop: 120 }),
    );
    renderPage('/corpus?textId=tid-1&mediaId=mid-1');
    const body = await screen.findByTestId('corpus-library-body', {}, { timeout: 4000 });
    await waitFor(() => {
      expect(body.scrollTop).toBe(120);
    });
    body.scrollTop = 64;
    fireEvent.scroll(body);
    expect(JSON.parse(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY) ?? '{}')).toEqual({
      filterText: 'tone',
      listScrollTop: 64,
    });
    expect(sessionStorage.getItem('corpusBasket')).toBeNull();
    expect(window.location.search).not.toContain('corpusViewState');
    expect(window.location.search).not.toContain('listScrollTop');
  });
});
