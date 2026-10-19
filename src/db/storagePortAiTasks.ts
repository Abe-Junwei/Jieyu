import { getDb } from './engine';
import { validateAiTaskDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { AiTaskDoc } from './types';

export async function readAiTask(id: string): Promise<AiTaskDoc | undefined> {
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.ai_tasks.get(id);
}

export async function listAiTasks(): Promise<AiTaskDoc[]> {
  const database = await getDb();
  // shortcut(P2-3): 全局表，量小 | global table, small
  return database.dexie.ai_tasks.toArray();
}

export async function listAiTasksByStatus(status: AiTaskDoc['status']): Promise<AiTaskDoc[]> {
  const database = await getDb();
  return database.dexie.ai_tasks.where('status').equals(status).toArray();
}

export async function insertAiTask(doc: AiTaskDoc): Promise<void> {
  validateAiTaskDoc(doc);
  const database = await getDb();
  await database.dexie.ai_tasks.put(doc);
  const stored = await database.dexie.ai_tasks.get(doc.id);
  if (!stored || stored.id !== doc.id) throw new StorageReadbackError('insertAiTask');
}

/** Partial update. A missing row is a no-op, matching collection `update`. */
export async function patchAiTask(id: string, patch: Partial<AiTaskDoc>): Promise<void> {
  if (id.length === 0) return;
  const database = await getDb();
  const updated = await database.dexie.ai_tasks.update(id, patch);
  if (updated === 0) return;
  const stored = await database.dexie.ai_tasks.get(id);
  if (!stored || stored.id !== id) throw new StorageReadbackError('patchAiTask');
}
