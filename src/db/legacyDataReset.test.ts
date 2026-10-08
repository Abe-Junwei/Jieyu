/**
 * T2 / T47（rev5 8.1，D10）：旧数据检测、确认后只删 5 个库与清单键；拒绝时新库照常工作、旧库保留。
 * T2 / T47 (rev5 8.1, D10): detection; confirm deletes only the five DBs and listed keys;
 * declining keeps the new DB working and old data untouched.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  detectLegacyLocalData,
  LEGACY_RESET_LOCAL_STORAGE_KEYS,
  wipeLegacyLocalData,
} from './legacyDataReset';
import { JieyuDexie } from './engine';

const NOW = '2026-10-08T12:00:00.000Z';

function openNative(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function createDb(name: string, version: number): Promise<void> {
  const db = await openNative(name, version);
  db.close();
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((info) => info.name ?? '').sort();
}

async function databaseVersion(name: string): Promise<number | undefined> {
  return (await indexedDB.databases()).find((info) => info.name === name)?.version;
}

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const KEPT_LOCAL_KEYS = ['jieyu.aiChat.settings', 'jieyu-theme', 'jieyu.voiceAgent.localWhisper'];

async function deleteAllDatabases(): Promise<void> {
  for (const name of await databaseNames()) await Dexie.delete(name);
}

let localStore: MemoryStorage;
let sessionStore: MemoryStorage;

async function seedLegacyInstall(): Promise<void> {
  await createDb('jieyudb_v2', 540);
  await createDb('jieyu_pre_migration_backups', 1);
  await createDb('jieyu_recovery', 10);
  await createDb('jieyu-project-memory', 1);
  await createDb('jieyu_collab_client_state', 10);
  // 保留的库带着各自更高的版本历史 | kept DBs carry their own (higher) version history
  await createDb('jieyu-voice-sessions', 3);
  await createDb('jieyu-user-behavior', 20);
  await createDb('jieyu-acoustic-analysis', 30);
  localStore.setItem('jieyu.backup.preMigrationSnapshot:jieyudb_v2:53:54', '{}');
  localStore.setItem('jieyu.backup.preMigrationSnapshotFailure:jieyudb_v2', '{}');
  for (const key of LEGACY_RESET_LOCAL_STORAGE_KEYS) localStore.setItem(key, 'legacy');
  for (const key of KEPT_LOCAL_KEYS) localStore.setItem(key, 'keep');
  sessionStore.setItem('jieyu.workspace.transcriptionReturn.v1', '{"textId":"old"}');
  sessionStore.setItem('jieyu.someOtherSessionKey', 'keep');
}

function env() {
  return { indexedDB, localStorage: localStore, sessionStorage: sessionStore };
}

beforeEach(async () => {
  await deleteAllDatabases();
  localStore = new MemoryStorage();
  sessionStore = new MemoryStorage();
});

afterEach(async () => {
  await deleteAllDatabases();
});

describe('legacy local data reset (D10)', () => {
  it('a fresh 2A install is not reported as legacy, even with recreated secondary DBs', async () => {
    await createDb('jieyu', 10);
    await createDb('jieyu_recovery', 10);
    await createDb('jieyu_collab_client_state', 10);
    localStore.setItem('jieyu.lastExportTimestamp', '1');
    expect((await detectLegacyLocalData(env())).detected).toBe(false);
  });

  it('T2: detects pre-2A data and lists the five reset databases and listed keys', async () => {
    await seedLegacyInstall();
    const detection = await detectLegacyLocalData(env());
    expect(detection.detected).toBe(true);
    expect([...detection.databases].sort()).toEqual(
      [
        'jieyu-project-memory',
        'jieyu_collab_client_state',
        'jieyu_pre_migration_backups',
        'jieyu_recovery',
        'jieyudb_v2',
      ].sort(),
    );
    expect(detection.localStorageKeys).not.toEqual(expect.arrayContaining(KEPT_LOCAL_KEYS));
    expect(detection.sessionStorageKeys).toEqual(['jieyu.workspace.transcriptionReturn.v1']);
  });

  it('T2: confirm deletes ONLY the five databases and listed keys; kept DBs reopen without VersionError', async () => {
    await seedLegacyInstall();
    const result = await wipeLegacyLocalData(env());
    expect(result.failedDatabases).toEqual([]);

    expect(await databaseNames()).toEqual(
      ['jieyu-acoustic-analysis', 'jieyu-user-behavior', 'jieyu-voice-sessions'].sort(),
    );
    expect(await databaseVersion('jieyu-voice-sessions')).toBe(3);
    expect(await databaseVersion('jieyu-user-behavior')).toBe(20);
    expect(await databaseVersion('jieyu-acoustic-analysis')).toBe(30);
    for (const name of ['jieyu-voice-sessions', 'jieyu-user-behavior', 'jieyu-acoustic-analysis']) {
      const reopened = await openNative(name);
      expect(reopened.objectStoreNames.contains('rows')).toBe(true);
      reopened.close();
    }

    for (const key of KEPT_LOCAL_KEYS) expect(localStore.getItem(key)).toBe('keep');
    for (const key of LEGACY_RESET_LOCAL_STORAGE_KEYS) expect(localStore.getItem(key)).toBeNull();
    expect(localStore.length).toBe(KEPT_LOCAL_KEYS.length);
    expect(sessionStore.getItem('jieyu.workspace.transcriptionReturn.v1')).toBeNull();
    expect(sessionStore.getItem('jieyu.someOtherSessionKey')).toBe('keep');

    expect((await detectLegacyLocalData(env())).detected).toBe(false);
  });

  it('T47: declining keeps the new main DB working, old DBs untouched, and detection persists', async () => {
    await seedLegacyInstall();
    expect((await detectLegacyLocalData(env())).detected).toBe(true);
    // 用户拒绝 = 不调用 wipe | declining means wipe is never called
    const fresh = new JieyuDexie('jieyu');
    await fresh.open();
    await fresh.texts.put({
      id: 't-new',
      title: { default: 'new' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect((await fresh.texts.get('t-new'))?.id).toBe('t-new');
    fresh.close();

    const names = await databaseNames();
    expect(names).toContain('jieyudb_v2');
    expect(names).toContain('jieyu');
    expect(await databaseVersion('jieyudb_v2')).toBe(540);
    // 下次启动再提示 | prompts again next launch
    expect((await detectLegacyLocalData(env())).detected).toBe(true);
    expect(localStore.getItem('jieyu.backup.preMigrationSnapshot:jieyudb_v2:53:54')).toBe('{}');
  });
});
