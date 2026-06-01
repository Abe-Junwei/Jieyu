import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db';
import {
  detectSegmentMetaDrift,
  ensureSegmentMetaFreshForLayerMedia,
} from './segmentMetaReconcile';
import { SegmentMetaService } from './SegmentMetaService';

describe('segmentMetaReconcile', () => {
  beforeEach(async () => {
    const db = await getDb();
    await Promise.all([db.dexie.layer_units.clear(), db.dexie.segment_meta.clear()]);
  });

  it('detectSegmentMetaDrift reports drift when segment_meta is missing rows', async () => {
    const db = await getDb();
    await db.dexie.layer_units.add({
      id: 'seg-1',
      unitType: 'segment',
      textId: 'text-1',
      mediaId: 'media-1',
      layerId: 'layer-1',
      startTime: 0,
      endTime: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await detectSegmentMetaDrift('layer-1', 'media-1');
    expect(report?.drifted).toBe(true);
    expect(report?.expectedCount).toBe(1);
    expect(report?.storedCount).toBe(0);
  });

  it('ensureSegmentMetaFreshForLayerMedia rebuilds and clears drift', async () => {
    const db = await getDb();
    await db.dexie.layer_units.add({
      id: 'seg-1',
      unitType: 'segment',
      textId: 'text-1',
      mediaId: 'media-1',
      layerId: 'layer-1',
      startTime: 0,
      endTime: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await ensureSegmentMetaFreshForLayerMedia('layer-1', 'media-1', 'test');

    const after = await detectSegmentMetaDrift('layer-1', 'media-1');
    expect(after?.drifted).toBe(false);
    expect(after?.storedCount).toBe(1);

    const rows = await SegmentMetaService.listByLayerMedia('layer-1', 'media-1');
    expect(rows.map((row) => row.segmentId)).toEqual(['seg-1']);
  });
});
