import type Database from 'better-sqlite3';
import {
  analysisGraphFingerprint,
  validateAnalysisGraphPayload,
  type AnalysisGraphPayload,
} from '../../annotation/analysisGraphDomain';
import {
  CUSTOM_FIELD_TARGETS,
  parseCustomFieldDefinition,
  type CustomFieldTarget,
} from './customFieldValidation';
import { readStoredUnit } from './units';
import {
  CUSTOM_FIELD_UPDATE_KEYS,
  assertDefinitionValue,
  assertStoredCustomFields,
  commitDefinitionChange,
  currentDefinitionRevisions,
  customFieldValueFingerprint,
  locateCustomFieldValues,
  patchedInput,
  requireDefinition,
  semanticsChanged,
  setFieldValue,
  type CustomFieldDefinition,
  type CustomFieldLocation,
  type StoredDefinitionRevision,
} from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export interface FieldConversion {
  definitionId: string;
  targetType: CustomFieldTarget;
  targetId: string;
  value: unknown;
  valueFingerprint?: string;
  lexemeId?: string;
  unitId?: string;
}

export interface MigrationLocation extends CustomFieldLocation {
  valueFingerprint: string;
}

export interface CustomFieldMigrationPreview {
  revision: number;
  current: MigrationLocation[];
  history: { id: string; kind: string; revision: number; fieldType: string }[];
}

const PATCH_KEYS = CUSTOM_FIELD_UPDATE_KEYS.filter(
  (key) => key !== 'id' && key !== 'expectedRevision',
);

export function previewMigration(
  db: SqliteDatabase,
  definitionId: string,
): CustomFieldMigrationPreview {
  const definition = requireDefinition(db, definitionId);
  return {
    revision: definition.revision,
    current: locateCustomFieldValues(db, definitionId).map((location) => ({
      ...location,
      valueFingerprint: customFieldValueFingerprint(db, definitionId, location),
    })),
    history: historyOf(db, definitionId),
  };
}

