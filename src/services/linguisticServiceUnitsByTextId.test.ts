/**
 * JY-15 剩余：units.listByTextId 走 `textId` 索引，不整表读 layer_units。
 * JY-15 remainder: units.listByTextId uses the `textId` index instead of reading every layer_units row.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';

const NOW = '2026-10-09T00:00:00.000Z';

function unit(id: string, textId: string, startTime: number) {
  return {
    id,
    textId,
    unitType: 'unit',
    startTime,
    endTime: startTime + 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('JY-15: units.listByTextId is project-indexed', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.layer_units.bulkPut([
      unit('a-2', 'proj-A', 2),
      unit('a-1', 'proj-A', 1),
      unit('b-1', 'proj-B', 0),
      { ...unit('a-seg', 'proj-A', 0), unitType: 'segment' },
    ] as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns only that project units, sorted, without a whole-table read', async () => {
    const fullScan = vi.spyOn(db.layer_units, 'toArray');
    const rows = await LinguisticService.units.listByTextId('proj-A');
    expect(rows.map((row) => row.id)).toEqual(['a-1', 'a-2']);
    expect(fullScan).not.toHaveBeenCalled();
    expect(await LinguisticService.units.listByTextId('  ')).toEqual([]);
  });
});
