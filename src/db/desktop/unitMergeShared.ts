import type Database from 'better-sqlite3';
import { getSettings, replaceSettings } from './settings';
import { readRemovedUnit, type RemovedUnit } from './unitSpan';

export type SqliteDatabase = InstanceType<typeof Database>;

export interface UnitMergeInput {
  unitIds?: string[];
  textOverrides?: { layerId: string; text: string }[];
  keepId: string;
  removeId: string;
  operationId?: string;
  separator?: string;
  discardAudioIds?: string[];
  baseline?: string;
  /** Redo reuses the id from the first merge. */
  newId?: string;
  /** Visible text frozen when the confirm dialog opened, for this layer only. */
  textLayerId?: string;
  keepText?: string;
  removeText?: string;
}

export interface TextDraftRow {
  unit_id: string;
  layer_id: string;
  raw_input: string;
  base_body: string;
  provenance_json: string | null;
  updated_at: string;
}

export interface ChildUnit {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string;
  start_ms: number | null;
  end_ms: number | null;
}

export interface SaveReceiptRow {
  operation_id: string;
  digest: string;
  unit_id: string;
  layer_id: string;
  committed_at: string;
}

export interface MovedRef {
  definitionId: string;
  targetType: string;
  targetId: string;
  valueJson: string;
  nextJson: string;
  updatedAt: string;
}

export type Side = RemovedUnit;
export type TextRow = RemovedUnit['texts'][number];

export interface UnitMergeUndo {
  redoBaseline?: string;
  sources?: RemovedUnit[];
  textOverrides?: { layerId: string; text: string }[];
  operationId: string;
  newId: string;
  manuscriptId: string;
  manuscriptGeneration: number;
  earlier: RemovedUnit;
  later: RemovedUnit;
  separator: string;
  discardAudioIds: string[];
  fingerprint: string;
  children: { id: string; parentId: string }[];
  drafts: TextDraftRow[];
  refs: MovedRef[];
  saveReceipts: SaveReceiptRow[];
  textLayerId?: string;
  keepText?: string;
  removeText?: string;
}

export interface MergeClip {
  id: string;
  unitId: string;
  layerId: string;
  fileId: string;
}

export interface MergeTextPreview {
  layerId: string;
  name: Record<string, string>;
  official: string;
  draft: string | null;
  result: string;
}

export interface MergePreview {
  unitIds?: string[];
  texts: MergeTextPreview[];
  keepId: string;
  removeId: string;
  gapMs: number;
  noteCount: number;
  separator: string;
  baseline: string;
  earlier: MergeClip[];
  later: MergeClip[];
}

export function orderedPair(db: SqliteDatabase, leftId: string, rightId: string): [Side, Side] {
  const left = readRemovedUnit(db, leftId);
  const right = readRemovedUnit(db, rightId);
  if (left.unit.id === right.unit.id) throw new Error('units are not in the same layer');
  const leftStart = left.unit.start_ms;
  const rightStart = right.unit.start_ms;
  if (leftStart === null || rightStart === null) return [left, right];
  return leftStart <= rightStart ? [left, right] : [right, left];
}

export function assertPair(db: SqliteDatabase, earlier: Side, later: Side): void {
  if (earlier.unit.layer_id !== later.unit.layer_id) {
    throw new Error('units are not in the same layer');
  }
  if (earlier.unit.speaker_id !== later.unit.speaker_id) {
    throw new Error('units do not share a speaker');
  }
  if (earlier.unit.parent_unit_id !== later.unit.parent_unit_id) {
    throw new Error('units do not share a parent');
  }
  if (
    earlier.unit.start_ms === null ||
    earlier.unit.end_ms === null ||
    later.unit.start_ms === null ||
    later.unit.end_ms === null
  ) {
    throw new Error('units need a saved time');
  }
  if (earlier.unit.end_ms > later.unit.start_ms) throw new Error('units are not adjacent');
  if (later.unit.sort_order <= earlier.unit.sort_order) {
    throw new Error('timed units are out of sort order');
  }
  const drafted = db
    .prepare('SELECT COUNT(*) AS n FROM unit_time_drafts WHERE unit_id IN (?, ?)')
    .get(earlier.unit.id, later.unit.id) as { n: number };
  if (drafted.n > 0) throw new Error('unit has a time draft');
  if (betweenIds(db, earlier, later).length > 0) throw new Error('a unit sits between the pair');
}

export function betweenIds(db: SqliteDatabase, earlier: Side, later: Side): string[] {
  if (earlier.unit.end_ms === null || later.unit.start_ms === null) return [];
  const rows = db
    .prepare(
      `SELECT id FROM units
       WHERE layer_id = ? AND id NOT IN (?, ?)
         AND start_ms IS NOT NULL
         AND start_ms >= ? AND end_ms <= ?
         AND ((speaker_id IS NULL AND ? IS NULL) OR speaker_id = ?)
       ORDER BY start_ms, id`,
    )
    .all(
      earlier.unit.layer_id,
      earlier.unit.id,
      later.unit.id,
      earlier.unit.end_ms,
      later.unit.start_ms,
      earlier.unit.speaker_id,
      earlier.unit.speaker_id,
    ) as { id: string }[];
  return rows.map((row) => row.id);
}

export function childrenOf(db: SqliteDatabase, earlierId: string, laterId: string): ChildUnit[] {
  return db
    .prepare(
      `SELECT id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms
       FROM units WHERE parent_unit_id IN (?, ?) ORDER BY id`,
    )
    .all(earlierId, laterId) as ChildUnit[];
}

