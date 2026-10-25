/**
 * Project row read (ADR-0083).
 * title_json, created_at, and updated_at are nullable and unread by migration.
 * No ALTER. name is not the title. An empty title or time is refused.
 */
import Database from 'better-sqlite3';
import type { MultiLangString, TextDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

const COLUMNS = ['title_json', 'created_at', 'updated_at'] as const;

function incomplete(): never {
  throw new Error('project row is incomplete');
}

function hasColumns(project: SqliteDatabase): boolean {
  const names = new Set<string>();
  for (const row of project.prepare('PRAGMA table_info(project)').all()) {
    if (
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { name?: unknown }).name === 'string'
    ) {
      names.add((row as { name: string }).name);
    }
  }
  return COLUMNS.every((column) => names.has(column));
}

function titleFromJson(value: unknown): MultiLangString {
  if (typeof value !== 'string') incomplete();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    incomplete();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) incomplete();
  const title: MultiLangString = {};
  for (const key of Object.keys(parsed)) {
    const text = (parsed as Record<string, unknown>)[key];
    if (typeof text !== 'string') incomplete();
    Object.defineProperty(title, key, { value: text, enumerable: true });
  }
  return title;
}

function time(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || Number.isNaN(Date.parse(value)))
    incomplete();
  return value;
}

function readProjectRow(project: SqliteDatabase, id: string): TextDocType | undefined {
  if (!hasColumns(project)) incomplete();
  const row: unknown = project
    .prepare('SELECT id, title_json, created_at, updated_at FROM project WHERE id = ?')
    .get(id);
  if (row === undefined) return undefined;
  if (typeof row !== 'object' || row === null) incomplete();
  const record = row as { title_json?: unknown; created_at?: unknown; updated_at?: unknown };
  return {
    id,
    title: titleFromJson(record.title_json),
    createdAt: time(record.created_at),
    updatedAt: time(record.updated_at),
  };
}

export function projectReadMethods(project: () => SqliteDatabase) {
  return {
    async readProject(textId: string): Promise<TextDocType | undefined> {
      const db = project();
      const id = textId.trim();
      if (id.length === 0) return undefined;
      return readProjectRow(db, id);
    },
  };
}
