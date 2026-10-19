import { exportDatabaseAsJson, importDatabaseFromJson } from '../db/io';
import {
  exportProjectScopedDatabaseAsJson,
  importProjectScopedDatabaseFromJson,
} from '../db/projectScopedSnapshot';
import type { ImportConflictStrategy, ImportResult } from '../db/types';

export async function exportToJSON(): Promise<string> {
  const snapshot = await exportDatabaseAsJson();
  return JSON.stringify(snapshot, null, 2);
}

export async function importFromJSON(
  payload: string,
  strategy: ImportConflictStrategy = 'upsert',
): Promise<ImportResult> {
  return importDatabaseFromJson(payload, { strategy });
}

export async function exportProjectScopedToJSON(textId: string): Promise<string> {
  const snapshot = await exportProjectScopedDatabaseAsJson(textId);
  return JSON.stringify(snapshot);
}

export async function importProjectScopedFromJSON(
  payload: string,
  textId: string,
): Promise<ImportResult> {
  return importProjectScopedDatabaseFromJson(payload, textId);
}
