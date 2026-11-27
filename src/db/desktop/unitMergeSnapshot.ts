import { createHash } from 'node:crypto';
import { nodeIdsOf } from './unitSpan';
import { readStoredUnit } from './units';
import { textsOf, type MovedRef, type SqliteDatabase } from './unitMergeShared';

export function refsIntact(db: SqliteDatabase, refs: readonly MovedRef[]): boolean {
  const read = db.prepare(
    `SELECT value_json FROM custom_field_values
     WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
  );
  return refs.every((ref) => {
    const row = read.get(ref.definitionId, ref.targetType, ref.targetId) as
      { value_json: string } | undefined;
    return row?.value_json === ref.nextJson;
  });
}

export function afterFingerprint(db: SqliteDatabase, unitId: string): string {
  const current = readStoredUnit(db, unitId);
  if (current === null) return '';
  const texts = textsOf(db, unitId);
  const clips = db
    .prepare(
      `SELECT unit_text_audios.id AS id
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ?
       ORDER BY unit_text_audios.unit_text_id, unit_text_audios.position`,
    )
    .all(unitId);
  const children = db
    .prepare(`SELECT id, start_ms, end_ms FROM units WHERE parent_unit_id = ? ORDER BY id`)
    .all(unitId) as { id: string; start_ms: number | null; end_ms: number | null }[];
  const childTexts = children.flatMap((child) =>
    textsOf(db, child.id).map((row) => ({ id: child.id, ...row })),
  );
  const drafts = db
    .prepare(`SELECT layer_id, raw_input FROM unit_text_drafts WHERE unit_id = ? ORDER BY layer_id`)
    .all(unitId);
  const graph = db
    .prepare(
      `SELECT analysis_graph_json, analysis_generation, graph_fingerprint
       FROM units WHERE id = ?`,
    )
    .get(unitId) as { analysis_graph_json: string | null };
  const tokenIds = (
    db.prepare('SELECT id FROM tokens WHERE unit_id = ? ORDER BY token_index').all(unitId) as {
      id: string;
    }[]
  ).map((row) => row.id);
  const morphemeIds =
    tokenIds.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT morphemes.id AS id FROM morphemes
               JOIN tokens ON tokens.id = morphemes.token_id
               WHERE tokens.unit_id = ? ORDER BY morphemes.id`,
            )
            .all(unitId) as { id: string }[]
        ).map((row) => row.id);
  const targets = [...tokenIds, ...morphemeIds, ...nodeIdsOf(graph.analysis_graph_json)];
  const links =
    targets.length === 0
      ? []
      : db
          .prepare(
            `SELECT id, target_id FROM token_lexeme_links
             WHERE target_id IN (${targets.map(() => '?').join(', ')}) ORDER BY id`,
          )
          .all(...targets);
  const kept = {
    unit: {
      start: current.startMs,
      end: current.endMs,
      speaker: current.speakerId,
      parent: current.parentUnitId,
      skip: current.skipProcessing,
    },
    texts,
    clips,
    children,
    childTexts,
    drafts,
    graph,
    notes: db
      .prepare(
        `SELECT id, unit_text_id, content_json, attachment FROM notes
         WHERE unit_id = ? ORDER BY id`,
      )
      .all(unitId),
    fields: db
      .prepare(
        `SELECT definition_id, target_type, target_id, value_json FROM custom_field_values
         WHERE (target_type = 'unit' AND target_id = ?)
            OR (target_type = 'note' AND target_id IN (SELECT id FROM notes WHERE unit_id = ?))
         ORDER BY definition_id, target_id`,
      )
      .all(unitId, unitId),
    candidates: db
      .prepare(
        `SELECT id, kind, status, graph_fingerprint FROM analysis_candidates
         WHERE unit_id = ? ORDER BY id`,
      )
      .all(unitId),
    tokenIds,
    morphemeIds,
    links,
    batches: db
      .prepare('SELECT id FROM reception_batches WHERE unit_id = ? ORDER BY id')
      .all(unitId),
    batchMaps: db
      .prepare(
        `SELECT local_id_map.batch_id, local_id_map.scope, local_id_map.local_id
         FROM local_id_map
         JOIN reception_batches ON reception_batches.id = local_id_map.batch_id
         WHERE reception_batches.unit_id = ?
         ORDER BY local_id_map.batch_id, local_id_map.scope, local_id_map.local_id`,
      )
      .all(unitId),
    acceptances: db
      .prepare('SELECT id FROM transcription_acceptances WHERE unit_id = ? ORDER BY id')
      .all(unitId),
    timeDrafts: db
      .prepare(
        `SELECT edge, raw_input, base_ms FROM unit_time_drafts
         WHERE unit_id = ? ORDER BY edge`,
      )
      .all(unitId),
    receipts: db
      .prepare(
        `SELECT operation_id, digest, layer_id FROM text_save_receipts
         WHERE unit_id = ? ORDER BY operation_id`,
      )
      .all(unitId),
  };
  return createHash('sha256').update(JSON.stringify(kept)).digest('hex');
}
