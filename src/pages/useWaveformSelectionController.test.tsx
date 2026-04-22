// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
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

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerUnitDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerUnitDocType;
}

function segmentToTimelineView(s: LayerUnitDocType): TimelineUnitView {
  return {
    id: s.id,
    kind: 'segment',
    layerRole: s.unitId ? 'referring' : 'independent',
    mediaId: s.mediaId ?? '',
    layerId: s.layerId ?? '',
    startTime: s.startTime,
    endTime: s.endTime,
    text: '',
    ...(s.speakerId ? { speakerId: s.speakerId } : {}),
    ...(s.unitId ? { parentUnitId: s.unitId } : {}),
  };
}

function unitToTimelineView(u: LayerUnitDocType, layerId: string): TimelineUnitView {
  return {
    id: u.id,
    kind: 'unit',
    layerRole: 'independent',
    mediaId: u.mediaId ?? '',
    layerId,
    startTime: u.startTime,
    endTime: u.endTime,
    text: '',
    ...(u.speakerId ? { speakerId: u.speakerId } : {}),
  };
}

function makeIndex(currentMediaUnits: TimelineUnitView[]): TimelineUnitViewIndex {
  const byId = new Map(currentMediaUnits.map((unit) => [unit.id, unit] as const));
  return {
    allUnits: currentMediaUnits,
    currentMediaUnits,
    byId,
    resolveBySemanticId: (id: string) => byId.get(id),
    byLayer: new Map(),
    getReferringUnits: () => [],
    totalCount: currentMediaUnits.length,
    currentMediaCount: currentMediaUnits.length,
    epoch: 1,
    fallbackToSegments: true,
    isComplete: true,
  };
}

describe('useWaveformSelectionController', () => {
  it('uses segment-backed waveform regions for independent layers', () => {
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-2', kind: 'segment' };
    const segs = [
      makeSegment('seg-2', 'layer-seg', 1, 2),
      makeSegment('seg-1', 'layer-seg', 0, 1),
    ].sort((a, b) => a.startTime - b.startTime);
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-seg',
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      layerById: new Map([['layer-seg', makeLayer('layer-seg', 'independent_boundary')]]),
      layerLinks: [],
      defaultTranscriptionLayerId: 'layer-seg',
      timelineUnitViewIndex: makeIndex(segs.map(segmentToTimelineView)),
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
    const segs = [
      makeSegment('seg-2', 'layer-seg', 1, 2),
      makeSegment('seg-1', 'layer-seg', 0, 1),
    ].sort((a, b) => a.startTime - b.startTime);

    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-dependent',
      layers: [independentLayer, dependentLayer],
      layerById: new Map([
        ['layer-seg', independentLayer],
        ['layer-dependent', dependentLayer],
      ]),
      layerLinks: [],
      defaultTranscriptionLayerId: 'layer-seg',
      timelineUnitViewIndex: makeIndex(segs.map(segmentToTimelineView)),
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
      id: 'utt-idx-1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 0, endTime: 2, text: 'utt-text',
    };
    const idx: TimelineUnitViewIndex = {
      allUnits: [segView, segView2, uttView],
      currentMediaUnits: [segView, segView2, uttView],
      byId: new Map([[segView.id, segView], [segView2.id, segView2], [uttView.id, uttView]]),
      resolveBySemanticId: (id: string) => (
        id === segView.id ? segView : id === segView2.id ? segView2 : id === uttView.id ? uttView : undefined
      ),
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
      layerLinks: [],
      defaultTranscriptionLayerId: 'layer-seg',
      timelineUnitViewIndex: idx,
      selectedTimelineUnit,
      selectedUnitIds: new Set(),
    }));

    expect(result.current.useSegmentWaveformRegions).toBe(true);
    expect(result.current.waveformTimelineItems.map((item) => item.id)).toEqual(['seg-idx-1', 'seg-idx-2']);
    expect(result.current.selectedWaveformRegionId).toBe('seg-idx-1');
  });

  it('uses index currentMediaUnits for unit mode when index is provided', () => {
    const uttView1: TimelineUnitView = {
      id: 'utt-1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 0, endTime: 1, text: 'hello',
    };
    const uttView2: TimelineUnitView = {
      id: 'utt-2', kind: 'unit', mediaId: 'media-1', layerId: 'layer-main',
      startTime: 1, endTime: 2, text: 'world',
    };
    const idx: TimelineUnitViewIndex = {
      allUnits: [uttView1, uttView2],
      currentMediaUnits: [uttView1, uttView2],
      byId: new Map([[uttView1.id, uttView1], [uttView2.id, uttView2]]),
      resolveBySemanticId: (id: string) => (id === uttView1.id ? uttView1 : id === uttView2.id ? uttView2 : undefined),
      byLayer: new Map([['layer-main', [uttView1, uttView2]]]),
      getReferringUnits: () => [],
      totalCount: 2,
      currentMediaCount: 2,
      epoch: 1,
      fallbackToSegments: false,
      isComplete: true,
    };
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-main', unitId: 'utt-2', kind: 'unit' };
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-main',
      layers: [makeLayer('layer-main')],
      layerById: new Map([['layer-main', makeLayer('layer-main')]]),
      layerLinks: [],
      defaultTranscriptionLayerId: 'layer-main',
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

  it('keeps unit waveform mode when timeline selection kind does not match', () => {
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-main', unitId: 'seg-1', kind: 'segment' };
    const units = [makeUnit('utt-1', 0, 1), makeUnit('utt-2', 1, 2)];
    const views = units.map((u) => unitToTimelineView(u, 'layer-main'));
    const { result } = renderHook(() => useWaveformSelectionController({
      activeLayerIdForEdits: 'layer-main',
      layers: [makeLayer('layer-main')],
      layerById: new Map([['layer-main', makeLayer('layer-main')]]),
      layerLinks: [],
      defaultTranscriptionLayerId: 'layer-main',
      timelineUnitViewIndex: makeIndex(views),
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
