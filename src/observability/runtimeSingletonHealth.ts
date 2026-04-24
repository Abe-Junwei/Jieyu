import { jieyuDatabaseSingletonHealthCheck, type DbIntegrityProbeResult } from '../db/dbIntegrityProbe';
import { getSupabaseBrowserClientHealth, type SupabaseBrowserClientHealth } from '../integrations/supabase/client';
import { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
import { getManagedWorkerRegistrySnapshot, type ManagedWorkerRegistryEntry } from './managedWorkerRegistry';
import { getWorkerPool, type WorkerPoolStats } from '../workers/WorkerPool';

export interface RuntimeSingletonHealthSnapshot {
  generatedAtMs: number;
  db: DbIntegrityProbeResult;
  supabase: SupabaseBrowserClientHealth;
  acoustic: ReturnType<typeof AcousticAnalysisService.getHealthSnapshot>;
  workerPool: WorkerPoolStats;
  managedWorkers: {
    total: number;
    live: number;
    terminated: number;
    withErrors: number;
    entries: readonly ManagedWorkerRegistryEntry[];
  };
}

interface RuntimeSingletonHealthDeps {
  now: () => number;
  checkDb: () => Promise<DbIntegrityProbeResult>;
  getSupabaseHealth: () => SupabaseBrowserClientHealth;
  getAcousticHealth: () => ReturnType<typeof AcousticAnalysisService.getHealthSnapshot>;
  getWorkerPoolStats: () => WorkerPoolStats;
  getManagedWorkers: () => readonly ManagedWorkerRegistryEntry[];
}

function defaultDeps(): RuntimeSingletonHealthDeps {
  return {
    now: Date.now,
    checkDb: jieyuDatabaseSingletonHealthCheck,
    getSupabaseHealth: getSupabaseBrowserClientHealth,
    getAcousticHealth: AcousticAnalysisService.getHealthSnapshot,
    getWorkerPoolStats: () => getWorkerPool().stats(),
    getManagedWorkers: getManagedWorkerRegistrySnapshot,
  };
}

function summarizeManagedWorkers(entries: readonly ManagedWorkerRegistryEntry[]): RuntimeSingletonHealthSnapshot['managedWorkers'] {
  const total = entries.length;
  let live = 0;
  let terminated = 0;
  let withErrors = 0;
  for (const entry of entries) {
    if (entry.state === 'live') {
      live += 1;
    } else {
      terminated += 1;
    }
    if ((entry.errorEventCount + entry.messageErrorEventCount) > 0) {
      withErrors += 1;
    }
  }
  return { total, live, terminated, withErrors, entries };
}

export async function collectRuntimeSingletonHealthSnapshot(
  partialDeps: Partial<RuntimeSingletonHealthDeps> = {},
): Promise<RuntimeSingletonHealthSnapshot> {
  const deps: RuntimeSingletonHealthDeps = {
    ...defaultDeps(),
    ...partialDeps,
  };

  let dbResult: DbIntegrityProbeResult;
  try {
    dbResult = await deps.checkDb();
  } catch (error) {
    dbResult = {
      ok: false,
      reason: error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'unknown-error',
    };
  }

  const managedEntries = deps.getManagedWorkers();

  return {
    generatedAtMs: deps.now(),
    db: dbResult,
    supabase: deps.getSupabaseHealth(),
    acoustic: deps.getAcousticHealth(),
    workerPool: deps.getWorkerPoolStats(),
    managedWorkers: summarizeManagedWorkers(managedEntries),
  };
}
