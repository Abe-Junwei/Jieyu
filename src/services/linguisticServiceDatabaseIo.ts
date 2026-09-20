import {
  exportDatabaseAsJson,
  exportProjectScopedDatabaseAsJson,
  importDatabaseFromJson,
  importProjectScopedDatabaseFromJson,
  type ImportConflictStrategy,
  type ImportResult,
} from '../db';

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
