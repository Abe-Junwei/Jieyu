import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface UnitTextContext {
  unitId: string;
  unitLayerId: string;
  textLayerId: string;
  role: string;
  manuscriptId: string;
}

interface UnitTextContextRow {
  unit_layer_id: string;
  text_layer_id: string;
  content_type: string;
  tier_type: string;
  unit_manuscript_id: string;
  text_manuscript_id: string;
  deleted_at: string | null;
  source_deleted: string | null;
  target_deleted: string | null;
  linked: number;
}

export function resolveUnitTextContext(
  db: SqliteDatabase,
  unitId: string,
  textLayerId?: string,
  options: { allowDeleted?: boolean } = {},
): UnitTextContext {
  const unit = db.prepare('SELECT layer_id FROM units WHERE id = ?').get(unitId) as
    { layer_id: string } | undefined;
  if (!unit) throw new Error('unit is missing');
  const targetId = textLayerId ?? unit.layer_id;
  const row = db
    .prepare(
      `SELECT units.layer_id AS unit_layer_id,
              target.id AS text_layer_id,
              target.content_type,
              target.tier_type,
              source.manuscript_id AS unit_manuscript_id,
              target.manuscript_id AS text_manuscript_id,
              manuscript.deleted_at,
              source.deleted_at AS source_deleted,
              target.deleted_at AS target_deleted,
              EXISTS (
                SELECT 1 FROM layer_links
                WHERE layer_links.layer_id = target.id
                  AND layer_links.host_layer_id = units.layer_id
              ) AS linked
       FROM units
       JOIN layers AS source ON source.id = units.layer_id
       JOIN manuscripts AS manuscript ON manuscript.id = source.manuscript_id
       JOIN layers AS target ON target.id = ?
       WHERE units.id = ?`,
    )
    .get(targetId, unitId) as UnitTextContextRow | undefined;
  if (!row) throw new Error('text layer is missing');
  if (row.deleted_at !== null && options.allowDeleted !== true) {
    throw new Error('manuscript is deleted');
  }
  if (
    options.allowDeleted !== true &&
    (row.source_deleted !== null || row.target_deleted !== null)
  ) {
    throw new Error('layer is deleted');
  }
  if (
    row.text_manuscript_id !== row.unit_manuscript_id ||
    (row.text_layer_id !== row.unit_layer_id && row.linked !== 1)
  ) {
    throw new Error('unit text layer is not linked to its unit');
  }
  if (row.tier_type === 'time-aligned' && row.text_layer_id !== row.unit_layer_id) {
    throw new Error('unit text stays on its layer');
  }
  if (row.content_type === 'point') throw new Error('point layer does not accept unit text');
  return {
    unitId,
    unitLayerId: row.unit_layer_id,
    textLayerId: row.text_layer_id,
    role: row.content_type,
    manuscriptId: row.unit_manuscript_id,
  };
}

export function readUnitTextBody(
  db: SqliteDatabase,
  context: UnitTextContext,
): {
  id: string | null;
  body: string;
  selfCertainty: string | null;
  provenanceJson: string | null;
} {
  const row = db
    .prepare(
      `SELECT id, body, self_certainty, provenance_json FROM unit_texts
       WHERE unit_id = ? AND layer_id = ? AND role = ?`,
    )
    .get(context.unitId, context.textLayerId, context.role) as
    | { id: string; body: string; self_certainty: string | null; provenance_json: string | null }
    | undefined;
  return row === undefined
    ? { id: null, body: '', selfCertainty: null, provenanceJson: null }
    : {
        id: row.id,
        body: row.body,
        selfCertainty: row.self_certainty,
        provenanceJson: row.provenance_json,
      };
}
