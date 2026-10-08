/**
 * T50（rev5 4.4）：统一写入校验覆盖 add / put / bulkPut / update / modify；合格行正常写入；记录 bulkPut 耗时。
 * T50 (rev5 4.4): unified write validation covers add/put/bulkPut/update/modify; valid rows pass;
 * records bulkPut validation timing.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { JIEYU_BASELINE_STORES, JieyuDexie } from './engine';
import { JieyuWriteValidationError } from './writeValidationMiddleware';

const TEST_DB_NAME = 'jieyu-write-validation-t50';
const NOW = '2026-10-08T12:00:00.000Z';
const TABLE_NAMES = Object.keys(JIEYU_BASELINE_STORES) as Array<keyof typeof JIEYU_BASELINE_STORES>;

function primaryKeyOf(name: string): string {
  return JIEYU_BASELINE_STORES[name as keyof typeof JIEYU_BASELINE_STORES].split(',')[0]!.trim();
}

/** 主键类型错误的行：每张表的校验器都必须拒绝 | Row with a wrongly typed primary key */
function invalidRow(name: string): Record<string, unknown> {
  return { [primaryKeyOf(name)]: 42, createdAt: 42, updatedAt: 42 };
}

describe('T50 unified write validation', () => {
  let dexie: JieyuDexie;

  beforeAll(async () => {
    await Dexie.delete(TEST_DB_NAME);
    dexie = new JieyuDexie(TEST_DB_NAME);
    await dexie.open();
  });

  afterAll(async () => {
    dexie.close();
    await Dexie.delete(TEST_DB_NAME);
  });

  it.each(TABLE_NAMES)('%s rejects invalid rows via add, put and bulkPut', async (name) => {
    const table = dexie.table(name);
    await expect(table.add(invalidRow(name))).rejects.toBeInstanceOf(JieyuWriteValidationError);
    await expect(table.put(invalidRow(name))).rejects.toBeInstanceOf(JieyuWriteValidationError);
    await expect(table.bulkPut([invalidRow(name)])).rejects.toThrow(/Write rejected for table/);
    expect(await table.count()).toBe(0);
  });

  it('accepts valid rows and rejects update / modify that make them invalid', async () => {
    await dexie.texts.put({ id: 't1', title: { default: 'T' }, createdAt: NOW, updatedAt: NOW });
    await dexie.speakers.put({
      textId: 'text-1',
      id: 's1',
      name: 'Speaker',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      dexie.texts.update('t1', { title: 42 as unknown as { default: string } }),
    ).rejects.toThrow(/Write rejected for table "texts" at field "title/);
    await expect(dexie.speakers.where('id').equals('s1').modify({ name: '' })).rejects.toThrow(
      /Write rejected for table "speakers" at field "name"/,
    );
    await expect(
      dexie.speakers.toCollection().modify((row) => {
        (row as { createdAt: unknown }).createdAt = 7;
      }),
    ).rejects.toThrow(/speakers/);

    expect((await dexie.texts.get('t1'))?.title).toEqual({ default: 'T' });
    expect((await dexie.speakers.get('s1'))?.name).toBe('Speaker');

    await dexie.speakers.update('s1', { name: 'Renamed' });
    expect((await dexie.speakers.get('s1'))?.name).toBe('Renamed');
  });

  it('rolls back the whole transaction when one row is invalid', async () => {
    await expect(
      dexie.transaction('rw', dexie.texts, async () => {
        await dexie.texts.put({
          id: 't-ok',
          title: { default: 'ok' },
          createdAt: NOW,
          updatedAt: NOW,
        });
        await dexie.texts.put(invalidRow('texts') as never);
      }),
    ).rejects.toThrow(/Write rejected/);
    expect(await dexie.texts.get('t-ok')).toBeUndefined();
  });

  it('error names the table and the field path', async () => {
    const error = await dexie.texts
      .put({ id: 't2', title: { default: 'x' }, createdAt: 'not-a-date', updatedAt: NOW } as never)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(JieyuWriteValidationError);
    expect((error as JieyuWriteValidationError).tableName).toBe('texts');
    expect((error as JieyuWriteValidationError).fieldPath).toBe('createdAt');
  });

  it('records bulkPut validation cost for a large batch', async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({
      id: `bulk-${index}`,
      textId: 'text-1',
      name: `Speaker ${index}`,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    const startedAt = performance.now();
    await dexie.speakers.bulkPut(rows);
    const elapsedMs = performance.now() - startedAt;
    // 只记录，不承诺指标（rev5 4.4）| record only, no committed budget yet (rev5 4.4)
    console.warn(`[T50] bulkPut 5000 speakers with validation: ${elapsedMs.toFixed(1)} ms`);
    expect(await dexie.speakers.count()).toBeGreaterThanOrEqual(5000);
  });
});
