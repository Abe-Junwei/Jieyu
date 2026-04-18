import { describe, expect, it } from 'vitest';
import type { Transaction } from 'dexie';
import type { LayerUnitDocType } from '../types';
import { upgradeM41SelfCertaintyHostDepollute } from './m41SelfCertaintyHostDepollute';

/*
 * In-memory Dexie-table stub for migration tests. Only models the fraction of the table
 * API the migration actually touches (toArray + bulkPut). Keeps the test decoupled from
 * Dexie transaction plumbing so we can isolate migration logic.
 */
type StubRows = LayerUnitDocType[];

function makeTable(initialRows: StubRows) {
  const rows: StubRows = initialRows.map((r) => ({ ...r }));

  return {
    rows,
    table: {
      toArray: async () => rows.map((r) => ({ ...r })),
      bulkPut: async (puts: StubRows) => {
        for (const put of puts) {
          const idx = rows.findIndex((r) => r.id === put.id);
          if (idx >= 0) rows[idx] = { ...put };
          else rows.push({ ...put });
        }
      },
    },
  };
}

function makeTx(rows: StubRows): { tx: Transaction; read: () => StubRows } {
  const { table, rows: internalRows } = makeTable(rows);
  const tx = {
    table: (name: string) => (name === 'layer_units' ? table : null),
  } as unknown as Transaction;
  return { tx, read: () => internalRows };
}

function makeHost(id: string, overrides?: Partial<LayerUnitDocType>): LayerUnitDocType {
  return {
    id,
    unitType: 'unit',
    layerId: 'default-layer',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as LayerUnitDocType;
}

function makeSegment(id: string, layerId: string, parentId: string, overrides?: Partial<LayerUnitDocType>): LayerUnitDocType {
  return {
    id,
    unitType: 'segment',
    layerId,
    textId: 'text-1',
    mediaId: 'media-1',
    parentUnitId: parentId,
    startTime: 0,
    endTime: 1,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as LayerUnitDocType;
}

describe('upgradeM41SelfCertaintyHostDepollute', () => {
  it('copies host selfCertainty to the single segment in a single layer (unambiguous)', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'certain' }),
      makeSegment('seg-a', 'layer-a', 'utt-host'),
    ]);

    const outcome = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome.touchedSegments).toBe(1);
    const after = read();
    expect(after.find((r) => r.id === 'seg-a')?.selfCertainty).toBe('certain');
    expect(after.find((r) => r.id === 'utt-host')?.selfCertainty).toBe('certain');
  });

  it('copies to exactly one segment per layer when host is referenced by siblings across layers', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'uncertain' }),
      makeSegment('seg-a', 'layer-a', 'utt-host'),
      makeSegment('seg-b', 'layer-b', 'utt-host'),
    ]);

    const outcome = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome.touchedSegments).toBe(2);
    const after = read();
    expect(after.find((r) => r.id === 'seg-a')?.selfCertainty).toBe('uncertain');
    expect(after.find((r) => r.id === 'seg-b')?.selfCertainty).toBe('uncertain');
  });

  it('skips layers with multiple segments sharing the same host (ambiguous)', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'certain' }),
      makeSegment('seg-1', 'layer-split', 'utt-host', { startTime: 0, endTime: 1 }),
      makeSegment('seg-2', 'layer-split', 'utt-host', { startTime: 1, endTime: 2 }),
    ]);

    const outcome = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome.touchedSegments).toBe(0);
    expect(outcome.skippedAmbiguousLayerGroups).toBe(1);
    const after = read();
    expect(after.find((r) => r.id === 'seg-1')?.selfCertainty).toBeUndefined();
    expect(after.find((r) => r.id === 'seg-2')?.selfCertainty).toBeUndefined();
  });

  it('never overwrites a segment that already has its own selfCertainty', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'not_understood' }),
      makeSegment('seg-a', 'layer-a', 'utt-host', { selfCertainty: 'certain' }),
    ]);

    const outcome = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome.touchedSegments).toBe(0);
    expect(outcome.skippedPreExistingSegmentCertainty).toBe(1);
    const after = read();
    expect(after.find((r) => r.id === 'seg-a')?.selfCertainty).toBe('certain');
  });

  it('leaves host.selfCertainty intact (never clears) even after migrating', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'certain' }),
      makeSegment('seg-a', 'layer-a', 'utt-host'),
    ]);

    await upgradeM41SelfCertaintyHostDepollute(tx);

    const after = read();
    expect(after.find((r) => r.id === 'utt-host')?.selfCertainty).toBe('certain');
  });

  it('does nothing for canonical units with no segment references (pure unit-intrinsic value)', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-alone', { selfCertainty: 'certain' }),
    ]);

    const outcome = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome.scannedCanonicalUnits).toBe(1);
    expect(outcome.touchedSegments).toBe(0);
    const after = read();
    expect(after.find((r) => r.id === 'utt-alone')?.selfCertainty).toBe('certain');
  });

  it('is idempotent — re-running after a successful pass is a no-op', async () => {
    const { tx, read } = makeTx([
      makeHost('utt-host', { selfCertainty: 'certain' }),
      makeSegment('seg-a', 'layer-a', 'utt-host'),
    ]);

    await upgradeM41SelfCertaintyHostDepollute(tx);
    const outcome2 = await upgradeM41SelfCertaintyHostDepollute(tx);

    expect(outcome2.touchedSegments).toBe(0);
    expect(outcome2.skippedPreExistingSegmentCertainty).toBe(1);
    const after = read();
    expect(after.find((r) => r.id === 'seg-a')?.selfCertainty).toBe('certain');
  });
});
