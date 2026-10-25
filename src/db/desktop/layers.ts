import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Layer {
  id: string;
  manuscriptId: string;
  key: string;
  name: Record<string, string>;
  tierType: string;
  contentType: string;
  languageId: string | null;
  orthographyId: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LayerCreate {
  manuscriptId: string;
  key: string;
  name: Record<string, string>;
  tierType: string;
  contentType: string;
  languageId?: string | null;
  orthographyId?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  fieldValues?: Record<string, unknown>;
}

interface LayerRow {
  id: string;
  manuscript_id: string;
  key: string;
  name_json: string;
  tier_type: string;
  content_type: string;
  language_id: string | null;
  orthography_id: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function createLayer(db: SqliteDatabase, input: LayerCreate): Layer {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO layers (
        id, manuscript_id, key, name_json, tier_type, content_type,
        language_id, orthography_id, parent_id, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.manuscriptId,
      input.key,
      JSON.stringify(input.name),
      input.tierType,
      input.contentType,
      input.languageId ?? null,
      input.orthographyId ?? null,
      input.parentId ?? null,
      input.sortOrder ?? 0,
      now,
      now,
    );
    writeRequiredFieldValues(db, 'layer', id, input.fieldValues);
    const layer = getLayer(db, id);
    if (!layer) throw new Error('layer readback failed');
    return layer;
  });
  return write();
}

export function listLayers(db: SqliteDatabase, manuscriptId: string): Layer[] {
  const rows = db
    .prepare(
      `SELECT id, manuscript_id, key, name_json, tier_type, content_type,
              language_id, orthography_id, parent_id, sort_order, created_at, updated_at
       FROM layers WHERE manuscript_id = ? ORDER BY sort_order, id`,
    )
    .all(manuscriptId) as LayerRow[];
  return rows.map(mapLayer);
}

export function getLayer(db: SqliteDatabase, id: string): Layer | null {
  const row = db
    .prepare(
      `SELECT id, manuscript_id, key, name_json, tier_type, content_type,
            language_id, orthography_id, parent_id, sort_order, created_at, updated_at
     FROM layers WHERE id = ?`,
    )
    .get(id) as LayerRow | undefined;
  if (!row) return null;
  return mapLayer(row);
}

function mapLayer(row: LayerRow): Layer {
  return {
    id: row.id,
    manuscriptId: row.manuscript_id,
    key: row.key,
    name: readStringMap(row.name_json),
    tierType: row.tier_type,
    contentType: row.content_type,
    languageId: row.language_id,
    orthographyId: row.orthography_id,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
