// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../../db';
import { LayerSegmentQueryService } from '../../services/LayerSegmentQueryService';
import {
  mergeUnboundTimelineSegments,
  resolveSegmentTimelineSourceLayer,
  useLayerSegments,
  type SegmentTimelineHostLink,
} from './useLayerSegments';

function createLayer(
  overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'key' | 'layerType'>,
): LayerDocType {
  const now = '2026-04-21T00:00:00.000Z';
  const base = {
    id: overrides.id,
    textId: 'text-1',
    key: overrides.key,
    name: { 'zh-CN': overrides.id, en: overrides.id },
    languageId: 'zh-CN',
    modality: 'text' as const,
    createdAt: now,
    updatedAt: now,
    layerType: overrides.layerType,
    constraint: 'symbolic_association' as const,
  };
  if (overrides.layerType === 'transcription') {
    return { ...base, ...overrides, layerType: 'transcription' };
  }
  return { ...base, ...overrides, layerType: 'translation' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveSegmentTimelineSourceLayer', () => {
  it('falls back to next host link when preferred host is invalid', () => {
    const translation = createLayer({
      id: 'tl-1',
      key: 'tl1',
      layerType: 'translation',
      constraint: 'symbolic_association',
    });
    const transcriptionHost = createLayer({
      id: 'tr-host-1',
      key: 'tr1',
      layerType: 'transcription',
      constraint: 'independent_boundary',
    });

    const layerById = new Map<string, LayerDocType>([
      [translation.id, translation],
      [transcriptionHost.id, transcriptionHost],
    ]);

    const links: SegmentTimelineHostLink[] = [
      {
        layerId: translation.id,
        transcriptionLayerKey: 'missing-key',
        hostTranscriptionLayerId: 'missing-host',
        isPreferred: true,
      },
      {
        layerId: translation.id,
        transcriptionLayerKey: transcriptionHost.key,
        hostTranscriptionLayerId: transcriptionHost.id,
        isPreferred: false,
      },
    ];

    const source = resolveSegmentTimelineSourceLayer(translation, layerById, undefined, links);
    expect(source?.id).toBe(transcriptionHost.id);
  });
});

describe('mergeUnboundTimelineSegments', () => {
  it('keeps media-scoped rows and adds segments that were stored without a recording', () => {
    const now = '2026-04-21T00:00:00.000Z';
    const segment = (id: string, mediaId: string, startTime: number): LayerUnitDocType =>
      ({
        id,
        textId: 'text-1',
        mediaId,
        layerId: 'layer-1',
        startTime,
        endTime: startTime + 1,
        createdAt: now,
        updatedAt: now,
      }) as LayerUnitDocType;
    const bound = segment('seg-bound', 'media-1', 0);
    const free = segment('seg-free', '__unknown_media__', 2);
    const other = segment('seg-other', 'media-2', 1);
    expect(
      mergeUnboundTimelineSegments([bound], [bound, free, other]).map((row) => row.id),
    ).toEqual(['seg-bound', 'seg-free']);
  });
});

describe('useLayerSegments', () => {
  it('starts independent layer queries in parallel', async () => {
    const tr1 = createLayer({
      id: 'tr-1',
      key: 'tr1',
      layerType: 'transcription',
      constraint: 'independent_boundary',
    });
    const tr2 = createLayer({
      id: 'tr-2',
      key: 'tr2',
      layerType: 'transcription',
      constraint: 'independent_boundary',
    });

    const listSpy = vi
      .spyOn(LayerSegmentQueryService, 'listSegmentsByLayerMedia')
      .mockImplementation(() => new Promise<LayerUnitDocType[]>((_resolve) => {}));
    vi.spyOn(LayerSegmentQueryService, 'listSegmentsByLayerId').mockResolvedValue([]);

    const { unmount } = renderHook(() => useLayerSegments([tr1, tr2], 'media-1', tr1.id));

    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2));

    const firstTwoLayerIds = listSpy.mock.calls.slice(0, 2).map((args) => args[0]);
    expect(new Set(firstTwoLayerIds)).toEqual(new Set([tr1.id, tr2.id]));

    unmount();
  });
});
