// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import type { TimelineUnitViewIndex } from './timelineUnitView';
import { useTimelineUnitViewIndex } from './useTimelineUnitViewIndex';

function makeUnit(id: string, mediaId: string): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId,
    startTime: 0,
    endTime: 1,
    createdAt: '',
    updatedAt: '',
    transcription: { default: `text-${id}` },
  };
}

describe('useTimelineUnitViewIndex', () => {
  it('reuses an injected index instead of rebuilding', () => {
    const existingIndex: TimelineUnitViewIndex = {
      allUnits: [],
      currentMediaUnits: [],
      byId: new Map(),
      resolveBySemanticId: () => undefined,
      byLayer: new Map(),
      getReferringUnits: () => [],
      totalCount: 0,
      currentMediaCount: 0,
      epoch: 7,
      fallbackToSegments: false,
      isComplete: false,
    };

    const { result } = renderHook(() => useTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: undefined,
      activeLayerIdForEdits: undefined,
      defaultTranscriptionLayerId: undefined,
      existingIndex,
      segmentsLoadComplete: false,
    }));

    expect(result.current).toBe(existingIndex);
  });

  it('builds an index from units when no existingIndex is given', () => {
    const u = makeUnit('u1', 'm1');
    const { result } = renderHook(() => useTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [u],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    }));

    expect(result.current.allUnits).toHaveLength(1);
    expect(result.current.allUnits[0]!.kind).toBe('unit');
    expect(result.current.totalCount).toBe(1);
    expect(result.current.epoch).toBeGreaterThan(0);
    expect(result.current.isComplete).toBe(true);
  });

  it('returns stable reference when inputs do not change', () => {
    const u = makeUnit('u1', 'm1');
    const units = [u];
    const segmentsByLayer = new Map();
    const segmentContentByLayer = new Map();

    const { result, rerender } = renderHook(() => useTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units,
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    }));

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.epoch).toBe(first.epoch);
  });

  it('rebuilds when units array changes', () => {
    const u1 = makeUnit('u1', 'm1');
    const u2 = makeUnit('u2', 'm1');
    let units: LayerUnitDocType[] = [u1];

    const { result, rerender } = renderHook(() => useTimelineUnitViewIndex({
      units,
      unitsOnCurrentMedia: units,
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    }));

    const first = result.current;
    expect(first.allUnits).toHaveLength(1);

    units = [u1, u2];
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.allUnits).toHaveLength(2);
    expect(result.current.epoch).toBeGreaterThan(first.epoch);
  });
});
