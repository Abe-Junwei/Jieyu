/**
 * 归属不可变中间件的 bulkPut 开销测量（JIEYU_BENCH=1 时运行）。
 * bulkPut overhead of the ownership middleware (runs only with JIEYU_BENCH=1).
 */
import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import {
  createOwnershipImmutabilityMiddleware,
  JIEYU_PARENT_CONSISTENCY_RULES,
} from './ownershipImmutabilityMiddleware';

interface Row {
  id: string;
  textId: string;
  startTime: number;
  endTime: number;
  note: string;
}
const N = Number(process.env.JIEYU_BENCH_ROWS ?? 1000);
const ROUNDS = 3;

async function measure(
  withMiddleware: boolean,
  name: string,
): Promise<{ insert: number; overwrite: number }> {
  const bench = new Dexie(name) as Dexie & { rows: Table<Row, string> };
  bench.version(1).stores({ rows: 'id, textId' });
  if (withMiddleware) bench.use(createOwnershipImmutabilityMiddleware({ rows: ['textId'] }));
  await bench.open();
  const rows = Array.from({ length: N }, (_, i) => ({
    id: `u${i}`,
    textId: 'p1',
    startTime: i,
    endTime: i + 1,
    note: 'x'.repeat(40),
  }));
  const insert: number[] = [];
  const overwrite: number[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    await bench.rows.clear();
    let t = performance.now();
    await bench.rows.bulkPut(rows);
    insert.push(performance.now() - t);
    t = performance.now();
    await bench.rows.bulkPut(rows.map((row) => ({ ...row, startTime: row.startTime + r })));
    overwrite.push(performance.now() - t);
  }
  bench.close();
  await Dexie.delete(name);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  return { insert: median(insert), overwrite: median(overwrite) };
}

interface ParentRow {
  id: string;
  textId: string;
}
interface ChildRow {
  id: string;
  textId: string;
  unitId: string;
  tokenIndex: number;
}

/** GAP-1：token 风格子行 bulkPut，带 / 不带父行一致性检查 | Child bulkPut with / without parent check */
async function measureParent(
  withMiddleware: boolean,
  name: string,
): Promise<{ insert: number; overwrite: number }> {
  const bench = new Dexie(name) as Dexie & {
    layer_units: Table<ParentRow, string>;
    unit_tokens: Table<ChildRow, string>;
  };
  bench.version(1).stores({ layer_units: 'id, textId', unit_tokens: 'id, textId, unitId' });
  if (withMiddleware) {
    bench.use(
      createOwnershipImmutabilityMiddleware(
        { layer_units: ['textId'], unit_tokens: ['textId'] },
        { unit_tokens: JIEYU_PARENT_CONSISTENCY_RULES.unit_tokens! },
      ),
    );
  }
  await bench.open();
  const units = Array.from({ length: Math.ceil(N / 5) }, (_, i) => ({ id: `u${i}`, textId: 'p1' }));
  await bench.layer_units.bulkPut(units);
  const rows = Array.from({ length: N }, (_, i) => ({
    id: `t${i}`,
    textId: 'p1',
    unitId: `u${Math.floor(i / 5)}`,
    tokenIndex: i % 5,
  }));
  const insert: number[] = [];
  const overwrite: number[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    await bench.unit_tokens.clear();
    let t = performance.now();
    await bench.unit_tokens.bulkPut(rows);
    insert.push(performance.now() - t);
    t = performance.now();
    await bench.unit_tokens.bulkPut(
      rows.map((row) => ({ ...row, tokenIndex: row.tokenIndex + r })),
    );
    overwrite.push(performance.now() - t);
  }
  bench.close();
  await Dexie.delete(name);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  return { insert: median(insert), overwrite: median(overwrite) };
}

describe.runIf(process.env.JIEYU_BENCH === '1')('ownership middleware bulkPut overhead', () => {
  it(`bulkPut ${N} rows`, async () => {
    const base = await measure(false, 'bench-base');
    const guarded = await measure(true, 'bench-guarded');
    console.warn(JSON.stringify({ rows: N, rounds: ROUNDS, base, guarded }));
    expect(guarded.insert).toBeGreaterThan(0);
  }, 600_000);

  it(`bulkPut ${N} token rows with the parent check (GAP-1)`, async () => {
    const base = await measureParent(false, 'bench-parent-base');
    const guarded = await measureParent(true, 'bench-parent-guarded');
    console.warn(JSON.stringify({ parentCheck: true, rows: N, rounds: ROUNDS, base, guarded }));
    expect(guarded.insert).toBeGreaterThan(0);
  }, 600_000);
});
