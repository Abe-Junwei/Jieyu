// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type LayerDocType, type LayerUnitContentDocType, type LayerUnitDocType } from '../db';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import { segmentToView } from '../hooks/transcription/timelineUnitView';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { useTranscriptionSegmentBatchMerge } from './useTranscriptionSegmentBatchMerge';

const NOW = '2026-03-24T00:00:00.000Z';
const LAYER_ID = 'layer-seg';
const MEDIA_ID = 'media-1';

function makeSegment(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: MEDIA_ID,
    layerId: LAYER_ID,
    startTime,
    endTime,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

function makeContent(id: string, segmentId: string, text: string): LayerUnitContentDocType {
  return {
    id,
    textId: 'text-1',
    layerId: LAYER_ID,
    segmentId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitContentDocType;
}

async function readSegments() {
  const segments = await LayerSegmentationV2Service.listSegmentsByLayerMedia(LAYER_ID, MEDIA_ID);
  const texts = new Map<string, string[]>();
  for (const segment of segments) {
    const contents = await LayerSegmentationV2Service.listSegmentContents(segment.id);
    texts.set(
      segment.id,
      contents.map((content) => content.text ?? ''),
    );
  }
  return {
    rows: segments.map((segment) => [segment.id, segment.startTime, segment.endTime] as const),
    texts,
  };
}

function renderBatchMerge(segments: LayerUnitDocType[]) {
  const seen: Array<Awaited<ReturnType<typeof readSegments>>> = [];
  const reloadSegments = vi.fn(async () => {
    seen.push(await readSegments());
  });
  const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
  const pushUndo = vi.fn();
  const selectTimelineUnit = vi.fn();
  const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
  const generation = { current: 0 };
  const pendingView = { current: null };
  const noteViewStale = { current: () => undefined };
  const { result } = renderHook(() =>
    useTranscriptionSegmentBatchMerge({
      activeLayerIdForEdits: LAYER_ID,
      resolveSegmentRoutingForLayer: () => ({
        layer: { id: LAYER_ID } as LayerDocType,
        segmentSourceLayer: { id: LAYER_ID } as LayerDocType,
        sourceLayerId: LAYER_ID,
        editMode: 'independent-segment',
      }),
      pushUndo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      selectTimelineUnit,
      createSegmentTarget: (unitId, layerIdOverride) => ({
        layerId: layerIdOverride ?? LAYER_ID,
        unitId,
        kind: 'segment',
      }),
      unitsOnCurrentMedia: segments.map((segment) => segmentToView(segment, () => '')),
      getUnitDocById: () => undefined,
      findUnitDocContainingRange: () => undefined,
      setSaveState,
      mergeSelectedUnits: vi.fn(async () => undefined),
      segmentMutationReloadGenRef: generation,
      pendingView,
      noteViewStale,
    }),
  );
  return {
    merge: result.current,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    pushUndo,
    selectTimelineUnit,
    setSaveState,
    seen,
  };
}

describe('useTranscriptionSegmentBatchMerge persistence and view', () => {
  beforeEach(async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('reloads the merged span after a successful chain merge', async () => {
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-1', 0, 1));
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-2', 1, 2));
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-3', 2, 4));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-1', 'seg-1', '甲'));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-2', 'seg-2', '乙'));
    const harness = renderBatchMerge([
      makeSegment('seg-1', 0, 1),
      makeSegment('seg-2', 1, 2),
      makeSegment('seg-3', 2, 4),
    ]);

    await act(async () => {
      await harness.merge(new Set(['seg-1', 'seg-2', 'seg-3']));
    });

    expect(harness.seen.at(-1)?.rows).toEqual([['seg-1', 0, 4]]);
    expect(harness.seen.at(-1)?.texts.get('seg-1')).toEqual(['甲']);
    expect(harness.seen.at(-1)?.texts.has('seg-2')).toBe(false);
    expect(harness.pushUndo).toHaveBeenCalledWith('批量合并句段');
    expect(harness.refreshSegmentUndoSnapshot).toHaveBeenCalledTimes(2);
    expect(harness.selectTimelineUnit).toHaveBeenCalledWith({
      layerId: LAYER_ID,
      unitId: 'seg-1',
      kind: 'segment',
    });
    expect(harness.setSaveState).not.toHaveBeenCalled();
  });

  it('reloads the original segments when a later delete in the chain fails', async () => {
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-1', 0, 1));
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-2', 1, 2));
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-3', 2, 4));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-1', 'seg-1', '甲'));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-2', 'seg-2', '乙'));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-3', 'seg-3', '丙'));
    const fail = (primKey: string) => {
      if (primKey === 'seg-3') throw new Error('cascade failed');
    };
    db.layer_units.hook('deleting', fail);
    const harness = renderBatchMerge([
      makeSegment('seg-1', 0, 1),
      makeSegment('seg-2', 1, 2),
      makeSegment('seg-3', 2, 4),
    ]);
    try {
      await expect(
        act(async () => {
          await harness.merge(new Set(['seg-1', 'seg-2', 'seg-3']));
        }),
      ).rejects.toThrow(/cascade failed/);
    } finally {
      db.layer_units.hook('deleting').unsubscribe(fail);
    }

    expect(harness.seen.at(-1)?.rows).toEqual([
      ['seg-1', 0, 1],
      ['seg-2', 1, 2],
      ['seg-3', 2, 4],
    ]);
    expect(harness.seen.at(-1)?.texts.get('seg-1')).toEqual(['甲']);
    expect(harness.seen.at(-1)?.texts.get('seg-2')).toEqual(['乙']);
    expect(harness.seen.at(-1)?.texts.get('seg-3')).toEqual(['丙']);
    expect(harness.reloadSegments).toHaveBeenCalledTimes(1);
    expect(harness.refreshSegmentUndoSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.pushUndo).toHaveBeenCalledWith('批量合并句段');
    expect(harness.selectTimelineUnit).not.toHaveBeenCalled();
    expect(harness.setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '批量合并句段失败：cascade failed',
      }),
    );
  });

  it('reloads the surviving rows when a selected segment is already gone', async () => {
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-1', 0, 1));
    await LayerSegmentationV2Service.createSegment(makeSegment('seg-2', 1, 2));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-1', 'seg-1', '甲'));
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent('cnt-2', 'seg-2', '乙'));
    const harness = renderBatchMerge([
      makeSegment('seg-1', 0, 1),
      makeSegment('seg-2', 1, 2),
      makeSegment('seg-3', 2, 4),
    ]);

    await expect(
      act(async () => {
        await harness.merge(new Set(['seg-1', 'seg-2', 'seg-3']));
      }),
    ).rejects.toThrow(/not found/);

    expect(harness.seen.at(-1)?.rows).toEqual([
      ['seg-1', 0, 1],
      ['seg-2', 1, 2],
    ]);
    expect(harness.seen.at(-1)?.texts.get('seg-1')).toEqual(['甲']);
    expect(harness.seen.at(-1)?.texts.get('seg-2')).toEqual(['乙']);
    expect(harness.selectTimelineUnit).not.toHaveBeenCalled();
    const stored = await db.layer_units.get('seg-1');
    expect(stored?.endTime).toBe(1);
  });
});
