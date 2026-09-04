// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';

const { mockListByTextId, mockListLayersByTextId, mockListTokensByUnitIds, featureFlagState } =
  vi.hoisted(() => ({
    mockListByTextId: vi.fn(),
    mockListLayersByTextId: vi.fn(),
    mockListTokensByUnitIds: vi.fn(),
    featureFlagState: { annotationPageEnabled: false },
  }));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listByTextId: mockListByTextId,
      listTokensByUnitIds: mockListTokensByUnitIds,
    },
    layers: {
      listByTextId: mockListLayersByTextId,
    },
  },
}));

vi.mock('../ai/config/featureFlags', () => ({
  featureFlags: {
    get annotationPageEnabled() {
      return featureFlagState.annotationPageEnabled;
    },
  },
}));

import { AnnotationPage } from './AnnotationPage';

function renderPage(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <AnnotationPage />
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockListByTextId.mockReset();
  mockListLayersByTextId.mockReset();
  mockListTokensByUnitIds.mockReset();
  featureFlagState.annotationPageEnabled = false;
});

describe('AnnotationPage', () => {
  it('keeps the placeholder panel when the feature flag is off', () => {
    renderPage('/annotation');
    expect(screen.getByRole('heading', { name: '标注工作台未开放' })).toBeTruthy();
    expect(screen.queryByTestId('annotation-workspace')).toBeNull();
  });

  it('renders readonly IGT rows from the current text scope', async () => {
    featureFlagState.annotationPageEnabled = true;
    mockListByTextId.mockResolvedValue([
      {
        id: 'uid-1',
        textId: 'tid-1',
        mediaId: 'mid-1',
        startTime: 1.5,
        endTime: 2,
        createdAt: '',
        updatedAt: '',
        transcription: { default: 'hello world' },
      },
    ]);
    mockListLayersByTextId.mockResolvedValue([
      {
        id: 'lane-1',
        textId: 'tid-1',
        key: 'lane-1',
        name: { default: 'lane' },
        languageId: 'und',
        modality: 'text',
        createdAt: '',
        updatedAt: '',
        layerType: 'transcription',
      },
    ]);
    mockListTokensByUnitIds.mockResolvedValue([
      {
        id: 'tok-1',
        textId: 'tid-1',
        unitId: 'uid-1',
        form: { default: 'hello' },
        gloss: { default: 'INTJ' },
        tokenIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'tok-2',
        textId: 'tid-1',
        unitId: 'uid-1',
        form: { default: 'world' },
        gloss: { default: 'N' },
        tokenIndex: 1,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const row = await screen.findByTestId('annotation-igt-row-uid-1', {}, { timeout: 4000 });
    expect(row.textContent).toContain('hello');
    expect(row.textContent).toContain('INTJ');
    expect(row.textContent).toContain('暂无译文');
  });

  it('treats Space as play on a focused row and as insert after Enter', async () => {
    featureFlagState.annotationPageEnabled = true;
    mockListByTextId.mockResolvedValue([
      {
        id: 'uid-1',
        textId: 'tid-1',
        mediaId: 'mid-1',
        startTime: 0,
        endTime: 1,
        createdAt: '',
        updatedAt: '',
        transcription: { default: 'one' },
      },
    ]);
    mockListLayersByTextId.mockResolvedValue([]);
    mockListTokensByUnitIds.mockResolvedValue([]);
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const workspace = await screen.findByTestId('annotation-workspace', {}, { timeout: 4000 });
    fireEvent.keyDown(workspace, { key: ' ' });
    const status = screen.getByTestId('annotation-keyboard-status');
    expect(status.getAttribute('data-action')).toBe('playToggle');
    fireEvent.keyDown(workspace, { key: 'Enter' });
    expect(status.getAttribute('data-mode')).toBe('inputFocused');
    fireEvent.keyDown(workspace, { key: ' ' });
    expect(status.getAttribute('data-action')).toBe('insertSpace');
  });
});
