import { describe, expect, it } from 'vitest';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import { buildTimelineUnitViewIndex } from './timelineUnitView';

function seg(
  id: string,
  layerId: string,
  mediaId: string,
  start: number,
  end: number,
): LayerSegmentDocType {
  return {
    id,
    textId: 't1',
    mediaId,
    layerId,
    startTime: start,
    endTime: end,
    createdAt: '',
    updatedAt: '',
  };
}

describe('buildTimelineUnitViewIndex', () => {
  it('uses segments when project has no utterances', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1), seg('s2', 'layer-a', 'm1', 1, 2)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
      utteranceCount: 0,
    });
    expect(index.fallbackToSegments).toBe(true);
    expect(index.allUnits).toHaveLength(2);
    expect(index.totalCount).toBe(2);
    expect(index.currentMediaUnits).toHaveLength(2);
    expect(index.allUnits[0]!.kind).toBe('segment');
  });

  it('uses utterances when present', () => {
    const u: UtteranceDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'hi' },
    };
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [u],
      utterancesOnCurrentMedia: [u],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-main',
      defaultTranscriptionLayerId: 'layer-main',
      utteranceCount: 1,
    });
    expect(index.fallbackToSegments).toBe(false);
    expect(index.allUnits).toHaveLength(1);
    expect(index.allUnits[0]!.kind).toBe('utterance');
    expect(index.currentMediaUnits[0]!.text).toBe('hi');
  });
});
