import {
  exportDatabaseAsJson,
  importDatabaseFromJson,
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
