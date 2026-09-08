// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReadyWorkspaceDeepLinkEffects } from './useReadyWorkspaceDeepLinkEffects';

vi.mock('../hooks/transcription/transcriptionTextLookup', () => ({
  getTranscriptionTextById: vi.fn(async (textId: string) => textId.length > 0),
}));

function baseInput(
  overrides: Partial<Parameters<typeof useReadyWorkspaceDeepLinkEffects>[0]> = {},
) {
  return {
    searchParams: new URLSearchParams(),
    setSearchParams: vi.fn(),
    setActiveTextId: vi.fn(),
    loadSnapshot: vi.fn(async () => {}),
    showToast: vi.fn(),
    tfB: (key: string) => key,
    phase: 'ready',
    units: [] as Array<{ id: string; textId: string; mediaId?: string; layerId?: string }>,
    layers: [] as Array<{ id: string; textId: string }>,
    mediaItems: [] as Array<{ id: string; textId: string }>,
    segmentsByLayer: {} as Record<string, Array<{ id: string }> | undefined>,
    segmentsLoadComplete: true,
    selectTimelineUnit: vi.fn(),
    setSelectedLayerId: vi.fn(),
    setFocusedLayerRowId: vi.fn(),
    setSelectedMediaId: vi.fn(),
    transcriptionLayers: [{ id: 'layer-b' }],
    activeTextId: null,
    ...overrides,
  } satisfies Parameters<typeof useReadyWorkspaceDeepLinkEffects>[0];
}

describe('useReadyWorkspaceDeepLinkEffects', () => {
  it('applies unit deep link against activeTextId when units[0] is a different project', async () => {
    const selectTimelineUnit = vi.fn();
    const setSearchParams = vi.fn();
    const setActiveTextId = vi.fn();
    const sharedUnits = [
      { id: 'unit-a', textId: 'text-a', mediaId: 'media-a', layerId: 'layer-a' },
      { id: 'unit-b', textId: 'text-b', mediaId: 'media-b', layerId: 'layer-b' },
    ];
    const sharedLayers = [
      { id: 'layer-a', textId: 'text-a' },
      { id: 'layer-b', textId: 'text-b' },
    ];
    const sharedMedia = [
      { id: 'media-a', textId: 'text-a' },
      { id: 'media-b', textId: 'text-b' },
    ];

    const { rerender } = renderHook(
      (input: Parameters<typeof useReadyWorkspaceDeepLinkEffects>[0]) =>
        useReadyWorkspaceDeepLinkEffects(input),
      {
        initialProps: baseInput({
          searchParams: new URLSearchParams('textId=text-b&unitId=unit-b&layerId=layer-b'),
          setSearchParams,
          setActiveTextId,
          activeTextId: null,
          units: sharedUnits,
          layers: sharedLayers,
          mediaItems: sharedMedia,
          selectTimelineUnit,
        }),
      },
    );

    await waitFor(() => {
      expect(setActiveTextId).toHaveBeenCalledWith('text-b');
    });

    rerender(
      baseInput({
        searchParams: new URLSearchParams(),
        setSearchParams,
        setActiveTextId,
        activeTextId: 'text-b',
        units: sharedUnits,
        layers: sharedLayers,
        mediaItems: sharedMedia,
        selectedUnitMedia: { id: 'media-b' },
        selectTimelineUnit,
      }),
    );

    await waitFor(() => {
      expect(selectTimelineUnit).toHaveBeenCalledWith({
        layerId: 'layer-b',
        unitId: 'unit-b',
        kind: 'unit',
      });
    });
  });
});
