import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { resolveUnitTextContext } from './unitTextLayers';
type SqliteDatabase = InstanceType<typeof Database>;
export interface FormalCut {
  layerId: string;
  cutIndex: number;
}
export interface SplitTextPreview {
  baseline: string;
  layers: {
    layerId: string;
    name: Record<string, string>;
    body: string;
    draft: string | null;
    baseBody: string | null;
  }[];
}

export function splitTextPreview(db: SqliteDatabase, unitId: string): SplitTextPreview {
  return db.transaction(() => {
    const context = resolveUnitTextContext(db, unitId);
    const layers = db
      .prepare(
        `SELECT layers.id AS layerId, layers.name_json AS name,
      COALESCE(unit_texts.body, '') AS body, unit_text_drafts.raw_input AS draft,
      unit_text_drafts.base_body AS baseBody
      FROM layers
      LEFT JOIN unit_texts ON unit_texts.layer_id = layers.id AND unit_texts.unit_id = ?
      LEFT JOIN unit_text_drafts ON unit_text_drafts.layer_id = layers.id AND unit_text_drafts.unit_id = ?
      WHERE layers.deleted_at IS NULL AND layers.modality = 'text'
      AND (layers.id = ? OR (layers.tier_type = 'symbolic-association' AND EXISTS (SELECT 1 FROM layer_links WHERE layer_id = layers.id AND host_layer_id = ?)))
      ORDER BY layers.id`,
      )
      .all(unitId, unitId, context.unitLayerId, context.unitLayerId) as {
      layerId: string;
      name: string;
      body: string;
      draft: string | null;
      baseBody: string | null;
    }[];
    const material = db.prepare(`SELECT * FROM units WHERE id = ?`).get(unitId);
    const texts = db
      .prepare('SELECT * FROM unit_texts WHERE unit_id = ? ORDER BY layer_id, role')
      .all(unitId);
    const drafts = db
      .prepare('SELECT * FROM unit_text_drafts WHERE unit_id = ? ORDER BY layer_id')
      .all(unitId);
    const baseline = createHash('sha256')
      .update(JSON.stringify([material, layers, texts, drafts]))
      .digest('hex');
    return {
      baseline,
      layers: layers.map((layer) => ({
        ...layer,
        name: JSON.parse(layer.name) as Record<string, string>,
      })),
    };
  })();
}

export function checkFormalCuts(
  db: SqliteDatabase,
  unitId: string,
  baseline: string,
  cuts: FormalCut[],
): SplitTextPreview {
  const preview = splitTextPreview(db, unitId);
  if (preview.baseline !== baseline) throw new Error('split base changed');
  if (new Set(cuts.map((cut) => cut.layerId)).size !== cuts.length)
    throw new Error('duplicate split layer');
  for (const cut of cuts) {
    const row = preview.layers.find((layer) => layer.layerId === cut.layerId);
    if (
      !row ||
      !Number.isInteger(cut.cutIndex) ||
      cut.cutIndex < 0 ||
      cut.cutIndex > row.body.length
    )
      throw new Error('split text point is outside the text');
    if (row.draft !== null && row.baseBody !== row.body) throw new Error('text draft conflicts');
  }
  return preview;
}
