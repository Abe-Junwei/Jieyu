// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../types/jieyuDbDocTypes';
import { createTimelineUnit } from '../hooks/transcription/transcriptionTypes';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';

const { mockUpsertSegmentContent, mockDeleteSegmentContent } = vi.hoisted(() => ({
  mockUpsertSegmentContent: vi.fn(
    async (_doc: LayerUnitContentDocType): Promise<void> => undefined,
  ),
  mockDeleteSegmentContent: vi.fn(async (_id: string): Promise<void> => undefined),
}));

vi.mock('../app/transcriptionServicesPageAccess', () => ({
  LayerSegmentationV2Service: {
    upsertSegmentContent: (doc: LayerUnitContentDocType) => mockUpsertSegmentContent(doc),
    deleteSegmentContent: (id: string) => mockDeleteSegmentContent(id),
  },
  snapshotLayerSegmentGraphByLayerIds: vi.fn(async () => ({
    units: [] as LayerUnitDocType[],
    contents: [] as LayerUnitContentDocType[],
    links: [] as { id: string }[],
  })),
  restoreLayerSegmentGraphSnapshot: vi.fn(async () => undefined),
}));

function makeLayer(id: string, constraint: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    ...(constraint != null ? { constraint } : {}),
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(
  id: string,
  layerId: string,
  startTime: number,
  endTime: number,
): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerUnitDocType;
}

type HookInput = Parameters<typeof useTranscriptionSegmentBridgeController>[0];

function makeInput(overrides: Partial<HookInput> = {}): HookInput {
  const layer = makeLayer('L1', 'independent_boundary');
  const segment = makeSegment('seg-1', 'L1', 0, 10);
  return {
    focusedLayerId: '',
    selectedTimelineUnit: createTimelineUnit('L-from-unit', 'u1', 'unit'),
    firstTranscriptionLayerId: 'L-fallback',
    layerById: new Map([[layer.id, layer]]),
    layerLinks: [],
    independentLayerIds: new Set<string>(),
    segmentsByLayer: new Map([[layer.id, [segment]]]),
    segmentContentByLayer: new Map([[layer.id, new Map<string, LayerUnitContentDocType>()]]),
    reloadSegments: vi.fn(async () => undefined),
    reloadSegmentContents: vi.fn(async () => undefined),
    selectTimelineUnit: vi.fn(),
    segmentUndoRef: { current: null },
    ...overrides,
  } as HookInput;
}

describe('useTranscriptionSegmentBridgeController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses resolveTimelineLayerIdFallback order so timeline unit layer beats firstTranscriptionLayerId', () => {
    const { result } = renderHook(() =>
      useTranscriptionSegmentBridgeController(
        makeInput({
          focusedLayerId: '',
          selectedTimelineUnit: createTimelineUnit('L-from-unit', 'u1', 'unit'),
          firstTranscriptionLayerId: 'L-fallback',
        }),
      ),
    );
    expect(result.current.activeLayerIdForEdits).toBe('L-from-unit');
  });

  it('marks independent-boundary layers as segment-timeline routes with independent-segment edit mode', () => {
    const layer = makeLayer('L1', 'independent_boundary');
    const { result } = renderHook(() =>
      useTranscriptionSegmentBridgeController(
        makeInput({
          layerById: new Map([[layer.id, layer]]),
          selectedTimelineUnit: null,
          focusedLayerId: layer.id,
          firstTranscriptionLayerId: layer.id,
        }),
      ),
    );
    const routing = result.current.resolveSegmentRoutingForLayer(layer.id);
    expect(routing.usesSegmentTimeline).toBe(true);
    expect(routing.sourceLayerId).toBe(layer.id);
    expect(routing.editMode).toBe('independent-segment');
  });

  it('persists trimmed segment text via LayerSegmentationV2Service and reloads segment contents', async () => {
    const layer = makeLayer('L1', 'independent_boundary');
    const segment = makeSegment('seg-1', 'L1', 0, 10);
    const reloadSegmentContents = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useTranscriptionSegmentBridgeController(
        makeInput({
          layerById: new Map([[layer.id, layer]]),
          segmentsByLayer: new Map([[layer.id, [segment]]]),
          reloadSegmentContents,
          selectedTimelineUnit: null,
          focusedLayerId: layer.id,
          firstTranscriptionLayerId: layer.id,
        }),
      ),
    );

    await act(async () => {
      await result.current.saveSegmentContentForLayer('seg-1', layer.id, '  hello  ');
    });

    expect(mockUpsertSegmentContent).toHaveBeenCalledTimes(1);
    const firstCall = mockUpsertSegmentContent.mock.calls[0];
    expect(firstCall).toBeDefined();
    const written = firstCall![0];
    expect(written.text).toBe('hello');
    expect(written.unitId).toBe('seg-1');
    expect(written.layerId).toBe(layer.id);
    expect(reloadSegmentContents).toHaveBeenCalled();
  });

  it('deletes existing segment content when save value trims to empty', async () => {
    const layer = makeLayer('L1', 'independent_boundary');
    const segment = makeSegment('seg-1', 'L1', 0, 10);
    const existing: LayerUnitContentDocType = {
      id: 'content-1',
      textId: segment.textId,
      unitId: 'seg-1',
      layerId: layer.id,
      modality: 'text',
      text: 'old',
      sourceType: 'human',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    };
    const contentMap = new Map<string, LayerUnitContentDocType>([['seg-1', existing]]);
    const reloadSegmentContents = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useTranscriptionSegmentBridgeController(
        makeInput({
          layerById: new Map([[layer.id, layer]]),
          segmentsByLayer: new Map([[layer.id, [segment]]]),
          segmentContentByLayer: new Map([[layer.id, contentMap]]),
          reloadSegmentContents,
          selectedTimelineUnit: null,
          focusedLayerId: layer.id,
          firstTranscriptionLayerId: layer.id,
        }),
      ),
    );

    await act(async () => {
      await result.current.saveSegmentContentForLayer('seg-1', layer.id, '   ');
    });

    expect(mockDeleteSegmentContent).toHaveBeenCalledWith('content-1');
    expect(mockUpsertSegmentContent).not.toHaveBeenCalled();
    expect(reloadSegmentContents).toHaveBeenCalled();
  });
});
