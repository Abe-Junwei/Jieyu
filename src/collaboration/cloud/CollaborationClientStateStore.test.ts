// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import {
  hydrateCollabClientStateFromIdb,
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  resetCollabClientStateVolatileOverlayForTests,
  saveProjectLastSeenRevision,
  saveProjectPendingOutboundChanges,
} from './CollaborationClientStateStore';
import { resetCollaborationClientStateIdbForTests } from './CollaborationClientStateStore.idb';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class QuotaMemoryStorage extends MemoryStorage {
  throws = false;

  setItem(key: string, value: string): void {
    if (this.throws) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    super.setItem(key, value);
  }
}

function makeChange(clientOpId: string): CollaborationProjectChangeRecord {
  return {
    id: `c-${clientOpId}`,
    projectId: 'project-1',
    actorId: 'actor-1',
    clientId: 'client-1',
    clientOpId,
    protocolVersion: 1,
    projectRevision: 1,
    baseRevision: 0,
    entityType: 'text',
    entityId: 'text-1',
    opType: 'upsert_text',
    sourceKind: 'user',
    createdAt: '2026-04-17T00:00:00.000Z',
  };
}

describe('CollaborationClientStateStore', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    resetCollabClientStateVolatileOverlayForTests(localStorage);
    localStorage.clear();
    await resetCollaborationClientStateIdbForTests();
  });

  afterEach(async () => {
    resetCollabClientStateVolatileOverlayForTests(storage);
    resetCollabClientStateVolatileOverlayForTests(localStorage);
    localStorage.clear();
    await resetCollaborationClientStateIdbForTests();
  });

  it('持久化并读取游标与 pending 队列 | persists cursor and pending queue', () => {
    saveProjectLastSeenRevision('project-1', 42, storage);
    saveProjectPendingOutboundChanges('project-1', [makeChange('op-1')], storage);

    expect(loadProjectLastSeenRevision('project-1', storage)).toBe(42);
    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([
      expect.objectContaining({ clientOpId: 'op-1' }),
    ]);
  });

  it('清空 pending 时保留已有游标 | keeps cursor when pending queue is cleared', () => {
    saveProjectLastSeenRevision('project-1', 9, storage);
    saveProjectPendingOutboundChanges('project-1', [makeChange('op-2')], storage);
    saveProjectPendingOutboundChanges('project-1', [], storage);

    expect(loadProjectLastSeenRevision('project-1', storage)).toBe(9);
    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([]);
  });

  it('忽略非法 pending 记录 | ignores invalid pending records', () => {
    const invalid = { bad: true } as unknown as CollaborationProjectChangeRecord;
    saveProjectPendingOutboundChanges('project-1', [invalid, makeChange('op-3')], storage);

    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([
      expect.objectContaining({ clientOpId: 'op-3' }),
    ]);
  });

  it('localStorage 配额溢出时仍可读回游标 | survives QuotaExceededError via volatile overlay', () => {
    const q = new QuotaMemoryStorage();
    q.throws = true;
    saveProjectLastSeenRevision('project-q', 55, q);
    expect(loadProjectLastSeenRevision('project-q', q)).toBe(55);
    q.throws = false;
    saveProjectLastSeenRevision('project-q', 56, q);
    expect(loadProjectLastSeenRevision('project-q', q)).toBe(56);
    resetCollabClientStateVolatileOverlayForTests(q);
  });

  it('两条操作互不覆盖，ACK 只删被确认的那条 | two ops do not clobber and ack deletes one', async () => {
    const {
      deleteProjectPendingOutboundByKey,
      outboundOpStorageKey,
      putProjectPendingOutboundChange,
    } = await import('./CollaborationClientStateStore');
    const first = makeChange('op-a');
    const second = { ...makeChange('op-b'), clientId: 'client-2' };
    await putProjectPendingOutboundChange(first, storage);
    await putProjectPendingOutboundChange(second, storage);

    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([
      expect.objectContaining({ clientOpId: 'op-a' }),
      expect.objectContaining({ clientOpId: 'op-b' }),
    ]);

    await deleteProjectPendingOutboundByKey(outboundOpStorageKey(first), storage);
    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([
      expect.objectContaining({ clientOpId: 'op-b' }),
    ]);
  });

  it('游标只前进，旧整包不会把已 ACK 的操作写回来 | cursor is monotonic and a stale blob does not resurrect', () => {
    saveProjectLastSeenRevision('project-1', 10, storage);
    saveProjectLastSeenRevision('project-1', 4, storage);
    saveProjectPendingOutboundChanges('project-1', [makeChange('op-acked')], storage);
    saveProjectPendingOutboundChanges('project-1', [], storage);
    storage.setItem(
      'jieyu:collab-client-state:v1',
      JSON.stringify({
        'project-1': {
          lastSeenRevision: 1,
          pendingOutboundChanges: [makeChange('op-acked')],
          updatedAt: '2026-04-17T00:00:00.000Z',
        },
      }),
    );

    expect(loadProjectLastSeenRevision('project-1', storage)).toBe(10);
    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([]);
  });

  it('旧整包只迁一次 | legacy blob migrates once', () => {
    storage.setItem(
      'jieyu:collab-client-state:v1',
      JSON.stringify({
        'project-1': {
          lastSeenRevision: 4,
          pendingOutboundChanges: [makeChange('op-old')],
          updatedAt: '2026-04-17T00:00:00.000Z',
        },
      }),
    );

    expect(loadProjectLastSeenRevision('project-1', storage)).toBe(4);
    expect(loadProjectPendingOutboundChanges('project-1', storage)).toEqual([
      expect.objectContaining({ clientOpId: 'op-old' }),
    ]);
    expect(storage.getItem('jieyu:collab-client-state:v1')).toBeNull();
  });

  it('hydrate 从 IndexedDB 恢复到默认 localStorage 视图 | hydrates default storage from IDB mirror', async () => {
    const payload = JSON.stringify({
      'project-idb': {
        lastSeenRevision: 33,
        updatedAt: '2026-04-17T12:00:00.000Z',
      },
    });
    const { saveCollabClientStateBlobToIdb } = await import('./CollaborationClientStateStore.idb');
    await saveCollabClientStateBlobToIdb(payload);
    localStorage.clear();

    await hydrateCollabClientStateFromIdb();
    await Promise.resolve();

    expect(loadProjectLastSeenRevision('project-idb')).toBe(33);
  });
});
