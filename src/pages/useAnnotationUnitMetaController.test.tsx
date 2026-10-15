// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, t } from '../i18n';

const { mockSaveTurn } = vi.hoisted(() => ({
  mockSaveTurn: vi.fn(),
}));

vi.mock('./annotation/saveAnnotationUnitMeta', async () => {
  const actual = await vi.importActual<typeof import('./annotation/saveAnnotationUnitMeta')>(
    './annotation/saveAnnotationUnitMeta',
  );
  return { ...actual, saveAnnotationUnitTurn: mockSaveTurn };
});

import { useAnnotationUnitMetaController } from './useAnnotationUnitMetaController';

const turn = { addressee: '', ungrammatical: false, actualForm: 'a', targetForm: '' };

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(LocaleProvider, {
      locale: 'zh-CN',
      children: createElement(QueryClientProvider, { client }, children),
    });
  };
}

describe('useAnnotationUnitMetaController onSaveTurn', () => {
  beforeEach(() => {
    mockSaveTurn.mockReset();
  });

  it('reloads after the write even when focus has already moved', async () => {
    let release: () => void = () => {};
    mockSaveTurn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const reloadWorkspace = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ focusedUnitId }: { focusedUnitId: string }) =>
        useAnnotationUnitMetaController({
          textId: 'text-1',
          focusedUnitId,
          rows: [],
          reloadWorkspace,
        }),
      { wrapper: createWrapper(), initialProps: { focusedUnitId: 'unit-1' } },
    );

    act(() => {
      result.current.onSaveTurn(turn);
    });
    rerender({ focusedUnitId: 'unit-2' });
    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(reloadWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(result.current.saveNotice.kind).not.toBe('error');
    expect(mockSaveTurn).toHaveBeenCalledTimes(1);
  });

  it('says the view is stale when reload fails and focus is still on the unit', async () => {
    mockSaveTurn.mockResolvedValue(undefined);
    const reloadWorkspace = vi.fn(async () => {
      throw new Error('snapshot down');
    });
    const { result } = renderHook(
      () =>
        useAnnotationUnitMetaController({
          textId: 'text-1',
          focusedUnitId: 'unit-1',
          rows: [],
          reloadWorkspace,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.onSaveTurn(turn);
    });

    await waitFor(() => {
      expect(result.current.saveNotice).toEqual({
        kind: 'saved',
        message: t('zh-CN', 'workspace.annotation.writtenViewStale'),
      });
    });
    expect(mockSaveTurn).toHaveBeenCalledTimes(1);
  });
});
