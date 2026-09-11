// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimelineUnit } from '../hooks/transcription/transcriptionTypes';
import { getTranscriptionTextById } from '../hooks/transcription/transcriptionTextLookup';
import { useReadyWorkspaceDeepLinkEffects } from './useReadyWorkspaceDeepLinkEffects';

vi.mock('../hooks/transcription/transcriptionTextLookup', () => ({
  getTranscriptionTextById: vi.fn(),
}));

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    searchParams: new URLSearchParams(
      'textId=text-b&unitId=unit-b&mediaId=media-b&layerId=layer-b',
    ),
    setSearchParams: vi.fn(),
    setActiveTextId: vi.fn(),
    loadSnapshot: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    tfB: (key: string) => key,
    phase: 'loading',
    units: [
      { id: 'unit-a', textId: 'text-a', mediaId: 'media-a', layerId: 'layer-a' },
      { id: 'unit-b', textId: 'text-b', mediaId: 'media-b', layerId: 'layer-b' },
    ],
    layers: [
      { id: 'layer-a', textId: 'text-a' },
      { id: 'layer-b', textId: 'text-b' },
    ],
    mediaItems: [
      { id: 'media-a', textId: 'text-a' },
      { id: 'media-b', textId: 'text-b' },
    ],
    selectedUnitMedia: { id: '' },
    segmentsByLayer: {},
    segmentsLoadComplete: true,
    selectTimelineUnit: vi.fn(),
    setSelectedLayerId: vi.fn(),
    setFocusedLayerRowId: vi.fn(),
    setSelectedMediaId: vi.fn(),
    defaultTranscriptionLayerId: 'layer-b',
    selectedLayerId: 'layer-b',
    transcriptionLayers: [{ id: 'layer-b' }],
    activeTextId: 'text-b',
    ...overrides,
  };
}

describe('useReadyWorkspaceDeepLinkEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTranscriptionTextById).mockResolvedValue({ id: 'text-b' } as never);
  });

  it('passes textId to loadSnapshot when applying URL deep link', async () => {
    const input = makeInput();

    renderHook((props) => useReadyWorkspaceDeepLinkEffects(props), {
      initialProps: input,
    });

    await waitFor(() => {
      expect(input.setActiveTextId).toHaveBeenCalledWith('text-b');
      expect(input.loadSnapshot).toHaveBeenCalledWith('text-b');
    });
  });

  it('applies pending deep-link selection against activeTextId, not units[0].textId', async () => {
    const selectTimelineUnit = vi.fn();
    const setSelectedMediaId = vi.fn();
    const input = makeInput({ selectTimelineUnit, setSelectedMediaId });

    const { rerender } = renderHook((props) => useReadyWorkspaceDeepLinkEffects(props), {
      initialProps: input,
    });

    await waitFor(() => {
      expect(input.setActiveTextId).toHaveBeenCalledWith('text-b');
      expect(input.loadSnapshot).toHaveBeenCalledWith('text-b');
    });

    rerender({
      ...input,
      phase: 'ready',
      selectedUnitMedia: { id: 'media-b' },
    });

    await waitFor(() => {
      expect(selectTimelineUnit).toHaveBeenCalledWith(
        createTimelineUnit('layer-b', 'unit-b', 'unit'),
      );
    });
  });

  it('does not apply unit selection when activeTextId mismatches the deep-linked project', async () => {
    const selectTimelineUnit = vi.fn();
    const input = makeInput({ activeTextId: 'text-a', selectTimelineUnit });

    const { rerender } = renderHook((props) => useReadyWorkspaceDeepLinkEffects(props), {
      initialProps: input,
    });

    await waitFor(() => {
      expect(input.loadSnapshot).toHaveBeenCalledWith('text-b');
    });

    rerender({
      ...input,
      phase: 'ready',
      selectedUnitMedia: { id: 'media-b' },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(selectTimelineUnit).not.toHaveBeenCalledWith(
      createTimelineUnit('layer-b', 'unit-b', 'unit'),
    );
  });
});
