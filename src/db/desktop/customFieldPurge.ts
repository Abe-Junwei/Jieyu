import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import {
  locateCustomFieldValues,
  removeFieldValue,
  requireDefinition,
  type CustomFieldLocation,
  type StoredDefinitionRevision,
} from './customFields';
import { getUnit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface CustomFieldPurgePreview {
  revision: number;
  current: CustomFieldLocation[];
  history: { id: string; kind: string }[];
}

export function previewPurge(db: SqliteDatabase, definitionId: string): CustomFieldPurgePreview {
  const definition = requireDefinition(db, definitionId);
  return {
    revision: definition.revision,
    current: locateCustomFieldValues(db, definitionId),
    history: historyOf(db, definitionId),
  };
}

export function purgeDefinition(db: SqliteDatabase, input: unknown, afterWrite?: () => void): void {
  const body = record(input, 'custom field purge is invalid');
  allowed(body, ['definitionId', 'expectedRevision', 'current', 'historyIds']);
  const definitionId = requiredText(body.definitionId, 'custom field definition is missing');
  const expectedRevision = requiredRevision(body.expectedRevision);
  const current = locationList(body.current);
  const historyIds = idList(body.historyIds);
  const write = db.transaction(() => {
    const definition = requireDefinition(db, definitionId);
    if (definition.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    const fresh = previewPurge(db, definitionId);
    if (!samePreview(fresh, current, historyIds)) throw new Error('custom field purge is stale');
    for (const location of fresh.current) {
      if (location.targetType === 'analysis-node' || location.targetType === 'analysis-relation') {
        stripUnitGraph(db, location, definitionId);
      } else {
        removeFieldValue(db, {
          definitionId,
          targetType: location.targetType,
          targetId: location.targetId,
          ...(location.lexemeId === undefined ? {} : { lexemeId: location.lexemeId }),
        });
      }
    }
    for (const item of fresh.history) stripCandidate(db, item.id, definitionId);
    db.prepare('DELETE FROM custom_field_options WHERE definition_id = ?').run(definitionId);
    db.prepare('DELETE FROM custom_field_definitions WHERE id = ?').run(definitionId);
    const left = db
      .prepare('SELECT id FROM custom_field_definitions WHERE id = ?')
      .get(definitionId);
    if (left !== undefined) throw new Error('custom field readback failed');
    afterWrite?.();
  });
  write();
}

function stripUnitGraph(
  db: SqliteDatabase,
  location: CustomFieldLocation,
  definitionId: string,
): void {
  if (location.unitId === undefined) throw new Error('analysis graph is missing');
  const unit = getUnit(db, location.unitId);
  const row = db
    .prepare('SELECT analysis_graph_json FROM units WHERE id = ?')
    .get(location.unitId) as { analysis_graph_json: string | null } | undefined;
  if (unit === null || row === undefined || row.analysis_graph_json === null) {
    throw new Error('analysis graph is missing');
  }
  const graph = validateAnalysisGraphPayload(
    JSON.parse(row.analysis_graph_json) as unknown,
    unit.text,
  );
  if (!stripField(graph, definitionId, location)) throw new Error('custom field value is missing');
  db.prepare(
    'UPDATE units SET analysis_graph_json = ?, graph_fingerprint = ?, updated_at = ? WHERE id = ?',
  ).run(
    JSON.stringify(graph),
    analysisGraphFingerprint(graph),
    new Date().toISOString(),
    location.unitId,
  );
}

function stripCandidate(db: SqliteDatabase, id: string, definitionId: string): void {
  const row = db
    .prepare(
      `SELECT text, graph_json, graph_fingerprint, definition_revisions_json, redacted_definition_ids_json
       FROM analysis_candidates WHERE id = ?`,
    )
    .get(id) as
    | {
        text: string;
        graph_json: string;
        graph_fingerprint: string;
        definition_revisions_json: string;
        redacted_definition_ids_json: string;
      }
    | undefined;
  if (row === undefined) throw new Error('analysis candidate is missing');
  const graph = validateAnalysisGraphPayload(JSON.parse(row.graph_json) as unknown, row.text);
  stripField(graph, definitionId);
  const revisions = (
    JSON.parse(row.definition_revisions_json) as StoredDefinitionRevision[]
  ).filter((record) => record.definitionId !== definitionId);
  const redacted = JSON.parse(row.redacted_definition_ids_json) as string[];
  if (!redacted.includes(definitionId)) redacted.push(definitionId);
  redacted.sort();
  db.prepare(
    `UPDATE analysis_candidates
     SET graph_json = ?, definition_revisions_json = ?, redacted_definition_ids_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(graph),
    JSON.stringify(revisions),
    JSON.stringify(redacted),
    new Date().toISOString(),
    id,
  );
  const kept = db
    .prepare('SELECT graph_fingerprint FROM analysis_candidates WHERE id = ?')
    .get(id) as {
    graph_fingerprint: string;
  };
  if (kept.graph_fingerprint !== row.graph_fingerprint)
    throw new Error('custom field readback failed');
}

function stripField(
  graph: AnalysisGraphPayload,
  definitionId: string,
  location?: CustomFieldLocation,
): boolean {
  const items =
    location?.targetType === 'analysis-relation'
      ? graph.relations
      : location?.targetType === 'analysis-node'
        ? graph.nodes
        : [...graph.nodes, ...graph.relations];
  let found = false;
  for (const item of items) {
    if (location !== undefined && item.id !== location.targetId) continue;
    if (item.customFields === undefined || !(definitionId in item.customFields)) continue;
    found = true;
    const fields = { ...item.customFields };
    delete fields[definitionId];
    if (Object.keys(fields).length === 0) delete item.customFields;
    else item.customFields = fields;
  }
  return found;
}

function historyOf(db: SqliteDatabase, definitionId: string): CustomFieldPurgePreview['history'] {
  const rows = db
    .prepare(
      `SELECT id, kind, definition_revisions_json FROM analysis_candidates ORDER BY created_at, id`,
    )
    .all() as { id: string; kind: string; definition_revisions_json: string }[];
  const history: CustomFieldPurgePreview['history'] = [];
  for (const row of rows) {
    const stored = JSON.parse(row.definition_revisions_json) as StoredDefinitionRevision[];
    if (stored.some((record) => record.definitionId === definitionId)) {
      history.push({ id: row.id, kind: row.kind });
    }
  }
  return history;
}

function samePreview(
  fresh: CustomFieldPurgePreview,
  current: readonly CustomFieldLocation[],
  historyIds: readonly string[],
): boolean {
  const left = fresh.current.map(hostKey).sort();
  const right = current.map(hostKey).sort();
  const seen = fresh.history.map((item) => item.id).sort();
  const expected = [...historyIds].sort();
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index]) &&
    seen.length === expected.length &&
    seen.every((id, index) => id === expected[index])
  );
}

function hostKey(input: CustomFieldLocation): string {
  return `${input.targetType}\0${input.targetId}\0${input.lexemeId ?? ''}\0${input.unitId ?? ''}`;
}

function locationList(value: unknown): CustomFieldLocation[] {
  if (!Array.isArray(value)) throw new Error('custom field purge is invalid');
  return value.map((item) => {
    const body = record(item, 'custom field purge is invalid');
    const location: CustomFieldLocation = {
      targetType: requiredText(body.targetType, 'custom field target does not match'),
      targetId: requiredText(body.targetId, 'custom field target is missing'),
    };
    if (typeof body.lexemeId === 'string') location.lexemeId = body.lexemeId;
    if (typeof body.unitId === 'string') location.unitId = body.unitId;
    return location;
  });
}

function idList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('custom field purge is invalid');
  }
  return value;
}

function allowed(input: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!keys.includes(key)) throw new Error('custom field purge is invalid');
  }
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message);
  return value;
}

function requiredRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('custom field revision does not match');
  }
  return value;
}
