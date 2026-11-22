import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';
import { insertHostLinks } from './layerHosts';
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
  modality: string;
  sortOrder: number;
  laneHeight: number | null;
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
  /** Transcription layers this text layer reads units from. First preferred, else the first. */
  hosts?: LayerHostInput[];
}

export type LayerLinkType = 'direct' | 'free' | 'literal' | 'pedagogical';

export interface LayerHostInput {
  hostLayerId: string;
  linkType?: LayerLinkType;
  preferred?: boolean;
}

export interface LayerLink {
  layerId: string;
  hostLayerId: string;
  linkType: LayerLinkType;
  isPreferred: boolean;
  sortOrder: number;
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
  modality: string;
  sort_order: number;
  lane_height: number | null;
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
    insertHostLinks(db, id, input.manuscriptId, input.hosts ?? [], now);
    const layer = getLayer(db, id);
    if (!layer) throw new Error('layer readback failed');
    return layer;
  });
  return write();
}

export function listLayers(db: SqliteDatabase, manuscriptId: string): Layer[] {
  const rows = db
    .prepare(
      `SELECT layers.id, layers.manuscript_id, layers.key, layers.name_json, layers.tier_type,
              layers.content_type, layers.language_id, layers.orthography_id, layers.parent_id,
              layers.modality, layers.sort_order, layers.lane_height, layers.created_at, layers.updated_at
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE layers.manuscript_id = ? AND manuscripts.deleted_at IS NULL
         AND layers.deleted_at IS NULL
       ORDER BY layers.sort_order, layers.id`,
    )
    .all(manuscriptId) as LayerRow[];
  return rows.map(mapLayer);
}

export function getLayer(db: SqliteDatabase, id: string): Layer | null {
  const row = db
    .prepare(
      `SELECT layers.id, layers.manuscript_id, layers.key, layers.name_json, layers.tier_type,
              layers.content_type, layers.language_id, layers.orthography_id, layers.parent_id,
              layers.modality, layers.sort_order, layers.lane_height, layers.created_at, layers.updated_at
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE layers.id = ? AND manuscripts.deleted_at IS NULL`,
    )
    .get(id) as LayerRow | undefined;
  if (!row) return null;
  return mapLayer(row);
}

export function listLayerLinks(db: SqliteDatabase, manuscriptId: string): LayerLink[] {
  const rows = db
    .prepare(
      `SELECT layer_links.layer_id, layer_links.host_layer_id, layer_links.link_type,
              layer_links.is_preferred, layer_links.sort_order
       FROM layer_links
       JOIN manuscripts ON manuscripts.id = layer_links.manuscript_id
       JOIN layers AS child ON child.id = layer_links.layer_id AND child.deleted_at IS NULL
       JOIN layers AS host ON host.id = layer_links.host_layer_id AND host.deleted_at IS NULL
       WHERE layer_links.manuscript_id = ? AND manuscripts.deleted_at IS NULL
       ORDER BY layer_links.layer_id, layer_links.sort_order, layer_links.host_layer_id`,
    )
    .all(manuscriptId) as Array<{
    layer_id: string;
    host_layer_id: string;
    link_type: LayerLinkType;
    is_preferred: number;
    sort_order: number;
  }>;
  return rows.map((row) => ({
    layerId: row.layer_id,
    hostLayerId: row.host_layer_id,
    linkType: row.link_type,
    isPreferred: row.is_preferred === 1,
    sortOrder: row.sort_order,
  }));
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
    modality: row.modality,
    sortOrder: row.sort_order,
    laneHeight: row.lane_height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
