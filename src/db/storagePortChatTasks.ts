import { getDb } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import type { AiTaskDoc } from './types';

function trimmed(id: string): string {
  return id.trim();
}

export async function readAiTask(id: string): Promise<AiTaskDoc | undefined> {
  const taskId = trimmed(id);
  if (taskId.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_tasks.get(taskId);
}

export async function listAiTasks(): Promise<AiTaskDoc[]> {
  const database = await getDb();
  // shortcut(P2-3): 全局表，量小 | global table, small
  return database.dexie.ai_tasks.toArray();
}

export async function patchAiTask(id: string, patch: Partial<AiTaskDoc>): Promise<boolean> {
  const taskId = trimmed(id);
  if (taskId.length === 0) return false;
  const database = await getDb();
  const current = await database.dexie.ai_tasks.get(taskId);
  if (!current) return false;
  const next: AiTaskDoc = { ...current, ...patch, id: taskId };
  await database.dexie.ai_tasks.put(next);
  const stored = await database.dexie.ai_tasks.get(taskId);
  if (!stored || stored.id !== taskId) throw new StorageReadbackError('patchAiTask');
  if (patch.status !== undefined && stored.status !== patch.status) {
    throw new StorageReadbackError('patchAiTask');
  }
  if (patch.updatedAt !== undefined && stored.updatedAt !== patch.updatedAt) {
    throw new StorageReadbackError('patchAiTask');
  }
  return true;
}
