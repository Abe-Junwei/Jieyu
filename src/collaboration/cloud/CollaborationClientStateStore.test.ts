import { beforeEach, describe, expect, it } from 'vitest';
import type { CollaborationProjectChangeRecord } from './syncTypes';
import {
  loadProjectLastSeenRevision,
  loadProjectPendingOutboundChanges,
  saveProjectLastSeenRevision,
  saveProjectPendingOutboundChanges,
} from './CollaborationClientStateStore';

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

  beforeEach(() => {
    storage = new MemoryStorage();
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
});
