// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView, TimelineUnitViewIndex } from '../hooks/timelineUnitView';
import { useWaveformSelectionController } from './useWaveformSelectionController';

function makeLayer(id: string, constraint?: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    ...(constraint ? { constraint } : {}),
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerSegmentDocType;
}

describe('useWaveformSelectionController', () => {
  it('uses segment-backed waveform regions for independent layers', () => {
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-2', kind: 'segment' };
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-seg',
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      layerById: new Map([['layer-seg', makeLayer('layer-seg', 'independent_boundary')]]),
      defaultTranscriptionLayerId: 'layer-seg',
      segmentsByLayer: new Map([['layer-seg', [
        makeSegment('seg-2', 'layer-seg', 1, 2),
        makeSegment('seg-1', 'layer-seg', 0, 1),
      ]]]),
      utterancesOnCurrentMedia: [makeUtterance('utt-1', 10, 11)],
      selectedTimelineUnit,
      selectedUnitIds: new Set(['seg-1', 'seg-2']),
    }));

    expect(result.current.useSegmentWaveformRegions).toBe(true);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['seg-1', 'seg-2']);
    expect(result.current.waveformRegions).toEqual([
      { id: 'seg-1', start: 0, end: 1 },
      { id: 'seg-2', start: 1, end: 2 },
    ]);
    expect(result.current.selectedWaveformRegionId).toBe('seg-2');
    expect(Array.from(result.current.waveformActiveRegionIds).sort()).toEqual(['seg-1', 'seg-2']);
    expect(result.current.selectedWaveformTimelineItem?.id).toBe('seg-2');
  });

  it('reuses parent segment timeline for dependent segment-backed layers while preserving dependent selection', () => {
    const independentLayer = makeLayer('layer-seg', 'independent_boundary');
    const dependentLayer = {
      ...makeLayer('layer-dependent'),
      parentLayerId: 'layer-seg',
    } as LayerDocType;
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-dependent', unitId: 'seg-2', kind: 'segment' };

    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-dependent',
      layers: [independentLayer, dependentLayer],
      layerById: new Map([
        ['layer-seg', independentLayer],
        ['layer-dependent', dependentLayer],
      ]),
      defaultTranscriptionLayerId: 'layer-seg',
      segmentsByLayer: new Map([['layer-seg', [
        makeSegment('seg-2', 'layer-seg', 1, 2),
        makeSegment('seg-1', 'layer-seg', 0, 1),
      ]]]),
      utterancesOnCurrentMedia: [makeUtterance('utt-1', 10, 11)],
      selectedTimelineUnit,
      selectedUnitIds: new Set(['seg-2']),
    }));

    expect(result.current.activeWaveformSegmentSourceLayer?.id).toBe('layer-seg');
    expect(result.current.useSegmentWaveformRegions).toBe(true);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['seg-1', 'seg-2']);
    expect(result.current.selectedWaveformRegionId).toBe('seg-2');
    expect(result.current.selectedWaveformTimelineItem?.id).toBe('seg-2');
  });

  it('uses index currentMediaUnits for segment-backed layers when index is provided', () => {
    const segView: TimelineUnitView = {
      id: 'seg-idx-1', kind: 'segment', mediaId: 'media-1', layerId: 'layer-seg',
      startTime: 0, endTime: 1, text: 'from-index',
    };
    const segView2: TimelineUnitView = {
      id: 'seg-idx-2', kind: 'segment', mediaId: 'media-1', layerId: 'layer-seg',
      startTime: 1, endTime: 2, text: 'from-index-2',
    };
    const uttView: TimelineUnitView = {
      id: 'utt-idx-1', kind: 'utterance', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 0, endTime: 2, text: 'utt-text',
    };
    const idx: TimelineUnitViewIndex = {
      allUnits: [segView, segView2, uttView],
      currentMediaUnits: [segView, segView2, uttView],
      byId: new Map([[segView.id, segView], [segView2.id, segView2], [uttView.id, uttView]]),
      byLayer: new Map([
        ['layer-seg', [segView, segView2]],
        ['layer-main', [uttView]],
      ]),
      getReferringUnits: () => [],
      totalCount: 3,
      currentMediaCount: 3,
      epoch: 1,
      fallbackToSegments: true,
      isComplete: true,
    };
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-idx-1', kind: 'segment' };
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-seg',
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      layerById: new Map([['layer-seg', makeLayer('layer-seg', 'independent_boundary')]]),
      defaultTranscriptionLayerId: 'layer-seg',
      segmentsByLayer: new Map(),
      utterancesOnCurrentMedia: [],
      timelineUnitViewIndex: idx,
      selectedTimelineUnit,
      selectedUnitIds: new Set(),
    }));

    expect(result.current.useSegmentWaveformRegions).toBe(true);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['seg-idx-1', 'seg-idx-2']);
    expect(result.current.selectedWaveformRegionId).toBe('seg-idx-1');
  });

  it('uses index currentMediaUnits for utterance mode when index is provided', () => {
    const uttView1: TimelineUnitView = {
      id: 'utt-1', kind: 'utterance', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 0, endTime: 1, text: 'hello',
    };
    const uttView2: TimelineUnitView = {
      id: 'utt-2', kind: 'utterance', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 1, endTime: 2, text: 'world',
    };
    const idx: TimelineUnitViewIndex = {
      allUnits: [uttView1, uttView2],
      currentMediaUnits: [uttView1, uttView2],
      byId: new Map([[uttView1.id, uttView1], [uttView2.id, uttView2]]),
      byLayer: new Map([['layer-main', [uttView1, uttView2]]]),
      getReferringUnits: () => [],
      totalCount: 2,
      currentMediaCount: 2,
      epoch: 1,
      fallbackToSegments: false,
      isComplete: true,
    };
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-main', unitId: 'utt-2', kind: 'utterance' };
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-main',
      layers: [makeLayer('layer-main')],
      layerById: new Map([['layer-main', makeLayer('layer-main')]]),
      defaultTranscriptionLayerId: 'layer-main',
      segmentsByLayer: new Map(),
      utterancesOnCurrentMedia: [],
      timelineUnitViewIndex: idx,
      selectedTimelineUnit,
      selectedUnitIds: new Set(['utt-2']),
    }));

    expect(result.current.useSegmentWaveformRegions).toBe(false);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
    expect(result.current.waveformRegions).toEqual([
      { id: 'utt-1', start: 0, end: 1 },
      { id: 'utt-2', start: 1, end: 2 },
    ]);
    expect(result.current.selectedWaveformRegionId).toBe('utt-2');
    expect(result.current.selectedWaveformTimelineItem?.id).toBe('utt-2');
  });

  it('keeps utterance waveform mode when timeline selection kind does not match', () => {
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-main', unitId: 'seg-1', kind: 'segment' };
    const utterances = [makeUtterance('utt-1', 0, 1), makeUtterance('utt-2', 1, 2)];
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-main',
      layers: [makeLayer('layer-main')],
      layerById: new Map([['layer-main', makeLayer('layer-main')]]),
      defaultTranscriptionLayerId: 'layer-main',
      segmentsByLayer: new Map(),
      utterancesOnCurrentMedia: utterances,
      selectedTimelineUnit,
      selectedUnitIds: new Set(['utt-2']),
    }));

    expect(result.current.useSegmentWaveformRegions).toBe(false);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
    expect(result.current.selectedWaveformRegionId).toBe('');
    expect(Array.from(result.current.waveformActiveRegionIds)).toEqual(['utt-2']);
    expect(result.current.selectedWaveformTimelineItem).toBeNull();
  });
});