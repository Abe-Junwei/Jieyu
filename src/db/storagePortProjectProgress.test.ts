import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { storagePort } from './storagePort';
import type {
  SegmentMetaDocType,
  TranslationStatusSnapshotDocType,
  UnitTokenDocType,
} from './types';

const NOW = '2026-10-18T00:00:00.000Z';

function meta(id: string, textId: string, mediaId: string, layerId: string): SegmentMetaDocType {
  return {
    id,
    segmentId: id,
    textId,
    mediaId,
    layerId,
    startTime: 0,
    endTime: 1,
    text: id,
    normalizedText: id,
    hasText: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function snapshot(
  id: string,
  textId: string,
  mediaId: string,
  layerId: string,
): TranslationStatusSnapshotDocType {
  return {
    id,
    unitId: id,
    textId,
    mediaId,
    layerId,
    status: 'translated',
    hasText: true,
    textLength: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function token(id: string, textId: string): UnitTokenDocType {
  return {
    id,
    textId,
    unitId: 'unit-1',
    form: { default: id },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('storage port project progress reads', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.anchors.bulkAdd([
      { id: 'anchor-a', mediaId: 'media-a', time: 0, createdAt: NOW },
      { id: 'anchor-b', mediaId: 'media-a', time: 1, createdAt: NOW },
      { id: 'anchor-c', mediaId: 'media-b', time: 2, createdAt: NOW },
    ]);
    await db.unit_tokens.bulkAdd([token('tok-a', 'text-a'), token('tok-b', 'text-b')]);
    await db.segment_meta.bulkAdd([
      meta('meta-a', 'text-a', 'media-a', 'layer-a'),
      meta('meta-b', 'text-a', 'media-b', 'layer-b'),
      meta('meta-c', 'text-b', 'media-a', 'layer-a'),
    ]);
    await db.translation_status_snapshots.bulkAdd([
      snapshot('tr-a', 'text-a', 'media-a', 'layer-t'),
      snapshot('tr-b', 'text-b', 'media-a', 'layer-t'),
    ]);
  });

  it('reads the seeded progress rows back and ignores blank ids', async () => {
    const port = storagePort();
    await expect(port.countAnchorsByMedia('media-a')).resolves.toBe(2);
    await expect(port.countAnchorsByMedia('media-missing')).resolves.toBe(0);
    await expect(port.countAnchorsByMedia('  ')).resolves.toBe(0);

    await expect(port.countUnitTokensByText('text-a')).resolves.toBe(1);
    await expect(port.countUnitTokensByText('')).resolves.toBe(0);

    await expect(port.listSegmentMetaByText('text-a')).resolves.toEqual([
      meta('meta-a', 'text-a', 'media-a', 'layer-a'),
      meta('meta-b', 'text-a', 'media-b', 'layer-b'),
    ]);
    await expect(port.listSegmentMetaByText(' ')).resolves.toEqual([]);

    await expect(port.listSegmentMetaForMediaLayers('media-a', ['layer-a'])).resolves.toEqual([
      meta('meta-a', 'text-a', 'media-a', 'layer-a'),
      meta('meta-c', 'text-b', 'media-a', 'layer-a'),
    ]);
    await expect(port.listSegmentMetaForMediaLayers('media-a', [])).resolves.toEqual([]);

    await expect(port.listSegmentMetaForTextLayers('text-a', ['layer-b'])).resolves.toEqual([
      meta('meta-b', 'text-a', 'media-b', 'layer-b'),
    ]);
    await expect(port.listSegmentMetaForTextLayers('text-a', [' '])).resolves.toEqual([]);

    await expect(port.listTranslationSnapshotsByMedia('media-a')).resolves.toEqual([
      snapshot('tr-a', 'text-a', 'media-a', 'layer-t'),
      snapshot('tr-b', 'text-b', 'media-a', 'layer-t'),
    ]);
    await expect(port.listTranslationSnapshotsByText('text-a')).resolves.toEqual([
      snapshot('tr-a', 'text-a', 'media-a', 'layer-t'),
    ]);
    await expect(port.listTranslationSnapshotsByText('')).resolves.toEqual([]);
  });
});
