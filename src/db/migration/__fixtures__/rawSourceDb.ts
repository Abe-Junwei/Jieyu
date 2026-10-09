/**
 * 测试用原生源库：覆盖内联主键、复合 / 唯一 / multiEntry 索引、自增的外置主键和 Blob。
 * Raw source DB for tests: inline keys, compound / unique / multiEntry indexes, auto-increment
 * out-of-line keys and Blobs.
 */
import { idbRequest, idbTransactionDone } from '../rawIdb';

export const RAW_SOURCE_ITEM_COUNT = 450;

export async function createRawSourceDb(
  factory: IDBFactory,
  name: string,
  nativeVersion = 10,
  itemCount = RAW_SOURCE_ITEM_COUNT,
): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, nativeVersion);
    request.onupgradeneeded = () => {
      const target = request.result;
      const items = target.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('name', 'name', { unique: false, multiEntry: false });
      items.createIndex('[a+b]', ['a', 'b'], { unique: false, multiEntry: false });
      items.createIndex('code', 'code', { unique: true, multiEntry: false });
      items.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      target.createObjectStore('blobs', { autoIncrement: true });
      target.createObjectStore('empty', { keyPath: ['p', 'q'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(['items', 'blobs'], 'readwrite');
  const done = idbTransactionDone(tx);
  for (let i = 0; i < itemCount; i += 1) {
    tx.objectStore('items').put({
      id: `item-${String(i).padStart(4, '0')}`,
      name: `name ${i}`,
      a: i % 3,
      b: `b${i % 5}`,
      code: `code-${i}`,
      tags: ['t', `t${i % 4}`],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      nested: { $weird: 'dollar key', list: [1, 2, { deep: true }] },
      missing: undefined,
    });
  }
  tx.objectStore('blobs').put({
    label: 'audio',
    bytes: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'audio/wav' }),
  });
  tx.objectStore('blobs').put({ label: 'buffer', bytes: new Uint8Array([9, 8, 7]).buffer });
  await done;
  db.close();
}

export async function readAllRaw(
  factory: IDBFactory,
  name: string,
  store: string,
): Promise<{ keys: IDBValidKey[]; values: unknown[] }> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction(store, 'readonly');
    const done = idbTransactionDone(tx);
    const keysRequest = idbRequest(tx.objectStore(store).getAllKeys());
    const valuesRequest = idbRequest(tx.objectStore(store).getAll());
    const keys = await keysRequest;
    const values = await valuesRequest;
    await done;
    return { keys, values };
  } finally {
    db.close();
  }
}
