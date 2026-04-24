import type { Table } from 'dexie';
import { describe, expect, it, vi } from 'vitest';

import type { JieyuDatabase } from './engine';
import { withTransaction } from './withTransaction';

function makeStore(name: string): Table<unknown, unknown> {
  return { name } as unknown as Table<unknown, unknown>;
}

function makeDb(transactionImpl: (mode: 'r' | 'rw', stores: unknown[], scope: () => Promise<unknown>) => Promise<unknown>): JieyuDatabase {
  return {
    dexie: {
      transaction: transactionImpl,
    },
  } as unknown as JieyuDatabase;
}

describe('withTransaction', () => {
  it('按表名去重后再开启事务 | dedupes stores by name before opening transaction', async () => {
    const transaction = vi.fn(async (_mode: 'r' | 'rw', _stores: unknown[], scope: () => Promise<unknown>) => scope());
    const db = makeDb(transaction);

    const layerStore1 = makeStore('layer_units');
    const layerStore2 = makeStore('layer_units');
    const relationStore = makeStore('unit_relations');

    const result = await withTransaction(
      db,
      'rw',
      [layerStore1, layerStore2, relationStore],
      async () => 'ok',
    );

    expect(result).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(1);
    const call = transaction.mock.calls[0];
    expect(call?.[0]).toBe('rw');
    expect((call?.[1] as Array<{ name: string }>).map((item) => item.name)).toEqual(['layer_units', 'unit_relations']);
  });

  it('无 store 时直接执行作用域 | runs scope directly when no stores are declared', async () => {
    const transaction = vi.fn(async (_mode: 'r' | 'rw', _stores: unknown[], scope: () => Promise<unknown>) => scope());
    const db = makeDb(transaction);

    const result = await withTransaction(db, 'r', [], async () => 42);

    expect(result).toBe(42);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('在 label 下包装错误信息 | prefixes error messages with transaction label', async () => {
    const transaction = vi.fn(async () => {
      throw new Error('boom');
    });
    const db = makeDb(transaction as never);

    await expect(withTransaction(db, 'rw', [makeStore('layer_units')], async () => 1, { label: 'LayerUnitService.splitUnit' }))
      .rejects
      .toThrow('[db.transaction:LayerUnitService.splitUnit] boom');
  });
});
