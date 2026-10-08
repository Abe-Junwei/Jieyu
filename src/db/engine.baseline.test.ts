/**
 * T1（rev5 2A）：全新安装只有基线版本；各 store / 索引与声明一致，并与旧 v54 最终结构等价；不存在 upgrader。
 * T1 (rev5 2A): fresh install has only the baseline version; stores/indexes match the declaration and
 * are equivalent to the former v54 final shape; no upgrader is registered.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  JIEYU_BASELINE_STORES,
  JIEYU_DEXIE_DB_NAME,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
  JIEYU_TABLE_VALIDATORS,
  JieyuDexie,
} from './engine';
import v54FinalStores from './engine.baseline.v54-final-stores.fixture.json';

const TEST_DB_NAME = 'jieyu-baseline-t1';

function storeSpec(table: Dexie.Table): string {
  return [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', ');
}

describe('T1 greenfield baseline', () => {
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

  it('opens the new main DB name at version 1', () => {
    expect(JIEYU_DEXIE_DB_NAME).toBe('jieyu');
    expect(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).toBe(1);
    expect(dexie.verno).toBe(1);
  });

  it('declares exactly one version and no upgrader', () => {
    const versions = (
      dexie as unknown as { _versions: Array<{ _cfg: { contentUpgrade: unknown } }> }
    )._versions;
    expect(versions).toHaveLength(1);
    expect(versions[0]!._cfg.contentUpgrade ?? null).toBeNull();
  });

  it('opened stores and indexes match the declared baseline', () => {
    const opened = Object.fromEntries(dexie.tables.map((table) => [table.name, storeSpec(table)]));
    expect(Object.keys(opened).sort()).toEqual(Object.keys(JIEYU_BASELINE_STORES).sort());
    for (const [name, spec] of Object.entries(JIEYU_BASELINE_STORES)) {
      expect(opened[name], name).toBe(spec);
    }
  });

  it('is the former v54 final shape (orthography store renamed) plus the 2B source_records / annotation_documents stores', () => {
    const expected: Record<string, string> = {};
    for (const [name, spec] of Object.entries(v54FinalStores as Record<string, string>)) {
      expected[name === 'orthography_transforms' ? 'orthography_bridges' : name] = spec;
    }
    // 2B-D（rev5 4.1）：冻结前基线新增来源记录表 | 2B-D: pre-freeze baseline adds source records
    expected.source_records =
      'id, textId, [textId+externalDocId], [textId+sha256], importBatchId, mediaId';
    // 2B-E（rev5 4.1 / 4.2-8）：标注文档 | 2B-E: annotation documents
    expected.annotation_documents = 'id, textId';
    expect(JIEYU_BASELINE_STORES).toEqual(expected);
  });

  it('native IndexedDB has only the baseline object stores (no legacy stores)', async () => {
    const native = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(TEST_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      expect([...native.objectStoreNames].sort()).toEqual(
        Object.keys(JIEYU_BASELINE_STORES).sort(),
      );
      expect(native.objectStoreNames.contains('orthography_transforms')).toBe(false);
      expect(native.objectStoreNames.contains('utterances')).toBe(false);
    } finally {
      native.close();
    }
  });

  it('registers a write validator for every baseline table', () => {
    expect(Object.keys(JIEYU_TABLE_VALIDATORS).sort()).toEqual(
      Object.keys(JIEYU_BASELINE_STORES).sort(),
    );
  });
});
