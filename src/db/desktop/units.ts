import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  assertEditedSurfaceParts,
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import {
  clearAnalysisProjection,
  detachAnalysisAssociations,
  insertReviewSnapshot,
  nodeIdsOf,
  readAnalysisMaterial,
  type AnalysisAssociationLink,
  type AnalysisAssociationNote,
} from './analysisCandidates';
import { assertStoredCustomFields, writeUnitFieldValues } from './customFields';
import { claimTextSave, finishTextSave, textSaveDigest } from './textSave';
import { secToMs } from './timeMs';
import { readUnitTextBody, resolveUnitTextContext } from './unitTextLayers';

type SqliteDatabase = InstanceType<typeof Database>;

export type UnitSelfCertainty = 'not_understood' | 'uncertain' | 'certain';

export interface Unit {
  id: string;
  layerId: string;
  speakerId: string | null;
  parentUnitId: string | null;
  startMs: number | null;
  endMs: number | null;
  createdAt: string;
  updatedAt: string;
  text: string;
  textId: string | null;
  textLayerId: string;
  /** Machine-transcription confidence, 0–1. Null when none was stored. */
  confidence: number | null;
  skipProcessing: boolean;
}

export interface UnitCreate {
  layerId: string;
  textLayerId?: string;
  startMs: number | null;
  endMs: number | null;
  text: string;
  speakerId?: string | null;
  parentUnitId?: string | null;
  fieldValues?: Record<string, unknown>;
}

interface UnitRow {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string | null;
  start_ms: number | null;
  end_ms: number | null;
  created_at: string;
  updated_at: string;
  text: string;
  text_id: string | null;
  text_layer_id: string;
  confidence: number | null;
  skip_processing: number;
}

export function assertUnitTextRoleFree(
  db: SqliteDatabase,
  unitId: string,
  role: string,
  textLayerId?: string,
): void {
  const context = resolveUnitTextContext(db, unitId, textLayerId);
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = ?')
    .get(unitId, context.textLayerId, role) as { n: number };
  if (row.n !== 0) throw new Error('unit text role is duplicated');
}

function assertUnitSpan(start: number | null, end: number | null): void {
  if (start === null && end === null) return;
  if (
    start === null ||
    end === null ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start
  ) {
    throw new Error('unit time is invalid');
  }
}

function nextSortOrder(db: SqliteDatabase, layerId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS sortOrder FROM units WHERE layer_id = ?')
    .get(layerId) as { sortOrder: number };
  return row.sortOrder + 1;
}

export function sortOrderForInsert(
  db: SqliteDatabase,
  layerId: string,
  startMs: number | null,
): number {
  if (startMs === null) return nextSortOrder(db, layerId);
  const next = db
    .prepare(
      `SELECT sort_order AS sortOrder FROM units
       WHERE layer_id = ? AND start_ms IS NOT NULL AND start_ms > ?
       ORDER BY sort_order LIMIT 1`,
    )
    .get(layerId, startMs) as { sortOrder: number } | undefined;
  if (next === undefined) return nextSortOrder(db, layerId);
  // ponytail: two-step shift avoids a unique collision. Breaks if one layer exceeds 1000000 units.
  db.prepare(
    'UPDATE units SET sort_order = sort_order + 1000000 WHERE layer_id = ? AND sort_order >= ?',
  ).run(layerId, next.sortOrder);
  db.prepare(
    'UPDATE units SET sort_order = sort_order - 999999 WHERE layer_id = ? AND sort_order >= 1000000',
  ).run(layerId);
  return next.sortOrder;
}

function assertCreateInsideMedia(
  db: SqliteDatabase,
  layerId: string,
  start: number | null,
  end: number | null,
): void {
  if (start === null || end === null) return;
  const row = db
    .prepare(
      `SELECT media.duration AS duration
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       LEFT JOIN media ON media.id = manuscripts.media_id AND media.deleted_at IS NULL
       WHERE layers.id = ?`,
    )
    .get(layerId) as { duration: number | null } | undefined;
  if (!row || row.duration === null) return;
  if (start < 0 || end > secToMs(row.duration)) throw new Error('edge is outside the media');
}

/**
 * A time-subdivision unit sits fully inside a parent on one of its host layers and
 * shares that parent's speaker. Returns the speaker to write.
 */