export function migrateDefinition(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const body = record(input, 'custom field migration is invalid');
  allowed(body, ['definitionId', 'expectedRevision', 'definition', 'conversions']);
  const definitionId = requiredText(body.definitionId, 'custom field definition is missing');
  const expectedRevision = requiredRevision(body.expectedRevision);
  const patch = record(body.definition, 'custom field definition is invalid');
  allowed(patch, [...PATCH_KEYS, 'options']);
  const conversions = conversionList(body.conversions);
  const write = db.transaction(() => {
    const current = requireDefinition(db, definitionId);
    if (current.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    const parsed = parseCustomFieldDefinition(
      patchedInput(current, { ...patch, id: definitionId, expectedRevision }),
    );
    if (!semanticsChanged(current, parsed)) {
      throw new Error('custom field migration does not change the definition');
    }
    const currentLocations = locateCustomFieldValues(db, definitionId);
    if (!sameHosts(currentLocations, conversions, definitionId)) {
      throw new Error('custom field migration is stale');
    }
    for (const conversion of conversions) {
      if (conversion.definitionId !== definitionId) continue;
      const fingerprint = customFieldValueFingerprint(db, definitionId, conversion);
      if (conversion.valueFingerprint !== fingerprint) {
        throw new Error('custom field migration is stale');
      }
    }
    const optionIds =
      parsed.fieldType === 'select' || parsed.fieldType === 'multiselect'
        ? current.options.map((option) => option.id)
        : [];
    for (const conversion of conversions) {
      assertDefinitionValue(db, parsed, optionIds, conversion.value);
    }
    const stored = commitDefinitionChange(db, current, parsed, current.revision + 1);
    const graphs = new Map<string, FieldConversion[]>();
    for (const conversion of conversions) {
      if (
        conversion.targetType !== 'analysis-node' &&
        conversion.targetType !== 'analysis-relation'
      ) {
        writeConverted(db, stored, conversion);
        continue;
      }
      if (conversion.unitId === undefined) throw new Error('custom field value is invalid');
      const group = graphs.get(conversion.unitId) ?? [];
      group.push(conversion);
      graphs.set(conversion.unitId, group);
    }
    for (const [unitId, group] of graphs) writeGraphValues(db, stored.id, unitId, group);
    return stored;
  });
  return write();
}

export function convertSnapshotGraph(
  db: SqliteDatabase,
  graph: AnalysisGraphPayload,
  unitId: string,
  stored: readonly StoredDefinitionRevision[],
  conversions: unknown,
): AnalysisGraphPayload {
  const list = conversionList(conversions);
  const live = new Map(
    currentDefinitionRevisions(db).map((record) => [record.definitionId, record.revision]),
  );
  const stale = new Set(
    stored
      .filter((record) => live.get(record.definitionId) !== record.revision)
      .map((record) => record.definitionId),
  );
  const next = structuredClone(graph);
  const used = new Set<string>();
  assignStale(next.nodes, 'analysis-node', unitId, stale, list, used);
  assignStale(next.relations, 'analysis-relation', unitId, stale, list, used);
  for (const conversion of list) {
    if (!used.has(conversionKey(conversion))) throw new Error('custom field migration is stale');
  }
  return next;
}

function writeConverted(
  db: SqliteDatabase,
  definition: CustomFieldDefinition,
  conversion: FieldConversion,
): void {
  setFieldValue(db, {
    definitionId: definition.id,
    expectedRevision: definition.revision,
    targetType: conversion.targetType,
    targetId: conversion.targetId,
    value: conversion.value,
    ...(conversion.lexemeId === undefined ? {} : { lexemeId: conversion.lexemeId }),
  });
}

function writeGraphValues(
  db: SqliteDatabase,
  definitionId: string,
  unitId: string,
  conversions: readonly FieldConversion[],
): void {
  const unit = readStoredUnit(db, unitId);
  const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
    { analysis_graph_json: string | null } | undefined;
  if (unit === null || row === undefined || row.analysis_graph_json === null) {
    throw new Error('analysis graph is missing');
  }
  const graph = validateAnalysisGraphPayload(
    JSON.parse(row.analysis_graph_json) as unknown,
    unit.text,
  );
  const prior = structuredClone(graph);
  for (const conversion of conversions) {
    const items = conversion.targetType === 'analysis-node' ? graph.nodes : graph.relations;
    const item = items.find((entry) => entry.id === conversion.targetId);
    if (!item) {
      throw new Error(
        conversion.targetType === 'analysis-node'
          ? 'analysis node is missing'
          : 'analysis relation is missing',
      );
    }
    item.customFields = { ...(item.customFields ?? {}), [definitionId]: conversion.value };
  }
  assertStoredCustomFields(db, graph, unitId, { prior });
  db.prepare(
    'UPDATE units SET analysis_graph_json = ?, graph_fingerprint = ?, updated_at = ? WHERE id = ?',
  ).run(JSON.stringify(graph), analysisGraphFingerprint(graph), new Date().toISOString(), unitId);
}

function assignStale(
  items: { id: string; customFields?: Record<string, unknown> | undefined }[],
  targetType: 'analysis-node' | 'analysis-relation',
  unitId: string,
  stale: ReadonlySet<string>,
  conversions: readonly FieldConversion[],
  used: Set<string>,
): void {
  for (const item of items) {
    if (item.customFields === undefined) continue;
    for (const definitionId of Object.keys(item.customFields)) {
      if (!stale.has(definitionId)) continue;
      const conversion = conversions.find(
        (candidate) =>
          candidate.definitionId === definitionId &&
          candidate.targetType === targetType &&
          candidate.targetId === item.id &&
          (candidate.unitId ?? unitId) === unitId,
      );
      if (conversion === undefined) throw new Error('custom field migration is missing a value');
      item.customFields[definitionId] = conversion.value;
      used.add(conversionKey(conversion));
    }
  }
}

function historyOf(
  db: SqliteDatabase,
  definitionId: string,
): CustomFieldMigrationPreview['history'] {
  const rows = db
    .prepare(
      `SELECT id, kind, definition_revisions_json FROM analysis_candidates ORDER BY created_at, id`,
    )
    .all() as { id: string; kind: string; definition_revisions_json: string }[];
  const history: CustomFieldMigrationPreview['history'] = [];
  for (const row of rows) {
    const stored = JSON.parse(row.definition_revisions_json) as StoredDefinitionRevision[];
    const match = stored.find((record) => record.definitionId === definitionId);
    if (match === undefined) continue;
    history.push({
      id: row.id,
      kind: row.kind,
      revision: match.revision,
      fieldType: match.fieldType,
    });
  }
  return history;
}

function sameHosts(
  locations: readonly CustomFieldLocation[],
  conversions: readonly FieldConversion[],
  definitionId: string,
): boolean {
  const left = locations.map(hostKey).sort();
  const right = conversions
    .map((conversion) => {
      if (conversion.definitionId !== definitionId) return `other\0${hostKey(conversion)}`;
      return hostKey(conversion);
    })
    .sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function hostKey(input: {
  targetType: string;
  targetId: string;
  lexemeId?: string;
  unitId?: string;
}): string {
  return `${input.targetType}\0${input.targetId}\0${input.lexemeId ?? ''}\0${input.unitId ?? ''}`;
}

function conversionKey(conversion: FieldConversion): string {
  return `${conversion.definitionId}\0${hostKey(conversion)}`;
}

function conversionList(value: unknown): FieldConversion[] {
  if (!Array.isArray(value)) throw new Error('custom field migration is invalid');
  return value.map((item) => {
    const recordValue = record(item, 'custom field migration is invalid');
    const targetType = requiredText(recordValue.targetType, 'custom field target does not match');
    if (!(CUSTOM_FIELD_TARGETS as readonly string[]).includes(targetType)) {
      throw new Error('custom field target does not match');
    }
    const conversion: FieldConversion = {
      definitionId: requiredText(recordValue.definitionId, 'custom field definition is missing'),
      targetType: targetType as CustomFieldTarget,
      targetId: requiredText(recordValue.targetId, 'custom field target is missing'),
      value: recordValue.value,
    };
    if (typeof recordValue.valueFingerprint === 'string') {
      conversion.valueFingerprint = recordValue.valueFingerprint;
    }
    if (typeof recordValue.lexemeId === 'string') conversion.lexemeId = recordValue.lexemeId;
    if (typeof recordValue.unitId === 'string') conversion.unitId = recordValue.unitId;
    return conversion;
  });
}

function allowed(input: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!keys.includes(key)) throw new Error('custom field migration is invalid');
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
