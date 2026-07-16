import { describe, expect, it } from 'vitest';
import type { TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import {
  buildTimelineSelectionProjection,
  timelineSelectionUnitIdsSet,
} from './timelineSelectionProjection';

describe('buildTimelineSelectionProjection', () => {
  it('marks empty selection as none', () => {
    expect(
      buildTimelineSelectionProjection({
        selectedTimelineUnit: null,
        selectedUnitIds: [],
      }),
    ).toEqual({
      focus: null,
      selectedIds: [],
      selectionCount: 0,
      isMultiSelect: false,
      kind: 'none',
    });
  });

  it('derives selected unit ids from projection for host read paths', () => {
    expect(
      timelineSelectionUnitIdsSet({
        focus: null,
        selectedIds: ['a', 'b'],
        selectionCount: 2,
        isMultiSelect: true,
        kind: 'multi',
      }),
    ).toEqual(new Set(['a', 'b']));
  });

  it('marks multi-select when more than one id is selected', () => {
    const focus: TimelineUnit = { layerId: 'l1', unitId: 'u1', kind: 'unit' };
    expect(
      buildTimelineSelectionProjection({
        selectedTimelineUnit: focus,
        selectedUnitIds: ['u1', 'u2'],
        activeLayerIdForEdits: 'l1',
      }),
    ).toEqual({
      focus,
      selectedIds: ['u1', 'u2'],
      selectionCount: 2,
      isMultiSelect: true,
      kind: 'multi',
      activeLayerIdForEdits: 'l1',
    });
  });
});