function subdivisionSpeaker(db: SqliteDatabase, input: UnitCreate): string | null | undefined {
  const layer = db
    .prepare('SELECT tier_type AS tierType FROM layers WHERE id = ?')
    .get(input.layerId) as { tierType: string } | undefined;
  if (layer?.tierType !== 'time-subdivision') return input.speakerId;
  const parentId = input.parentUnitId;
  const parent =
    parentId != null && parentId.length > 0
      ? (db
          .prepare(
            `SELECT units.speaker_id AS speakerId, units.start_ms AS startMs, units.end_ms AS endMs
           FROM units
           JOIN layer_links ON layer_links.host_layer_id = units.layer_id AND layer_links.layer_id = ?
           WHERE units.id = ?`,
          )
          .get(input.layerId, parentId) as
          { speakerId: string | null; startMs: number | null; endMs: number | null } | undefined)
      : undefined;
  if (!parent) throw new Error('time subdivision needs a parent on its host layer');
  if (
    input.startMs === null ||
    input.endMs === null ||
    parent.startMs === null ||
    parent.endMs === null ||
    input.startMs < parent.startMs ||
    input.endMs > parent.endMs
  ) {
    throw new Error('time subdivision is outside its parent');
  }
  if (input.speakerId !== undefined && input.speakerId !== parent.speakerId) {
    throw new Error('time subdivision speaker differs from its parent');
  }
  return parent.speakerId;
}