export function assertChildren(children: ChildUnit[], start: number, end: number): void {
  for (const child of children) {
    if (child.start_ms === null || child.end_ms === null) continue;
    if (child.start_ms < start || child.end_ms > end) {
      throw new Error('a child falls outside the merged span');
    }
  }
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      const left = children[i];
      const right = children[j];
      if (!left || !right) continue;
      if (left.layer_id !== right.layer_id || left.speaker_id !== right.speaker_id) continue;
      if (
        left.start_ms === null ||
        left.end_ms === null ||
        right.start_ms === null ||
        right.end_ms === null
      ) {
        continue;
      }
      if (left.start_ms < right.end_ms && right.start_ms < left.end_ms) {
        throw new Error('child intervals overlap');
      }
    }
  }
}

export function draftsOf(db: SqliteDatabase, earlierId: string, laterId: string): TextDraftRow[] {
  return db
    .prepare(
      `SELECT unit_id, layer_id, raw_input, base_body, provenance_json, updated_at
       FROM unit_text_drafts WHERE unit_id IN (?, ?) ORDER BY unit_id, layer_id`,
    )
    .all(earlierId, laterId) as TextDraftRow[];
}

export function receiptsOf(
  db: SqliteDatabase,
  earlierId: string,
  laterId: string,
): SaveReceiptRow[] {
  return db
    .prepare(
      `SELECT operation_id, digest, unit_id, layer_id, committed_at
       FROM text_save_receipts WHERE unit_id IN (?, ?) ORDER BY operation_id`,
    )
    .all(earlierId, laterId) as SaveReceiptRow[];
}

export function textsOf(
  db: SqliteDatabase,
  unitId: string,
): { layer: string; body: string; selfCertainty: string | null }[] {
  return db
    .prepare(
      `SELECT layer_id AS layer, body, self_certainty AS selfCertainty FROM unit_texts WHERE unit_id = ? ORDER BY layer_id, role`,
    )
    .all(unitId) as { layer: string; body: string; selfCertainty: string | null }[];
}

export function clipsOf(db: SqliteDatabase, unitId: string): MergeClip[] {
  return db
    .prepare(
      `SELECT unit_text_audios.id AS id, unit_texts.unit_id AS unitId,
              unit_texts.layer_id AS layerId, unit_text_audios.file_id AS fileId
       FROM unit_text_audios
       JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
       WHERE unit_texts.unit_id = ?
       ORDER BY unit_text_audios.position, unit_text_audios.id`,
    )
    .all(unitId) as MergeClip[];
}

export function noteCountOf(db: SqliteDatabase, earlierId: string, laterId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT notes.id) AS n FROM notes
       WHERE notes.unit_id IN (?, ?)
          OR notes.unit_text_id IN (SELECT id FROM unit_texts WHERE unit_id IN (?, ?))`,
    )
    .get(earlierId, laterId, earlierId, laterId) as { n: number };
  return row.n;
}

export function noteCount(db: SqliteDatabase, textId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM notes WHERE unit_text_id = ?').get(textId) as {
      n: number;
    }
  ).n;
}

export function fieldMap(db: SqliteDatabase, unitId: string): Record<string, unknown> {
  const rows = db
    .prepare(
      `SELECT definition_id, value_json FROM custom_field_values
       WHERE target_type = 'unit' AND target_id = ? ORDER BY definition_id`,
    )
    .all(unitId) as { definition_id: string; value_json: string }[];
  const fields: Record<string, unknown> = {};
  for (const row of rows) fields[row.definition_id] = JSON.parse(row.value_json) as unknown;
  return fields;
}

export function chosenSeparator(db: SqliteDatabase, separator: string | undefined): string {
  if (separator !== undefined) return separator;
  const stored = readSeparator(db);
  return stored ?? ' ';
}

export function storeSeparator(db: SqliteDatabase, separator: string | undefined): void {
  if (separator === undefined) return;
  const project = db.prepare('SELECT id FROM project').get() as { id: string } | undefined;
  if (project === undefined) return;
  const settings = getSettings(db, project.id) ?? {};
  const stored = typeof settings.mergeSeparator === 'string' ? settings.mergeSeparator : ' ';
  if (separator === stored) return;
  replaceSettings(db, project.id, { ...settings, mergeSeparator: separator });
}

export function readSeparator(db: SqliteDatabase): string | null {
  const project = db.prepare('SELECT id FROM project').get() as { id: string } | undefined;
  if (project === undefined) return null;
  const settings = getSettings(db, project.id);
  const value = settings?.mergeSeparator;
  return typeof value === 'string' ? value : null;
}

export function manuscriptOf(
  db: SqliteDatabase,
  unitId: string,
): { manuscriptId: string; generation: number } {
  const row = db
    .prepare(
      `SELECT manuscripts.id AS manuscriptId, manuscripts.generation AS generation
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { manuscriptId: string; generation: number } | undefined;
  if (!row) throw new Error('unit is missing');
  return row;
}

export function bumpGeneration(db: SqliteDatabase, manuscriptId: string, now: string): void {
  db.prepare('UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?').run(
    now,
    manuscriptId,
  );
}

/** Full same-speaker order, never a filtered view. Pair callers use the same array kernel. */
export function orderedSources(
  db: SqliteDatabase,
  input: { keepId: string; removeId: string; unitIds?: string[] },
): Side[] {
  const ids = input.unitIds ?? [input.keepId, input.removeId];
  if (
    ids.length < 2 ||
    new Set(ids).size !== ids.length ||
    !ids.includes(input.keepId) ||
    !ids.includes(input.removeId)
  )
    throw new Error('invalid merge selection');
  const sides = ids
    .map((id) => readRemovedUnit(db, id))
    .sort((a, b) => (a.unit.start_ms ?? 0) - (b.unit.start_ms ?? 0));
  for (let i = 1; i < sides.length; i++) assertPair(db, sides[i - 1]!, sides[i]!);
  return sides;
}
