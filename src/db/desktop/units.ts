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

type SqliteDatabase = InstanceType<typeof Database>;

export interface Unit {
  id: string;
  layerId: string;
  speakerId: string | null;
  parentUnitId: string | null;
  startTime: number;
  endTime: number;
  createdAt: string;
  updatedAt: string;
  text: string;
  textId: string;
}

export interface UnitCreate {
  layerId: string;
  startTime: number;
  endTime: number;
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
  start_time: number;
  end_time: number;
  created_at: string;
  updated_at: string;
  text: string;
  text_id: string;
}

const READ = `
SELECT units.id, units.layer_id, units.speaker_id, units.parent_unit_id,
       units.start_time, units.end_time, units.created_at, units.updated_at,
       unit_texts.id AS text_id, unit_texts.body AS text
FROM units
JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
WHERE units.id = ?
`;

export function createUnit(
  db: SqliteDatabase,
  input: UnitCreate,
  afterUnitInsert?: () => void,
): Unit {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO units (
        id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.layerId,
      input.speakerId ?? null,
      input.parentUnitId ?? null,
      input.startTime,
      input.endTime,
      now,
      now,
    );
    afterUnitInsert?.();
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES (?, ?, 'transcription', ?, ?)`,
    ).run(randomUUID(), id, input.text, now);
    writeUnitFieldValues(db, id, input.fieldValues);
    const unit = getUnit(db, id);
    if (!unit) throw new Error('unit readback failed');
    return unit;
  });
  return write();
}

const LIST = `
SELECT units.id, units.layer_id, units.speaker_id, units.parent_unit_id,
       units.start_time, units.end_time, units.created_at, units.updated_at,
       unit_texts.id AS text_id, unit_texts.body AS text
FROM units
JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
JOIN layers ON layers.id = units.layer_id
JOIN manuscripts ON manuscripts.id = layers.manuscript_id
WHERE units.layer_id = ? AND manuscripts.deleted_at IS NULL
ORDER BY units.start_time, units.id
`;

export function getUnit(db: SqliteDatabase, id: string): Unit | null {
  const row = db.prepare(READ).get(id) as UnitRow | undefined;
  if (!row) return null;
  return mapUnit(row);
}

export function listUnits(db: SqliteDatabase, layerId: string): Unit[] {
  return (db.prepare(LIST).all(layerId) as UnitRow[]).map(mapUnit);
}

export function updateBoundary(
  db: SqliteDatabase,
  input: { leftId: string; rightId: string; time: number },
  afterLeftUpdate?: () => void,
): { left: Unit; right: Unit } {
  const write = db.transaction(() => {
    const left = getUnit(db, input.leftId);
    const right = getUnit(db, input.rightId);
    if (!left || !right) throw new Error('boundary units are missing');
    if (left.layerId !== right.layerId || left.endTime !== right.startTime) {
      throw new Error('boundary units are not adjacent');
    }
    if (input.time < left.startTime || input.time > right.endTime) {
      throw new Error('boundary is outside the pair');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE units SET end_time = ?, updated_at = ? WHERE id = ?').run(
      input.time,
      now,
      left.id,
    );
    afterLeftUpdate?.();
    db.prepare('UPDATE units SET start_time = ?, updated_at = ? WHERE id = ?').run(
      input.time,
      now,
      right.id,
    );
    const nextLeft = getUnit(db, left.id);
    const nextRight = getUnit(db, right.id);
    if (!nextLeft || !nextRight) throw new Error('boundary readback failed');
    return { left: nextLeft, right: nextRight };
  });
  return write();
}

export interface UnitTextUndo {
  unitId: string;
  prior: {
    text: string;
    graph: AnalysisGraphPayload | null;
    manuscriptId: string;
    links: AnalysisAssociationLink[];
    notes: AnalysisAssociationNote[];
    projectionTokenCount: number;
  };
  after: {
    text: string;
    graphFingerprint: string;
    analysisGeneration: number;
    manuscriptGeneration: number;
  };
}

export function updateUnitText(
  db: SqliteDatabase,
  input: { unitId: string; text: string },
  afterSnapshot?: () => void,
  remember?: (undo: UnitTextUndo) => void,
): Unit {
  if (input.text.length === 0) throw new Error('unit text is empty');
  let remembered: UnitTextUndo | null = null;
  const write = db.transaction(() => {
    const existing = getUnit(db, input.unitId);
    if (!existing) throw new Error('unit is missing');
    if (existing.text === input.text) return existing;
    const material = readAnalysisMaterial(db, input.unitId);
    if (material.graph !== null) {
      insertReviewSnapshot(db, material);
      afterSnapshot?.();
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE unit_texts SET body = ?, updated_at = ? WHERE unit_id = ? AND role = 'transcription'`,
    ).run(input.text, now, input.unitId);
    if (material.graph !== null) {
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
    const unit = getUnit(db, input.unitId);
    const manuscript = db
      .prepare('SELECT generation FROM manuscripts WHERE id = ?')
      .get(material.manuscriptId) as { generation: number } | undefined;
    const root = getAnalysisRoot(db, input.unitId);
    if (!unit || unit.text !== input.text || !manuscript || !root) {
      throw new Error('unit text readback failed');
    }
    if (manuscript.generation !== material.manuscriptGeneration + 1) {
      throw new Error('unit text readback failed');
    }
    if (material.graph !== null) {
      if (root.graph !== null || root.analysisGeneration !== material.analysisGeneration + 1) {
        throw new Error('unit text readback failed');
      }
    }
    remembered = {
      unitId: input.unitId,
      prior: {
        text: material.text,
        graph: material.graph === null ? null : structuredClone(material.graph),
        manuscriptId: material.manuscriptId,
        links: structuredClone(material.links),
        notes: structuredClone(material.notes),
        projectionTokenCount: material.projection.tokens.length,
      },
      after: {
        text: input.text,
        graphFingerprint: material.graph === null ? material.graphFingerprint : '',
        analysisGeneration:
          material.graph === null ? material.analysisGeneration : material.analysisGeneration + 1,
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
       unit_texts.body AS text
FROM units
JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
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
    const text = getUnit(db, input.unitId)?.text;
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

function mapUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    layerId: row.layer_id,
    speakerId: row.speaker_id,
    parentUnitId: row.parent_unit_id,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    text: row.text,
    textId: row.text_id,
  };
}
