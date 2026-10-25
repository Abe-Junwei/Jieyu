import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export function getSettings(db: SqliteDatabase, projectId: string): Record<string, unknown> | null {
  const row = db.prepare('SELECT settings_json FROM project WHERE id = ?').get(projectId) as
    { settings_json: string } | undefined;
  if (!row) return null;
  const parsed: unknown = JSON.parse(row.settings_json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('project settings must be an object');
  }
  return parsed as Record<string, unknown>;
}

export function replaceSettings(
  db: SqliteDatabase,
  projectId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const body = JSON.stringify(settings);
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare('UPDATE project SET settings_json = ?, updated_at = ? WHERE id = ?').run(
      body,
      now,
      projectId,
    );
    const stored = getSettings(db, projectId);
    if (!stored) throw new Error('project row is missing');
    return stored;
  });
  return write();
}
