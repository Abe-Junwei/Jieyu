import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import {
  partitionPairedReadingSourceItemsForDualTranscriptionColumns,
  partitionSecondarySourceItemsUnderPrimaryItems,
} from './transcriptionTimelineVerticalViewHelpers';

function tr(id: string, parent?: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id },
    languageId: 'zho',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    ...(parent ? { parentLayerId: parent } : {}),
  } as LayerDocType;
}

describe('partitionPairedReadingSourceItemsForDualTranscriptionColumns', () => {
  it('partitions deeper transcription lanes as secondary items when there are no translation layers', () => {
    const parent = tr('tr-parent');
    const dep = tr('tr-dep', 'tr-parent');
    const ordered = [parent, dep];
    const out = partitionPairedReadingSourceItemsForDualTranscriptionColumns({
      sourceItems: [
        { unitId: 'u1', text: 'a', startTime: 0, endTime: 1, layerId: 'tr-parent' },
        { unitId: 'u1', text: 'a', startTime: 0, endTime: 1, layerId: 'tr-dep' },
      ],
      translationLayers: [],
      orderedTranscriptionLanes: ordered,
    });
    expect(out.primaryColumnItems).toHaveLength(1);
    expect(out.secondaryColumnItems).toHaveLength(1);
    expect(out.primaryColumnItems[0]?.layerId).toBe('tr-parent');
    expect(out.secondaryColumnItems[0]?.layerId).toBe('tr-dep');
  });

  it('buckets dependent rows under overlapping primary rows for stacked source layout', () => {
    const primary = [
      { unitId: 'u1', text: 'a', startTime: 0, endTime: 10, layerId: 'tr-parent' },
      { unitId: 'u2', text: 'b', startTime: 20, endTime: 30, layerId: 'tr-parent' },
    ];
    const secondary = [
      { unitId: 'd1', text: 'x', startTime: 1, endTime: 9, layerId: 'tr-dep' },
      { unitId: 'd2', text: 'y', startTime: 21, endTime: 29, layerId: 'tr-dep' },
    ];
    const buckets = partitionSecondarySourceItemsUnderPrimaryItems(primary, secondary);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual([secondary[0]]);
    expect(buckets[1]).toEqual([secondary[1]]);
  });

  it('does not split when translation layers exist', () => {
    const tl = { id: 'trl' };
    const items = [
      { unitId: 'u1', text: 'a', startTime: 0, endTime: 1, layerId: 'tr-parent' },
      { unitId: 'u1', text: 'a', startTime: 0, endTime: 1, layerId: 'tr-dep' },
    ];
    const out = partitionPairedReadingSourceItemsForDualTranscriptionColumns({
      sourceItems: items,
      translationLayers: [tl],
      orderedTranscriptionLanes: [tr('tr-parent'), tr('tr-dep', 'tr-parent')],
    });
    expect(out.primaryColumnItems).toEqual(items);
    expect(out.secondaryColumnItems).toEqual([]);
  });
});
