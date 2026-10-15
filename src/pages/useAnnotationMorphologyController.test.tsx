// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, t } from '../i18n';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';

const { mockListMorphemes, mockListLinks, mockListLexemes, mockSave } = vi.hoisted(() => ({
  mockListMorphemes: vi.fn(),
  mockListLinks: vi.fn(async () => []),
  mockListLexemes: vi.fn(async () => []),
  mockSave: vi.fn(),
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    units: {
      listMorphemesByTokenIds: mockListMorphemes,
      listTokenLexemeLinks: mockListLinks,
    },
    lexemes: { list: mockListLexemes },
  },
  presentTokenLexemeLink: vi.fn(),
}));

vi.mock('./annotation/saveAnnotationMorphemes', async () => {
  const actual = await vi.importActual<typeof import('./annotation/saveAnnotationMorphemes')>(
    './annotation/saveAnnotationMorphemes',
  );
  return { ...actual, saveAnnotationMorphemesForToken: mockSave };
});

import { useAnnotationMorphologyController } from './useAnnotationMorphologyController';

const morphRow = {
  id: 'morph-1',
  textId: 'text-1',
  unitId: 'unit-1',
  tokenId: 'tok-1',
  form: { default: 'cat' },
  gloss: { default: 'animal' },
  morphemeIndex: 0,
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

const secondMorphRow = {
  ...morphRow,
  id: 'morph-2',
  form: { default: 'kit' },
  morphemeIndex: 1,
};

const rows = [
  {
    id: 'unit-1',
    tokens: [{ id: 'tok-1', form: 'cat', gloss: '', pos: '', glossLang: 'default' }],
  },
] as unknown as AnnotationIgtRow[];

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(LocaleProvider, {
      locale: 'zh-CN',
      children: createElement(QueryClientProvider, { client }, children),
    });
  };
}

describe('useAnnotationMorphologyController onSaveMorphemes', () => {
  it('drops the committed draft and says the view is stale when refetch fails after the write', async () => {
    let failReload = false;
    mockListMorphemes.mockImplementation(async () => {
      if (failReload) throw new Error('view down');
      return [morphRow, secondMorphRow];
    });
    let releaseSave: () => void = () => {};
    mockSave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = () => {
            failReload = true;
            resolve();
          };
        }),
    );

    const { result } = renderHook(
      () =>
        useAnnotationMorphologyController({
          textId: 'text-1',
          rows,
          reloadWorkspace: vi.fn(),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.morphsByTokenId['tok-1']?.[0]?.form).toBe('cat');
    });

    act(() => {
      result.current.onMorphDraftChange('morph-1', 'form', 'dog');
      result.current.onMorphDraftChange('morph-2', 'form', 'kits');
    });
    act(() => {
      result.current.onSaveMorphemes('unit-1', 'tok-1');
    });
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.onMorphDraftChange('morph-1', 'form', 'dogs');
    });
    await act(async () => {
      releaseSave();
    });

    await waitFor(() => {
      expect(result.current.saveNotice).toEqual({
        kind: 'saved',
        message: t('zh-CN', 'workspace.annotation.writtenViewStale'),
      });
    });
    expect(result.current.drafts['morph-1']?.form).toBe('dogs');
    expect(result.current.drafts['morph-2']).toBeUndefined();
  });
});