export function createUnit(
  db: SqliteDatabase,
  input: UnitCreate,
  afterUnitInsert?: () => void,
): Unit {
  assertUnitSpan(input.startMs, input.endMs);
  assertCreateInsideMedia(db, input.layerId, input.startMs, input.endMs);
  const speakerId = subdivisionSpeaker(db, input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO units (
        id, layer_id, speaker_id, parent_unit_id, start_ms, end_ms, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.layerId,
      speakerId ?? null,
      input.parentUnitId ?? null,
      input.startMs,
      input.endMs,
      sortOrderForInsert(db, input.layerId, input.startMs),
      now,
      now,
    );
    afterUnitInsert?.();
    const textContext = resolveUnitTextContext(db, id, input.textLayerId);
    if (input.text.length > 0) {
      assertUnitTextRoleFree(db, id, textContext.role, textContext.textLayerId);
      db.prepare(
        `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), id, textContext.textLayerId, textContext.role, input.text, now);
    }
    writeUnitFieldValues(db, id, input.fieldValues);
    const unit = getUnit(db, id, textContext.textLayerId);
    if (!unit) throw new Error('unit readback failed');
    return unit;
  });
  return write();
}

/** Includes a unit whose manuscript is deleted. Writers use this so the delete trigger still reports. */
export function readStoredUnit(db: SqliteDatabase, id: string, textLayerId?: string): Unit | null {
  return readUnit(db, id, textLayerId, false);
}

export function getUnit(db: SqliteDatabase, id: string, textLayerId?: string): Unit | null {
  return readUnit(db, id, textLayerId, true);
}

function readUnit(
  db: SqliteDatabase,
  id: string,
  textLayerId: string | undefined,
  visible: boolean,
): Unit | null {
  if (db.prepare('SELECT 1 FROM units WHERE id = ?').get(id) === undefined) return null;
  const context = resolveUnitTextContext(db, id, textLayerId, { allowDeleted: true });
  const row = readUnitRow(db, id, context.textLayerId, visible);
  return row ? mapUnit(row) : null;
}

function readUnitRow(
  db: SqliteDatabase,
  id: string,
  textLayerId: string,
  visible: boolean,
): UnitRow | undefined {
  return db
    .prepare(
      `SELECT units.id, units.layer_id, units.speaker_id, units.parent_unit_id,
              units.start_ms, units.end_ms, units.confidence, units.skip_processing,
              units.created_at, units.updated_at,
              unit_texts.id AS text_id, COALESCE(unit_texts.body, '') AS text,
              text_layer.id AS text_layer_id
       FROM units
       JOIN layers AS source_layer ON source_layer.id = units.layer_id
       JOIN layers AS text_layer ON text_layer.id = ?
       JOIN manuscripts ON manuscripts.id = source_layer.manuscript_id
       LEFT JOIN unit_texts
         ON unit_texts.unit_id = units.id
        AND unit_texts.layer_id = text_layer.id
        AND unit_texts.role = text_layer.content_type
       WHERE units.id = ? ${
         visible
           ? 'AND manuscripts.deleted_at IS NULL AND source_layer.deleted_at IS NULL AND text_layer.deleted_at IS NULL'
           : ''
       }`,
    )
    .get(textLayerId, id) as UnitRow | undefined;
}

export function listUnits(db: SqliteDatabase, layerId: string): Unit[] {
  const target = db
    .prepare(
      'SELECT tier_type AS tierType, content_type AS contentType, deleted_at AS deletedAt FROM layers WHERE id = ?',
    )
    .get(layerId) as
    { tierType: string; contentType: string; deletedAt: string | null } | undefined;
  if (!target || target.deletedAt !== null || target.contentType === 'point') return [];
  const sources =
    target.tierType === 'symbolic-association'
      ? (db
          .prepare(
            `SELECT host_layer_id AS id FROM layer_links
             WHERE layer_id = ? ORDER BY is_preferred DESC, sort_order, host_layer_id`,
          )
          .all(layerId) as { id: string }[])
      : [{ id: layerId }];
  const sourceIds = [...new Set(sources.map((source) => source.id))];
  if (sourceIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT units.id, units.layer_id, units.speaker_id, units.parent_unit_id,
              units.start_ms, units.end_ms, units.confidence, units.skip_processing,
              units.created_at, units.updated_at,
              unit_texts.id AS text_id, COALESCE(unit_texts.body, '') AS text,
              target.id AS text_layer_id
       FROM units
       JOIN layers AS source ON source.id = units.layer_id
       JOIN layers AS target ON target.id = ?
       JOIN manuscripts ON manuscripts.id = source.manuscript_id
       LEFT JOIN unit_texts
         ON unit_texts.unit_id = units.id
        AND unit_texts.layer_id = target.id
        AND unit_texts.role = target.content_type
       WHERE units.layer_id IN (${sourceIds.map(() => '?').join(', ')})
         AND manuscripts.deleted_at IS NULL
         AND source.deleted_at IS NULL
         AND target.deleted_at IS NULL
       ORDER BY units.start_ms IS NULL, units.start_ms, units.layer_id, units.sort_order, units.id`,
    )
    .all(layerId, ...sourceIds) as UnitRow[];
  return rows.map(mapUnit);
}

export function updateBoundary(
  db: SqliteDatabase,
  input: { leftId: string; rightId: string; time: number },
  afterLeftUpdate?: () => void,
): { left: Unit; right: Unit } {
  const write = db.transaction(() => {
    const left = readStoredUnit(db, input.leftId);
    const right = readStoredUnit(db, input.rightId);
    if (!left || !right) throw new Error('boundary units are missing');
    if (
      left.layerId !== right.layerId ||
      left.startMs === null ||
      left.endMs === null ||
      right.startMs === null ||
      right.endMs === null ||
      left.endMs !== right.startMs
    ) {
      throw new Error('boundary units are not adjacent');
    }
    if (!Number.isInteger(input.time) || input.time <= left.startMs || input.time >= right.endMs) {
      throw new Error('boundary is outside the pair');
    }
    const now = new Date().toISOString();
    const extend = input.time > left.endMs;
    const setEnd = db.prepare('UPDATE units SET end_ms = ?, updated_at = ? WHERE id = ?');
    const setStart = db.prepare('UPDATE units SET start_ms = ?, updated_at = ? WHERE id = ?');
    if (extend) setStart.run(input.time, now, right.id);
    else setEnd.run(input.time, now, left.id);
    afterLeftUpdate?.();
    if (extend) setEnd.run(input.time, now, left.id);
    else setStart.run(input.time, now, right.id);
    const nextLeft = readStoredUnit(db, left.id);
    const nextRight = readStoredUnit(db, right.id);
    if (!nextLeft || !nextRight) throw new Error('boundary readback failed');
    return { left: nextLeft, right: nextRight };
  });
  return write();
}

export interface UnitTextUndo {
  unitId: string;
  textLayerId: string;
  analysisAffected: boolean;
  prior: {
    text: string;
    textExists: boolean;
    provenanceJson: string | null;
    graph: AnalysisGraphPayload | null;
    manuscriptId: string;
    links: AnalysisAssociationLink[];
    notes: AnalysisAssociationNote[];
    projectionTokenCount: number;
  };
  after: {
    text: string;
    textExists: boolean;
    provenanceJson: string | null;
    graphFingerprint: string;
    analysisGeneration: number;
    manuscriptGeneration: number;
  };
}

export function updateUnitText(
  db: SqliteDatabase,
  input: {
    unitId: string;
    textLayerId?: string;
    text: string;
    operationId?: string;
    provenanceJson?: string | null;
  },
  afterSnapshot?: () => void,
  remember?: (undo: UnitTextUndo) => void,
): Unit {
  const context = resolveUnitTextContext(db, input.unitId, input.textLayerId);
  const digest =
    input.operationId === undefined
      ? null
      : textSaveDigest(input.unitId, context.textLayerId, input.text);
  const analysisAffected =
    context.textLayerId === context.unitLayerId && context.role === 'transcription';
  let remembered: UnitTextUndo | null = null;
  const write = db.transaction(() => {
    if (input.operationId !== undefined && digest !== null) {
      if (claimTextSave(db, input.operationId, digest) === 'replay') {
        const current = readStoredUnit(db, input.unitId, context.textLayerId);
        if (!current) throw new Error('unit is missing');
        return current;
      }
    }
    const existing = readStoredUnit(db, input.unitId, context.textLayerId);
    if (!existing) throw new Error('unit is missing');
    assertManuscriptEditable(db, input.unitId);
    const currentText = readUnitTextBody(db, context);
    if (currentText.body === input.text) {
      if (input.operationId !== undefined && digest !== null) {
        finishTextSave(db, {
          operationId: input.operationId,
          digest,
          unitId: input.unitId,
          textLayerId: context.textLayerId,
          text: input.text,
        });
      }
      return existing;
    }
    const material = readAnalysisMaterial(db, input.unitId);
    if (analysisAffected && material.graph !== null) {
      insertReviewSnapshot(db, material);
      afterSnapshot?.();
    }
    const now = new Date().toISOString();
    if (input.text.length === 0) {
      db.prepare('DELETE FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = ?').run(
        input.unitId,
        context.textLayerId,
        context.role,
      );
    } else if (currentText.id === null) {
      db.prepare(
        `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, provenance_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        input.unitId,
        context.textLayerId,
        context.role,
        input.text,
        input.provenanceJson ?? null,
        now,
      );
    } else if (input.provenanceJson !== undefined) {
      db.prepare(
        'UPDATE unit_texts SET body = ?, provenance_json = ?, updated_at = ? WHERE id = ?',
      ).run(input.text, input.provenanceJson, now, currentText.id);
    } else {
      db.prepare(
        'UPDATE unit_texts SET body = ?, provenance_json = NULL, updated_at = ? WHERE id = ?',
      ).run(input.text, now, currentText.id);
    }
    if (analysisAffected && material.graph !== null) {
      db.prepare(
        `UPDATE units
         SET analysis_graph_json = NULL, graph_fingerprint = '', analysis_generation = analysis_generation + 1,
             updated_at = ?
         WHERE id = ?`,
      ).run(now, input.unitId);
      clearAnalysisProjection(db, input.unitId);
      detachAnalysisAssociations(db, input.unitId, nodeIdsOf(material.graph), now);
    } else {
      db.prepare('UPDATE units SET updated_at = ? WHERE id = ?').run(now, input.unitId);
    }
    db.prepare(
      'UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?',
    ).run(now, material.manuscriptId);
    const unit = readStoredUnit(db, input.unitId, context.textLayerId);
    const manuscript = db
      .prepare('SELECT generation FROM manuscripts WHERE id = ?')
      .get(material.manuscriptId) as { generation: number } | undefined;
    const root = analysisAffected ? getAnalysisRoot(db, input.unitId) : null;
    if (!unit || unit.text !== input.text || !manuscript || (analysisAffected && !root)) {
      throw new Error('unit text readback failed');
    }
    if (manuscript.generation !== material.manuscriptGeneration + 1) {
      throw new Error('unit text readback failed');
    }
    if (analysisAffected && material.graph !== null) {
      if (
        !root ||
        root.graph !== null ||
        root.analysisGeneration !== material.analysisGeneration + 1
      ) {
        throw new Error('unit text readback failed');
      }
    }
    if (input.operationId !== undefined && digest !== null) {
      finishTextSave(db, {
        operationId: input.operationId,
        digest,
        unitId: input.unitId,
        textLayerId: context.textLayerId,
        text: input.text,
      });
    }
    remembered = {
      unitId: input.unitId,
      textLayerId: context.textLayerId,
      analysisAffected,
      prior: {
        text: currentText.body,
        textExists: currentText.id !== null,
        provenanceJson: currentText.provenanceJson,
        graph: material.graph === null ? null : structuredClone(material.graph),
        manuscriptId: material.manuscriptId,
        links: structuredClone(material.links),
        notes: structuredClone(material.notes),
        projectionTokenCount: material.projection.tokens.length,
      },
      after: {
        text: input.text,
        textExists: input.text.length > 0,
        provenanceJson: input.text.length === 0 ? null : (input.provenanceJson ?? null),
        graphFingerprint:
          analysisAffected && material.graph !== null ? '' : material.graphFingerprint,
        analysisGeneration:
          analysisAffected && material.graph !== null
            ? material.analysisGeneration + 1
            : material.analysisGeneration,
        manuscriptGeneration: material.manuscriptGeneration + 1,
      },
    };
    return unit;
  });
  const unit = write();
  if (remembered !== null && unit.text === input.text) remember?.(remembered);
  return unit;
}

export interface AnalysisRoot {
  unitId: string;
  graph: AnalysisGraphPayload | null;
  analysisGeneration: number;
  graphFingerprint: string;
}

interface AnalysisRootRow {
  analysis_graph_json: string | null;
  analysis_generation: number;
  graph_fingerprint: string;
  text: string;
}

const ANALYSIS_ROOT = `
SELECT units.analysis_graph_json, units.analysis_generation, units.graph_fingerprint,
       COALESCE(unit_texts.body, '') AS text
FROM units
JOIN layers ON layers.id = units.layer_id
LEFT JOIN unit_texts
  ON unit_texts.unit_id = units.id
 AND unit_texts.layer_id = units.layer_id
 AND unit_texts.role = 'transcription'
WHERE units.id = ?
`;

export function getAnalysisRoot(db: SqliteDatabase, unitId: string): AnalysisRoot | null {
  const row = db.prepare(ANALYSIS_ROOT).get(unitId) as AnalysisRootRow | undefined;
  if (!row) return null;
  if (row.analysis_graph_json === null) {
    return {
      unitId,
      graph: null,
      analysisGeneration: row.analysis_generation,
      graphFingerprint: '',
    };
  }
  return {
    unitId,
    graph: validateAnalysisGraphPayload(JSON.parse(row.analysis_graph_json) as unknown, row.text),
    analysisGeneration: row.analysis_generation,
    graphFingerprint: row.graph_fingerprint,
  };
}

export function writeAnalysisRoot(
  db: SqliteDatabase,
  input: { unitId: string; graph: unknown; expectedAnalysisGeneration: number },
  afterWrite?: () => void,
): AnalysisRoot {
  const write = db.transaction(() => {
    const current = getAnalysisRoot(db, input.unitId);
    if (!current) throw new Error('unit is missing');
    if (current.analysisGeneration !== input.expectedAnalysisGeneration) {
      throw new Error('analysis generation does not match');
    }
    const text = readStoredUnit(db, input.unitId)?.text;
    if (text === undefined) throw new Error('unit is missing');
    const graph = validateAnalysisGraphPayload(input.graph, text);
    assertEditedSurfaceParts(current.graph, graph);
    assertStoredCustomFields(db, graph, input.unitId, { prior: current.graph });
    const fingerprint = analysisGraphFingerprint(graph);
    const generation = current.analysisGeneration + 1;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE units
       SET analysis_graph_json = ?, analysis_generation = ?, graph_fingerprint = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(graph), generation, fingerprint, now, input.unitId);
    afterWrite?.();
    const stored = getAnalysisRoot(db, input.unitId);
    if (
      !stored?.graph ||
      stored.analysisGeneration !== generation ||
      stored.graphFingerprint !== fingerprint ||
      JSON.stringify(stored.graph) !== JSON.stringify(graph)
    ) {
      throw new Error('analysis root readback failed');
    }
    return stored;
  });
  return write();
}

function assertManuscriptEditable(db: SqliteDatabase, unitId: string): void {
  const row = db
    .prepare(
      `SELECT manuscripts.deleted_at AS deletedAt
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { deletedAt: string | null } | undefined;
  if (row?.deletedAt != null) throw new Error('manuscript is deleted');
}

function mapUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    layerId: row.layer_id,
    speakerId: row.speaker_id,
    parentUnitId: row.parent_unit_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    text: row.text,
    textId: row.text_id,
    textLayerId: row.text_layer_id,
    confidence: row.confidence,
    skipProcessing: row.skip_processing === 1,
  };
}

export function setUnitSkipProcessing(
  db: SqliteDatabase,
  input: { unitId: string; skip: boolean },
): Unit {
  const write = db.transaction(() => {
    assertManuscriptEditable(db, input.unitId);
    const now = new Date().toISOString();
    db.prepare('UPDATE units SET skip_processing = ?, updated_at = ? WHERE id = ?').run(
      input.skip ? 1 : 0,
      now,
      input.unitId,
    );
    const unit = getUnit(db, input.unitId);
    if (!unit || unit.skipProcessing !== input.skip) throw new Error('unit skip readback failed');
    return unit;
  });
  return write();
}
