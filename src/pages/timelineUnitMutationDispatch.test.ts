import { describe, expect, it, vi } from 'vitest';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { SegmentRoutingResult } from './transcriptionSegmentRouting';
import {
  dispatchTimelineUnitMutation,
  dispatchTimelineUnitSelectionMutation,
  resolveTimelineUnitSelectionWritePath,
  resolveTimelineUnitWritePath,
} from './timelineUnitMutationDispatch';

function routing(editMode: SegmentRoutingResult['editMode']): SegmentRoutingResult {
  return {
    layer: undefined,
    segmentSourceLayer: undefined,
    sourceLayerId: 'layer_src',
    editMode,
  };
}

function unit(kind: TimelineUnitView['kind'], id = 'u1'): TimelineUnitView {
  return {
    id,
    kind,
    mediaId: 'm1',
    layerId: 'layer-1',
    startTime: 0,
    endTime: 1,
    text: 'x',
  };
}

describe('timelineUnitMutationDispatch', () => {
  describe('resolveTimelineUnitWritePath', () => {
    it('prefers utterance-doc when view kind is utterance', () => {
      expect(resolveTimelineUnitWritePath(unit('utterance'), routing('independent-segment'))).toBe('utterance-doc');
      expect(resolveTimelineUnitWritePath(unit('utterance'), routing('utterance'))).toBe('utterance-doc');
    });

    it('uses segment-layer for independent-segment or time-subdivision when view is segment', () => {
      expect(resolveTimelineUnitWritePath(unit('segment'), routing('independent-segment'))).toBe('segment-layer');
      expect(resolveTimelineUnitWritePath(unit('segment'), routing('time-subdivision'))).toBe('segment-layer');
    });

    it('falls back to utterance-doc for utterance edit mode on segment view rows', () => {
      expect(resolveTimelineUnitWritePath(unit('segment'), routing('utterance'))).toBe('utterance-doc');
    });
  });

  describe('resolveTimelineUnitSelectionWritePath', () => {
    it('uses utterance-doc when every selected id maps to utterance kind', () => {
      const map = new Map<string, TimelineUnitView>([
        ['a', unit('utterance', 'a')],
        ['b', unit('utterance', 'b')],
      ]);
      expect(resolveTimelineUnitSelectionWritePath(new Set(['a', 'b']), map, routing('independent-segment'))).toBe(
        'utterance-doc',
      );
    });

    it('uses segment-layer for mixed selection when layer is segment mode', () => {
      const map = new Map<string, TimelineUnitView>([
        ['a', unit('utterance', 'a')],
        ['b', unit('segment', 'b')],
      ]);
      expect(resolveTimelineUnitSelectionWritePath(new Set(['a', 'b']), map, routing('independent-segment'))).toBe(
        'segment-layer',
      );
    });
  });

  describe('dispatchTimelineUnitMutation', () => {
    it('invokes exactly one branch', async () => {
      const onUtteranceDoc = vi.fn(async () => 'u');
      const onSegmentLayer = vi.fn(async () => 's');
      await expect(
        dispatchTimelineUnitMutation({
          unit: unit('segment'),
          routing: routing('utterance'),
          onUtteranceDoc,
          onSegmentLayer,
        }),
      ).resolves.toBe('u');
      expect(onUtteranceDoc).toHaveBeenCalledTimes(1);
      expect(onSegmentLayer).not.toHaveBeenCalled();
    });
  });

  describe('dispatchTimelineUnitSelectionMutation', () => {
    it('invokes segment branch for batch segment deletes', async () => {
      const map = new Map<string, TimelineUnitView>([['s1', unit('segment', 's1')]]);
      const onUtteranceDoc = vi.fn(async () => 'u');
      const onSegmentLayer = vi.fn(async () => 's');
      await expect(
        dispatchTimelineUnitSelectionMutation({
          ids: new Set(['s1']),
          unitById: map,
          routing: routing('independent-segment'),
          onUtteranceDoc,
          onSegmentLayer,
        }),
      ).resolves.toBe('s');
      expect(onSegmentLayer).toHaveBeenCalledTimes(1);
      expect(onUtteranceDoc).not.toHaveBeenCalled();
    });
  });
});
