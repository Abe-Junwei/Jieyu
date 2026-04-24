import { describe, expect, it } from 'vitest';
import { collectRuntimeSingletonHealthSnapshot } from './runtimeSingletonHealth';

describe('collectRuntimeSingletonHealthSnapshot', () => {
  it('aggregates singleton and worker health data', async () => {
    const snapshot = await collectRuntimeSingletonHealthSnapshot({
      now: () => 123,
      checkDb: async () => ({ ok: true }),
      getSupabaseHealth: () => ({ ok: true, kind: 'client_ready', hasCachedClient: true }),
      getAcousticHealth: () => ({
        ok: true,
        initialized: true,
        memoryCacheSize: 2,
        hasWorker: true,
        pendingDeduplicationKeys: 1,
      }),
      getWorkerPoolStats: () => ({ total: 3, idle: 1, busy: 2, crashed: 0, terminated: 0 }),
      getManagedWorkers: () => [
        {
          id: 'w-1',
          source: 'test',
          state: 'live',
          createdAtMs: 1,
          errorEventCount: 0,
          messageErrorEventCount: 1,
        },
        {
          id: 'w-2',
          source: 'test',
          state: 'terminated',
          createdAtMs: 2,
          terminatedAtMs: 3,
          errorEventCount: 0,
          messageErrorEventCount: 0,
        },
      ],
    });

    expect(snapshot.generatedAtMs).toBe(123);
    expect(snapshot.db).toEqual({ ok: true });
    expect(snapshot.supabase).toEqual({ ok: true, kind: 'client_ready', hasCachedClient: true });
    expect(snapshot.workerPool.total).toBe(3);
    expect(snapshot.managedWorkers.total).toBe(2);
    expect(snapshot.managedWorkers.live).toBe(1);
    expect(snapshot.managedWorkers.terminated).toBe(1);
    expect(snapshot.managedWorkers.withErrors).toBe(1);
  });

  it('converts db check throw into failed probe result', async () => {
    const snapshot = await collectRuntimeSingletonHealthSnapshot({
      now: () => 1,
      checkDb: async () => {
        throw new Error('db unavailable');
      },
      getSupabaseHealth: () => ({ ok: true, kind: 'not_configured' }),
      getAcousticHealth: () => ({
        ok: true,
        initialized: false,
        memoryCacheSize: 0,
        hasWorker: false,
        pendingDeduplicationKeys: 0,
      }),
      getWorkerPoolStats: () => ({ total: 0, idle: 0, busy: 0, crashed: 0, terminated: 0 }),
      getManagedWorkers: () => [],
    });

    expect(snapshot.db).toEqual({ ok: false, reason: 'db unavailable' });
  });
});
