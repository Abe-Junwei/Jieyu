// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { LayerDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { useLayerDeleteConfirm } from './useLayerDeleteConfirm';

const NOW = new Date().toISOString();

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
  return {
    id: 'trc-1',
    textId: 't1',
    key: 'trc_cmn_001',
    name: { zho: '转写 · 普通话' },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerDocType;
}

describe('useLayerDeleteConfirm', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleProvider locale="zh-CN">{children}</LocaleProvider>
  );

  it('deletes directly without showing confirm when layer has no content', async () => {
    const deleteLayer = vi.fn<(id: string, options?: { keepUtterances?: boolean }) => Promise<void>>().mockResolvedValue();
    const deleteLayerWithoutConfirm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();

    const { result } = renderHook(() => useLayerDeleteConfirm({
      deletableLayers: [makeLayer()],
      checkLayerHasContent: vi.fn(async () => 0),
      deleteLayer,
      deleteLayerWithoutConfirm,
    }), { wrapper });

    await act(async () => {
      await result.current.requestDeleteLayer('trc-1');
    });

    expect(deleteLayerWithoutConfirm).toHaveBeenCalledWith('trc-1');
    expect(deleteLayer).not.toHaveBeenCalled();
    expect(result.current.deleteLayerConfirm).toBeNull();
  });

  it('opens confirm dialog when layer has content and confirms with keepUtterances option', async () => {
    const deleteLayer = vi.fn<(id: string, options?: { keepUtterances?: boolean }) => Promise<void>>().mockResolvedValue();
    const deleteLayerWithoutConfirm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();

    const { result } = renderHook(() => useLayerDeleteConfirm({
      deletableLayers: [makeLayer()],
      checkLayerHasContent: vi.fn(async () => 3),
      deleteLayer,
      deleteLayerWithoutConfirm,
    }), { wrapper });

    await act(async () => {
      await result.current.requestDeleteLayer('trc-1');
    });

    expect(result.current.deleteLayerConfirm).not.toBeNull();
    expect(result.current.deleteLayerConfirm?.layerId).toBe('trc-1');
    expect(result.current.deleteLayerConfirm?.textCount).toBe(3);

    act(() => {
      result.current.setDeleteConfirmKeepUtterances(true);
    });

    await act(async () => {
      await result.current.confirmDeleteLayer();
    });

    expect(deleteLayer).toHaveBeenCalledWith('trc-1', { keepUtterances: true });
    expect(result.current.deleteLayerConfirm).toBeNull();
    expect(result.current.deleteConfirmKeepUtterances).toBe(false);
  });

  it('keeps a newer confirmation open when an older delete resolves later', async () => {
    const firstDelete = createDeferred<void>();
    const deleteLayer = vi.fn<(id: string, options?: { keepUtterances?: boolean }) => Promise<void>>()
      .mockImplementationOnce(() => firstDelete.promise)
      .mockResolvedValue(undefined);
    const deleteLayerWithoutConfirm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();

    const { result } = renderHook(() => useLayerDeleteConfirm({
      deletableLayers: [
        makeLayer({ id: 'trc-1' }),
        makeLayer({ id: 'trc-2', key: 'trc_cmn_002', name: { zho: '转写 · 普通话 2' } }),
      ],
      checkLayerHasContent: vi.fn(async () => 2),
      deleteLayer,
      deleteLayerWithoutConfirm,
    }), { wrapper });

    await act(async () => {
      await result.current.requestDeleteLayer('trc-1');
    });

    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.confirmDeleteLayer();
    });

    await act(async () => {
      await result.current.requestDeleteLayer('trc-2');
    });

    expect(result.current.deleteLayerConfirm?.layerId).toBe('trc-2');

    firstDelete.resolve();
    await act(async () => {
      await confirmPromise;
    });

    expect(result.current.deleteLayerConfirm?.layerId).toBe('trc-2');
    expect(result.current.deleteConfirmKeepUtterances).toBe(false);
  });

  it('opens confirm with warning for deleting last transcription layer while translation exists, even with zero content', async () => {
    const deleteLayer = vi.fn<(id: string, options?: { keepUtterances?: boolean }) => Promise<void>>().mockResolvedValue();
    const deleteLayerWithoutConfirm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();

    const { result } = renderHook(() => useLayerDeleteConfirm({
      deletableLayers: [
        makeLayer({ id: 'trc-1', layerType: 'transcription' }),
        makeLayer({ id: 'trl-1', key: 'trl_eng_001', layerType: 'translation' }),
      ],
      checkLayerHasContent: vi.fn(async () => 0),
      deleteLayer,
      deleteLayerWithoutConfirm,
    }), { wrapper });

    await act(async () => {
      await result.current.requestDeleteLayer('trc-1');
    });

    expect(deleteLayerWithoutConfirm).not.toHaveBeenCalled();
    expect(result.current.deleteLayerConfirm?.layerId).toBe('trc-1');
    expect(result.current.deleteLayerConfirm?.warningMessage).toContain('仅剩一个转写层');
  });
});
