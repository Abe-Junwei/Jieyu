// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useLayerDeleteConfirm } from './useLayerDeleteConfirm';

const NOW = new Date().toISOString();

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
  it('deletes directly without showing confirm when layer has no content', async () => {
    const deleteLayer = vi.fn<(id: string, options?: { keepUtterances?: boolean }) => Promise<void>>().mockResolvedValue();
    const deleteLayerWithoutConfirm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue();

    const { result } = renderHook(() => useLayerDeleteConfirm({
      deletableLayers: [makeLayer()],
      checkLayerHasContent: vi.fn(async () => 0),
      deleteLayer,
      deleteLayerWithoutConfirm,
    }));

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
    }));

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
});
