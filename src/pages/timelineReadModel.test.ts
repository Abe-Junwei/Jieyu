import { describe, expect, it } from 'vitest';
import type { TimelineUnitViewIndexWithEpoch } from '../hooks/useTimelineUnitViewIndex';
import { buildTimelineReadModel } from './timelineReadModel';

function createEmptyIndex(epoch = 1): TimelineUnitViewIndexWithEpoch {
  return {
    allUnits: [],
    currentMediaUnits: [],
    byId: new Map(),
    resolveBySemanticId: () => undefined,
    byLayer: new Map(),
    getReferringUnits: () => [],
    totalCount: 0,
    currentMediaCount: 0,
    epoch,
    fallbackToSegments: false,
    isComplete: true,
  };
}

describe('buildTimelineReadModel', () => {
  it('builds no_media acoustic state when no media url is present', () => {
    const model = buildTimelineReadModel({
      unitIndex: createEmptyIndex(7),
      transcriptionLayerIds: ['tr-1'],
      translationLayerIds: ['tl-1'],
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      playerIsReady: false,
      playerDuration: 0,
    });

    expect(model.epoch).toBe(7);
    expect(model.timeline.extentSec).toBe(0);
    expect(model.acoustic.state).toBe('no_media');
    expect(model.acoustic.globalState).toBe('no_media');
    expect(model.acoustic.shell).toBe('text-only');
  });

  it('builds pending_decode acoustic state when media url exists but decode is not ready', () => {
    const index = createEmptyIndex(2);
    const model = buildTimelineReadModel({
      unitIndex: { ...index, totalCount: 0 },
      transcriptionLayerIds: ['tr-1'],
      translationLayerIds: ['tl-1'],
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      selectedMediaUrl: 'blob:demo',
      playerIsReady: false,
      playerDuration: 0,
    });

    expect(model.acoustic.state).toBe('pending_decode');
    expect(model.acoustic.globalState).toBe('pending_decode');
    expect(model.acoustic.shell).toBe('text-only');
  });

  it('builds playable acoustic state when media is ready and duration is positive', () => {
    const index = createEmptyIndex(3);
    const model = buildTimelineReadModel({
      unitIndex: { ...index, totalCount: 1 },
      transcriptionLayerIds: ['tr-1'],
      translationLayerIds: ['tl-1'],
      selectedTimelineUnit: { layerId: 'tr-1', unitId: 'u-1', kind: 'unit' },
      selectedUnitIds: ['u-1'],
      selectedMediaId: 'm-1',
      selectedMediaUrl: 'blob:ready',
      playerIsReady: true,
      playerDuration: 88,
      zoomPxPerSec: 120,
      fitPxPerSec: 60,
      waveformScrollLeft: 33,
      logicalTimelineDurationSec: 90,
    });

    expect(model.acoustic.state).toBe('playable');
    expect(model.acoustic.globalState).toBe('playable');
    expect(model.acoustic.shell).toBe('waveform');
    expect(model.timeline.extentSec).toBe(88);
    expect(model.selection.selectedUnitIds).toEqual(['u-1']);
    expect(model.zoom.zoomPxPerSec).toBe(120);
    expect(model.zoom.logicalTimelineDurationSec).toBe(90);
  });

  it('uses orchestratorLayersCount with transcription/translation lengths for shell parity', () => {
    const index = createEmptyIndex(4);
    const model = buildTimelineReadModel({
      unitIndex: index,
      transcriptionLayerIds: [],
      translationLayerIds: [],
      orchestratorLayersCount: 2,
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      selectedMediaUrl: 'blob:parity',
      playerIsReady: false,
      playerDuration: 0,
    });

    expect(model.acoustic.shell).toBe('text-only');
    expect(model.acoustic.state).toBe('pending_decode');
    expect(model.acoustic.globalState).toBe('pending_decode');
  });

  it('splits contract vs global acoustic state when vertical view forces tier non-playable', () => {
    const index = createEmptyIndex(8);
    const model = buildTimelineReadModel({
      unitIndex: index,
      transcriptionLayerIds: ['tr-1'],
      translationLayerIds: ['tl-1'],
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      selectedMediaUrl: 'blob:ready',
      playerIsReady: true,
      playerDuration: 42,
      verticalViewEnabled: true,
    });

    expect(model.acoustic.shell).toBe('text-only');
    expect(model.acoustic.state).toBe('no_media');
    expect(model.acoustic.globalState).toBe('playable');
    expect(model.timeline.extentSec).toBe(42);
  });

  it('uses logical duration as extent in text-only timeline without media', () => {
    const index = createEmptyIndex(9);
    const model = buildTimelineReadModel({
      unitIndex: index,
      transcriptionLayerIds: ['tr-1'],
      translationLayerIds: ['tl-1'],
      selectedTimelineUnit: null,
      selectedUnitIds: [],
      logicalTimelineDurationSec: 27,
      playerIsReady: false,
      playerDuration: 0,
    });

    expect(model.timeline.extentSec).toBe(27);
  });
});
