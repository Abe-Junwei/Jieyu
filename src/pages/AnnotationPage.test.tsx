// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';

const {
  mockListByTextId,
  mockListLayersByTextId,
  mockListTokensByUnitIds,
  mockUpdateTokenPos,
  mockUpdateTokenGloss,
  featureFlagState,
} = vi.hoisted(() => ({
  mockListByTextId: vi.fn(),
  mockListLayersByTextId: vi.fn(),
  mockListTokensByUnitIds: vi.fn(),
  mockUpdateTokenPos: vi.fn(),
  mockUpdateTokenGloss: vi.fn(),
  featureFlagState: { annotationPageEnabled: false },
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listByTextId: mockListByTextId,
      listTokensByUnitIds: mockListTokensByUnitIds,
      updateTokenPos: mockUpdateTokenPos,
      updateTokenGloss: mockUpdateTokenGloss,
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

const UNIT_ONE = {
  id: 'uid-1',
  textId: 'tid-1',
  mediaId: 'mid-1',
  startTime: 1.5,
  endTime: 2,
  createdAt: '',
  updatedAt: '',
  transcription: { default: 'hello world' },
};

const UNIT_TWO = {
  id: 'uid-2',
  textId: 'tid-1',
  mediaId: 'mid-1',
  startTime: 2,
  endTime: 3,
  createdAt: '',
  updatedAt: '',
  transcription: { default: 'next' },
};

function tokenRow(id: string, unitId: string, form: string, gloss: string, pos = '') {
  return {
    id,
    textId: 'tid-1',
    unitId,
    form: { default: form },
    gloss: { default: gloss },
    ...(pos.length > 0 ? { pos } : {}),
    tokenIndex: 0,
    createdAt: '',
    updatedAt: '',
  };
}

function seedWorkspace(tokens: unknown[], units: unknown[] = [UNIT_ONE]) {
  featureFlagState.annotationPageEnabled = true;
  mockListByTextId.mockResolvedValue(units);
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
  mockListTokensByUnitIds.mockImplementation(async () => tokens.map((row) => ({ ...row })));
  mockUpdateTokenPos.mockResolvedValue(undefined);
  mockUpdateTokenGloss.mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  mockListByTextId.mockReset();
  mockListLayersByTextId.mockReset();
  mockListTokensByUnitIds.mockReset();
  mockUpdateTokenPos.mockReset();
  mockUpdateTokenGloss.mockReset();
  featureFlagState.annotationPageEnabled = false;
});

describe('AnnotationPage', () => {
  it('keeps the placeholder panel when the feature flag is off', () => {
    renderPage('/annotation');
    expect(screen.getByRole('heading', { name: '标注工作台未开放' })).toBeTruthy();
    expect(screen.queryByTestId('annotation-workspace')).toBeNull();
  });

  it('renders IGT rows from the current text scope', async () => {
    seedWorkspace([
      tokenRow('tok-1', 'uid-1', 'hello', 'INTJ'),
      { ...tokenRow('tok-2', 'uid-1', 'world', 'N'), tokenIndex: 1 },
    ]);
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const row = await screen.findByTestId('annotation-igt-row-uid-1', {}, { timeout: 4000 });
    expect(row.textContent).toContain('hello');
    expect(row.textContent).toContain('INTJ');
    expect(row.textContent).toContain('暂无译文');
  });

  it('treats Space as play on a focused row and does not playToggle from an input', async () => {
    seedWorkspace([]);
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const workspace = await screen.findByTestId('annotation-workspace', {}, { timeout: 4000 });
    await screen.findByTestId('annotation-igt-row-uid-1', {}, { timeout: 4000 });
    fireEvent.keyDown(workspace, { key: ' ' });
    const status = screen.getByTestId('annotation-keyboard-status');
    expect(status.getAttribute('data-action')).toBe('playToggle');
    fireEvent.keyDown(workspace, { key: 'Enter' });
    expect(status.getAttribute('data-mode')).toBe('inputFocused');
    fireEvent.keyDown(workspace, { key: ' ' });
    expect(status.getAttribute('data-action')).toBe('insertSpace');
  });

  it('saves POS/gloss on Enter and readback replaces the row', async () => {
    const tokens: Array<{
      id: string;
      textId: string;
      unitId: string;
      form: { default: string };
      gloss?: Record<string, string>;
      pos?: string;
      tokenIndex: number;
      createdAt: string;
      updatedAt: string;
    }> = [tokenRow('tok-1', 'uid-1', 'hello', 'INTJ', 'X')];
    seedWorkspace(tokens);
    mockUpdateTokenGloss.mockImplementation(async (_id: string, gloss: string | null) => {
      const next = (gloss ?? '').trim();
      const current = tokens[0]!;
      tokens[0] = {
        ...current,
        gloss: next.length > 0 ? { default: next } : {},
      };
    });
    mockUpdateTokenPos.mockImplementation(async (_id: string, pos: string | null) => {
      const next = (pos ?? '').trim();
      const current = tokens[0]!;
      const { pos: _oldPos, ...rest } = current;
      tokens[0] = next.length > 0 ? { ...rest, pos: next } : rest;
    });
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const workspace = await screen.findByTestId('annotation-workspace', {}, { timeout: 4000 });
    await screen.findByTestId('annotation-igt-row-uid-1', {}, { timeout: 4000 });
    fireEvent.keyDown(workspace, { key: 'Enter' });
    const gloss = await screen.findByTestId('annotation-igt-gloss-tok-1');
    const pos = screen.getByTestId('annotation-igt-pos-tok-1');
    fireEvent.change(pos, { target: { value: 'N' } });
    fireEvent.change(gloss, { target: { value: 'greeting' } });
    fireEvent.keyDown(workspace, { key: 'Enter' });
    await waitFor(() => {
      expect(mockUpdateTokenPos).toHaveBeenCalledWith('tok-1', 'N');
      expect(mockUpdateTokenGloss).toHaveBeenCalledWith('tok-1', 'greeting', 'default');
      expect(screen.getByTestId('annotation-keyboard-status').getAttribute('data-save')).toBe(
        'saved',
      );
    });
    fireEvent.keyDown(workspace, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('annotation-igt-row-uid-1'));
    await waitFor(() => {
      expect(screen.getByTestId('annotation-igt-row-uid-1').textContent).toContain('greeting');
      expect(screen.getByTestId('annotation-igt-row-uid-1').textContent).toContain('N');
    });
  });

  it('keeps focus on the current row when Ctrl+Enter save fails', async () => {
    seedWorkspace(
      [tokenRow('tok-1', 'uid-1', 'hello', 'INTJ', 'X'), tokenRow('tok-2', 'uid-2', 'next', 'ADV')],
      [UNIT_ONE, UNIT_TWO],
    );
    mockUpdateTokenGloss.mockRejectedValue(new Error('write blocked'));
    renderPage('/annotation?textId=tid-1&mediaId=mid-1');
    const workspace = await screen.findByTestId('annotation-workspace', {}, { timeout: 4000 });
    await screen.findByTestId('annotation-igt-row-uid-1', {}, { timeout: 4000 });
    fireEvent.keyDown(workspace, { key: 'Enter' });
    const gloss = await screen.findByTestId('annotation-igt-gloss-tok-1');
    fireEvent.change(gloss, { target: { value: 'nope' } });
    fireEvent.keyDown(workspace, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      const status = screen.getByTestId('annotation-keyboard-status');
      expect(status.getAttribute('data-save')).toBe('error');
      expect(status.getAttribute('data-action')).toBe('commitNext');
    });
    expect(screen.getByTestId('annotation-igt-row-uid-1').className).toContain(
      'annotation-igt-row-focused',
    );
  });
});
