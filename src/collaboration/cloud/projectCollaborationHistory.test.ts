// @vitest-environment jsdom
/**
 * T27：“是否协作过”判定，以及稳定 clientId（rev5 D6、9.4）。
 * T27: the "ever collaborated" decision and the stable clientId (rev5 D6, 9.4).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  COLLAB_CLIENT_ID_STORAGE_KEY,
  getCollaborationClientId,
  resetCollaborationClientIdForTests,
} from './collaborationClientIdentity';
import {
  COLLAB_LOCAL_PROJECT_REGISTRY_KEY,
  clearProjectRemovedLocally,
  isProjectSyncBlockedLocally,
  listLocallyRemovedCloudProjects,
  markProjectCloudDeleted,
  markProjectCollaborationBound,
  markProjectOutboundRecorded,
  markProjectRemovedLocally,
  readCollaborationLocalRegistry,
} from './collaborationLocalProjectRegistry';
import {
  saveProjectLastSeenRevision,
  saveProjectPendingOutboundChanges,
} from './CollaborationClientStateStore';
import {
  assessProjectCollaborationHistory,
  isProjectNeverCollaborated,
} from './projectCollaborationHistory';
import type { CollaborationProjectChangeRecord } from './syncTypes';

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
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class BrokenStorage extends MemoryStorage {
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  }
  setItem(): void {
    throw new DOMException('denied', 'SecurityError');
  }
}

function pendingChange(projectId: string): CollaborationProjectChangeRecord {
  return {
    id: `change-${projectId}`,
    projectId,
    actorId: 'actor',
    clientId: 'web-client',
    clientOpId: 'web-client:1',
    protocolVersion: 1,
    projectRevision: 0,
    baseRevision: 0,
    entityType: 'layer_unit',
    entityId: 'u1',
    opType: 'upsert_unit',
    payload: {},
    sourceKind: 'user',
    createdAt: new Date().toISOString(),
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  resetCollaborationClientIdForTests();
});

describe('T27 never-collaborated decision (D6)', () => {
  it('(a) no binding and no records → never collaborated', () => {
    expect(assessProjectCollaborationHistory('p1', { storage })).toEqual({
      verdict: 'never-collaborated',
      evidence: [],
    });
    expect(isProjectNeverCollaborated('p1', { storage })).toBe(true);
  });

  it('(b) any history → collaborated', () => {
    markProjectCollaborationBound('bound', storage);
    markProjectOutboundRecorded('outbound', storage);
    saveProjectLastSeenRevision('seen', 3, storage);
    saveProjectPendingOutboundChanges('pending', [pendingChange('pending')], storage);
    for (const [projectId, evidence] of [
      ['bound', 'collaboration-binding'],
      ['outbound', 'outbound-history'],
      ['seen', 'cloud-revision-seen'],
      ['pending', 'pending-outbound'],
    ] as const) {
      const result = assessProjectCollaborationHistory(projectId, { storage });
      expect(result.verdict).toBe('collaborated');
      expect(result.evidence).toContain(evidence);
      expect(isProjectNeverCollaborated(projectId, { storage })).toBe(false);
    }
    // 其他项目不受影响 | Other projects stay never-collaborated
    expect(isProjectNeverCollaborated('other', { storage })).toBe(true);
  });

  it('(b) outbound history survives the queue being flushed', () => {
    markProjectOutboundRecorded('p1', storage);
    saveProjectPendingOutboundChanges('p1', [], storage);
    expect(isProjectNeverCollaborated('p1', { storage })).toBe(false);
  });

  it('(c) unreadable records → unknown → treated as collaborated', () => {
    storage.setItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY, '{not json');
    expect(assessProjectCollaborationHistory('p1', { storage }).verdict).toBe('unknown');
    expect(isProjectNeverCollaborated('p1', { storage })).toBe(false);

    const clientStateBroken = new MemoryStorage();
    clientStateBroken.setItem('jieyu:collab-client-state:v1', '[[[');
    expect(assessProjectCollaborationHistory('p1', { storage: clientStateBroken }).verdict).toBe(
      'unknown',
    );

    const denied = new BrokenStorage();
    expect(assessProjectCollaborationHistory('p1', { storage: denied }).verdict).toBe('unknown');
    expect(isProjectNeverCollaborated('p1', { storage: denied })).toBe(false);
  });

  it('a corrupt registry is never overwritten (evidence is not erased)', () => {
    storage.setItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY, '{not json');
    expect(() => markProjectOutboundRecorded('p1', storage)).toThrow(/unreadable/);
    expect(storage.getItem(COLLAB_LOCAL_PROJECT_REGISTRY_KEY)).toBe('{not json');
  });
});

describe('local removal and tombstone marks', () => {
  it('lists removed cloud projects and blocks their auto-sync until cleared', () => {
    markProjectCollaborationBound('p1', storage);
    markProjectRemovedLocally('p1', { projectName: 'Field notes' }, storage);
    expect(isProjectSyncBlockedLocally('p1', storage)).toBe(true);
    expect(listLocallyRemovedCloudProjects(storage)).toEqual([
      expect.objectContaining({ projectId: 'p1', projectName: 'Field notes' }),
    ]);
    clearProjectRemovedLocally('p1', storage);
    expect(isProjectSyncBlockedLocally('p1', storage)).toBe(false);
    expect(listLocallyRemovedCloudProjects(storage)).toEqual([]);
    // 绑定证据保留 | The binding evidence stays
    expect(readCollaborationLocalRegistry(storage)).toMatchObject({
      ok: true,
      records: { p1: { boundAt: expect.any(String) } },
    });
  });

  it('a tombstoned project is not offered for re-download', () => {
    markProjectRemovedLocally('p1', {}, storage);
    markProjectCloudDeleted('p1', '2026-10-09T01:00:00.000Z', storage);
    expect(listLocallyRemovedCloudProjects(storage)).toEqual([]);
    expect(isProjectSyncBlockedLocally('p1', storage)).toBe(true);
  });
});

describe('stable clientId (9.4)', () => {
  it('is generated once per installation and reused', () => {
    const first = getCollaborationClientId(storage);
    resetCollaborationClientIdForTests();
    expect(getCollaborationClientId(storage)).toBe(first);
    expect(storage.getItem(COLLAB_CLIENT_ID_STORAGE_KEY)).toBe(first);
    expect(first).toMatch(/^web-/);
  });

  it('a different installation gets a different id', () => {
    const first = getCollaborationClientId(storage);
    resetCollaborationClientIdForTests();
    expect(getCollaborationClientId(new MemoryStorage())).not.toBe(first);
  });

  it('replaces a malformed stored id and stays stable within a session without storage', () => {
    storage.setItem(COLLAB_CLIENT_ID_STORAGE_KEY, 'bad id');
    expect(getCollaborationClientId(storage)).toMatch(/^web-/);
    const denied = new BrokenStorage();
    resetCollaborationClientIdForTests();
    const a = getCollaborationClientId(denied);
    expect(getCollaborationClientId(denied)).toBe(a);
  });
});
