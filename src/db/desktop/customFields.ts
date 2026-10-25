import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AnalysisGraphPayload } from '../../annotation/analysisGraphDomain';
import {
  CUSTOM_FIELD_DEFINITION_KEYS,
  CUSTOM_FIELD_TARGETS,
  CUSTOM_FIELD_TYPES,
  assertCustomFieldValue,
  canonicalJson,
  parseCustomFieldDefinition,
  type CustomFieldRef,
  type CustomFieldTarget,
  type CustomFieldType,
  type CustomFieldValueRule,
  type ParsedCustomFieldDefinition,
} from './customFieldValidation';

type SqliteDatabase = InstanceType<typeof Database>;

export interface CustomFieldOption {
  id: string;
  label: Record<string, string>;
  sortOrder: number;
}

export interface CustomFieldDefinition {
  id: string;
  targetType: CustomFieldTarget;
  name: Record<string, string>;
  description?: Record<string, string>;
  placeholder?: Record<string, string>;
  helpText?: Record<string, string>;
  fieldType: CustomFieldType;
  required: boolean;
  defaultValue?: unknown;
  pattern?: string;
  minValue?: number;
  maxValue?: number;
  targetTypes?: CustomFieldTarget[];
  cardinality?: 'one' | 'many';
  minItems?: number;
  maxItems?: number;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  options: CustomFieldOption[];
}

export interface CustomFieldPreview {
  definitionId: string;
  revision: number;
  unitId: string;
}

export interface CustomFieldUnitValue {
  definitionId: string;
  unitId: string;
  revision: number;
  value: unknown;
}

export const CUSTOM_FIELD_UPDATE_KEYS = [
  'id',
  'expectedRevision',
  'name',
  'description',
  'placeholder',
  'helpText',
  'fieldType',
  'required',
  'defaultValue',
  'pattern',
  'minValue',
  'maxValue',
  'targetTypes',
  'cardinality',
  'minItems',
  'maxItems',
  'sortOrder',
] as const;

interface DefinitionRow {
  id: string;
  target_type: string;
  name_json: string;
  description_json: string | null;
  placeholder_json: string | null;
  help_text_json: string | null;
  field_type: string;
  required: number;
  default_value_json: string | null;
  pattern: string | null;
  min_value: number | null;
  max_value: number | null;
  target_types_json: string | null;
  cardinality: string | null;
  min_items: number | null;
  max_items: number | null;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface OptionRow {
  id: string;
  label_json: string;
  sort_order: number;
}

interface GraphScope {
  unitId: string;
  graph: AnalysisGraphPayload;
}

export function createDefinition(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const parsed = parseCustomFieldDefinition(input);
  const write = db.transaction(() => insertDefinition(db, parsed));
  return write();
}

export function updateDefinition(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, CUSTOM_FIELD_UPDATE_KEYS);
  const id = requiredText(patch.id, 'custom field definition is missing');
  const expectedRevision = requiredRevision(patch.expectedRevision);
  const write = db.transaction(() => {
    const current = requireDefinition(db, id);
    if (current.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    const parsed = parseCustomFieldDefinition(patchedInput(current, patch));
    const revision = semanticsChanged(current, parsed) ? current.revision + 1 : current.revision;
    const now = new Date().toISOString();
    if (parsed.defaultValue !== null) {
      assertCustomFieldValue(
        ruleOf(
          parsed,
          current.options.map((option) => option.id),
        ),
        parsed.defaultValue,
        (ref) => targetExists(db, ref),
      );
    }
    db.prepare(
      `UPDATE custom_field_definitions
       SET name_json = ?, description_json = ?, placeholder_json = ?, help_text_json = ?,
           field_type = ?, required = ?, default_value_json = ?, pattern = ?,
           min_value = ?, max_value = ?, target_types_json = ?, cardinality = ?,
           min_items = ?, max_items = ?, sort_order = ?, revision = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(parsed.name),
      jsonMap(parsed.description),
      jsonMap(parsed.placeholder),
      jsonMap(parsed.helpText),
      parsed.fieldType,
      parsed.required ? 1 : 0,
      parsed.defaultValue === null ? null : JSON.stringify(parsed.defaultValue),
      parsed.pattern,
      parsed.minValue,
      parsed.maxValue,
      parsed.targetTypes === null ? null : JSON.stringify(parsed.targetTypes),
      parsed.cardinality,
      parsed.minItems,
      parsed.maxItems,
      parsed.sortOrder,
      revision,
      now,
      id,
    );
    if (parsed.fieldType !== 'select' && parsed.fieldType !== 'multiselect') {
      db.prepare('DELETE FROM custom_field_options WHERE definition_id = ?').run(id);
    }
    const stored = requireDefinition(db, id);
    if (stored.revision !== revision || canonicalJson(stored.name) !== canonicalJson(parsed.name)) {
      throw new Error('custom field readback failed');
    }
    return stored;
  });
  return write();
}

export function addOption(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'expectedRevision', 'label', 'sortOrder']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const expectedRevision = requiredRevision(patch.expectedRevision);
  const label = parseCustomFieldDefinition({
    targetType: 'unit',
    name: patch.label,
    fieldType: 'text',
  }).name;
  const write = db.transaction(() => {
    const current = requireDefinition(db, definitionId);
    if (current.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    if (current.fieldType !== 'select' && current.fieldType !== 'multiselect') {
      throw new Error('custom field constraint does not apply');
    }
    const sortOrder =
      patch.sortOrder === undefined ? current.options.length : requiredRevision(patch.sortOrder);
    const optionId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO custom_field_options (id, definition_id, label_json, sort_order) VALUES (?, ?, ?, ?)`,
    ).run(optionId, definitionId, JSON.stringify(label), sortOrder);
    db.prepare('UPDATE custom_field_definitions SET revision = ?, updated_at = ? WHERE id = ?').run(
      current.revision + 1,
      now,
      definitionId,
    );
    const stored = requireDefinition(db, definitionId);
    if (
      stored.revision !== current.revision + 1 ||
      !stored.options.some((option) => option.id === optionId)
    ) {
      throw new Error('custom field readback failed');
    }
    return stored;
  });
  return write();
}

export function updateOptionLabel(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'optionId', 'expectedRevision', 'label']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const optionId = requiredText(patch.optionId, 'custom field option is missing');
  const expectedRevision = requiredRevision(patch.expectedRevision);
  const label = parseCustomFieldDefinition({
    targetType: 'unit',
    name: patch.label,
    fieldType: 'text',
  }).name;
  const write = db.transaction(() => {
    const current = requireDefinition(db, definitionId);
    if (current.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    if (!current.options.some((option) => option.id === optionId)) {
      throw new Error('custom field option is missing');
    }
    db.prepare('UPDATE custom_field_options SET label_json = ? WHERE id = ?').run(
      JSON.stringify(label),
      optionId,
    );
    const stored = requireDefinition(db, definitionId);
    const option = stored.options.find((item) => item.id === optionId);
    if (
      stored.revision !== current.revision ||
      option === undefined ||
      canonicalJson(option.label) !== canonicalJson(label)
    ) {
      throw new Error('custom field readback failed');
    }
    return stored;
  });
  return write();
}

export function importDefinition(db: SqliteDatabase, input: unknown): CustomFieldDefinition {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['mode', 'definition']);
  if (patch.mode !== 'reuse' && patch.mode !== 'create') {
    throw new Error('custom field definition is invalid');
  }
  const parsed = parseCustomFieldDefinition(patch.definition);
  const write = db.transaction(() => {
    if (patch.mode === 'reuse') {
      const existing = reuseMatch(db, parsed);
      if (existing !== null) return existing;
    }
    return insertDefinition(db, parsed);
  });
  return write();
}

export function previewUnitValue(db: SqliteDatabase, input: unknown): CustomFieldPreview {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'unitId', 'value']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const unitId = requiredText(patch.unitId, 'unit is missing');
  if (!('value' in patch) || patch.value === undefined || patch.value === null) {
    throw new Error('custom field value is missing');
  }
  requireUnit(db, unitId);
  const definition = requireDefinition(db, definitionId);
  if (definition.targetType !== 'unit') throw new Error('custom field target does not match');
  assertCustomFieldValue(
    ruleOf(
      definition,
      definition.options.map((option) => option.id),
    ),
    patch.value,
    (ref) => targetExists(db, ref),
  );
  return { definitionId, revision: definition.revision, unitId };
}

export function setUnitValue(
  db: SqliteDatabase,
  input: unknown,
  afterWrite?: () => void,
): CustomFieldUnitValue {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'unitId', 'value', 'expectedRevision']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const unitId = requiredText(patch.unitId, 'unit is missing');
  const expectedRevision = requiredRevision(patch.expectedRevision);
  if (!('value' in patch) || patch.value === undefined || patch.value === null) {
    throw new Error('custom field value is missing');
  }
  const value = patch.value;
  const write = db.transaction(() => {
    requireUnit(db, unitId);
    const definition = requireDefinition(db, definitionId);
    if (definition.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    storeUnitValue(db, definition, unitId, value);
    afterWrite?.();
    const stored = readUnitValue(db, definitionId, unitId);
    if (canonicalJson(stored) !== canonicalJson(value))
      throw new Error('custom field readback failed');
    return { definitionId, unitId, revision: definition.revision, value: stored };
  });
  return write();
}

export function removeUnitValue(db: SqliteDatabase, input: unknown): void {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'unitId']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const unitId = requiredText(patch.unitId, 'unit is missing');
  const write = db.transaction(() => {
    if (readUnitValue(db, definitionId, unitId) === null)
      throw new Error('custom field value is missing');
    db.prepare(
      `DELETE FROM custom_field_values
       WHERE definition_id = ? AND target_type = 'unit' AND target_id = ?`,
    ).run(definitionId, unitId);
    if (readUnitValue(db, definitionId, unitId) !== null)
      throw new Error('custom field readback failed');
  });
  write();
}

export function missingUnitFields(db: SqliteDatabase, unitId: string): string[] {
  requireUnit(db, unitId);
  const rows = db
    .prepare(
      `SELECT id FROM custom_field_definitions
       WHERE target_type = 'unit' AND required = 1
         AND NOT EXISTS (
           SELECT 1 FROM custom_field_values
           WHERE definition_id = custom_field_definitions.id
             AND target_type = 'unit' AND target_id = ?
         )
       ORDER BY sort_order, id`,
    )
    .all(unitId) as { id: string }[];
  return rows.map((row) => row.id);
}

export function readUnitValue(
  db: SqliteDatabase,
  definitionId: string,
  unitId: string,
): unknown | null {
  const row = db
    .prepare(
      `SELECT value_json FROM custom_field_values
       WHERE definition_id = ? AND target_type = 'unit' AND target_id = ?`,
    )
    .get(definitionId, unitId) as { value_json: string } | undefined;
  if (row === undefined) return null;
  return JSON.parse(row.value_json) as unknown;
}

/** Called inside the unit-create transaction. Does not fill defaults. */
export function writeUnitFieldValues(
  db: SqliteDatabase,
  unitId: string,
  values: Record<string, unknown> | undefined,
): void {
  const required = db
    .prepare(
      `SELECT id FROM custom_field_definitions
       WHERE target_type = 'unit' AND required = 1
       ORDER BY sort_order, id`,
    )
    .all() as { id: string }[];
  const provided = values ?? {};
  for (const row of required) {
    if (!(row.id in provided)) throw new Error('unit is missing a required field');
  }
  for (const [definitionId, value] of Object.entries(provided)) {
    const definition = requireDefinition(db, definitionId);
    storeUnitValue(db, definition, unitId, value);
  }
}

export function assertStoredCustomFields(
  db: SqliteDatabase,
  graph: AnalysisGraphPayload,
  unitId: string,
): void {
  const scope = { unitId, graph };
  for (const node of graph.nodes) assertFieldMap(db, node.customFields, 'analysis-node', scope);
  for (const relation of graph.relations) {
    assertFieldMap(db, relation.customFields, 'analysis-relation', scope);
  }
}

function assertFieldMap(
  db: SqliteDatabase,
  fields: Record<string, unknown> | undefined,
  targetType: 'analysis-node' | 'analysis-relation',
  scope: GraphScope,
): void {
  if (fields === undefined) return;
  for (const [definitionId, value] of Object.entries(fields)) {
    const definition = readDefinition(db, definitionId);
    if (definition === null) throw new Error('custom field definition is missing');
    if (definition.targetType !== targetType) throw new Error('custom field target does not match');
    assertCustomFieldValue(
      ruleOf(
        definition,
        definition.options.map((option) => option.id),
      ),
      value,
      (ref) => targetExists(db, ref, scope),
    );
  }
}

function insertDefinition(
  db: SqliteDatabase,
  parsed: ParsedCustomFieldDefinition,
): CustomFieldDefinition {
  const id = randomUUID();
  const options = parsed.options.map((option) => ({ ...option, id: randomUUID() }));
  if (parsed.defaultValue !== null) {
    assertCustomFieldValue(
      ruleOf(
        parsed,
        options.map((option) => option.id),
      ),
      parsed.defaultValue,
      (ref) => targetExists(db, ref),
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO custom_field_definitions (
      id, target_type, name_json, description_json, placeholder_json, help_text_json,
      field_type, required, default_value_json, pattern, min_value, max_value,
      target_types_json, cardinality, min_items, max_items, sort_order, revision,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    parsed.targetType,
    JSON.stringify(parsed.name),
    jsonMap(parsed.description),
    jsonMap(parsed.placeholder),
    jsonMap(parsed.helpText),
    parsed.fieldType,
    parsed.required ? 1 : 0,
    parsed.defaultValue === null ? null : JSON.stringify(parsed.defaultValue),
    parsed.pattern,
    parsed.minValue,
    parsed.maxValue,
    parsed.targetTypes === null ? null : JSON.stringify(parsed.targetTypes),
    parsed.cardinality,
    parsed.minItems,
    parsed.maxItems,
    parsed.sortOrder,
    now,
    now,
  );
  const insertOption = db.prepare(
    `INSERT INTO custom_field_options (id, definition_id, label_json, sort_order) VALUES (?, ?, ?, ?)`,
  );
  for (const option of options) {
    insertOption.run(option.id, id, JSON.stringify(option.label), option.sortOrder);
  }
  const stored = requireDefinition(db, id);
  if (stored.revision !== 1 || stored.options.length !== options.length) {
    throw new Error('custom field readback failed');
  }
  return stored;
}

function storeUnitValue(
  db: SqliteDatabase,
  definition: CustomFieldDefinition,
  unitId: string,
  value: unknown,
): void {
  if (definition.targetType !== 'unit') throw new Error('custom field target does not match');
  assertCustomFieldValue(
    ruleOf(
      definition,
      definition.options.map((option) => option.id),
    ),
    value,
    (ref) => targetExists(db, ref),
  );
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw new Error('custom field value is invalid');
  db.prepare(
    `INSERT INTO custom_field_values (definition_id, target_type, target_id, value_json, updated_at)
     VALUES (?, 'unit', ?, ?, ?)
     ON CONFLICT(definition_id, target_type, target_id) DO UPDATE SET
       value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(definition.id, unitId, text, new Date().toISOString());
}

function reuseMatch(
  db: SqliteDatabase,
  parsed: ParsedCustomFieldDefinition,
): CustomFieldDefinition | null {
  const name = canonicalJson(parsed.name);
  const named = readAll(db).filter((definition) => canonicalJson(definition.name) === name);
  if (named.length === 0) return null;
  const match = named.find(
    (definition) =>
      definition.fieldType === parsed.fieldType && definition.targetType === parsed.targetType,
  );
  if (match === undefined) throw new Error('custom field import conflicts');
  return match;
}

function patchedInput(
  current: CustomFieldDefinition,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const fieldType = patch.fieldType === undefined ? current.fieldType : patch.fieldType;
  const input: Record<string, unknown> = {
    targetType: current.targetType,
    name: patch.name === undefined ? current.name : patch.name,
    fieldType,
    required: patch.required === undefined ? current.required : patch.required,
    sortOrder: patch.sortOrder === undefined ? current.sortOrder : patch.sortOrder,
  };
  if (fieldType === 'select' || fieldType === 'multiselect') {
    input.options = current.options.map((option) => ({
      label: option.label,
      sortOrder: option.sortOrder,
    }));
  }
  copyPatch(input, patch, current, 'description');
  copyPatch(input, patch, current, 'placeholder');
  copyPatch(input, patch, current, 'helpText');
  copyPatch(input, patch, current, 'pattern');
  copyPatch(input, patch, current, 'minValue');
  copyPatch(input, patch, current, 'maxValue');
  copyPatch(input, patch, current, 'targetTypes');
  copyPatch(input, patch, current, 'cardinality');
  copyPatch(input, patch, current, 'minItems');
  copyPatch(input, patch, current, 'maxItems');
  if ('defaultValue' in patch) {
    if (patch.defaultValue !== null && patch.defaultValue !== undefined)
      input.defaultValue = patch.defaultValue;
  } else if (current.defaultValue !== undefined) {
    input.defaultValue = current.defaultValue;
  }
  return input;
}

function copyPatch(
  input: Record<string, unknown>,
  patch: Record<string, unknown>,
  current: CustomFieldDefinition,
  key:
    | 'description'
    | 'placeholder'
    | 'helpText'
    | 'pattern'
    | 'minValue'
    | 'maxValue'
    | 'targetTypes'
    | 'cardinality'
    | 'minItems'
    | 'maxItems',
): void {
  if (key in patch) {
    if (patch[key] !== null && patch[key] !== undefined) input[key] = patch[key];
    return;
  }
  const value = current[key];
  if (value !== undefined) input[key] = value;
}

function semanticsChanged(
  current: CustomFieldDefinition,
  parsed: ParsedCustomFieldDefinition,
): boolean {
  return (
    current.fieldType !== parsed.fieldType ||
    current.required !== parsed.required ||
    canonicalJson(current.defaultValue ?? null) !== canonicalJson(parsed.defaultValue) ||
    (current.pattern ?? null) !== parsed.pattern ||
    (current.minValue ?? null) !== parsed.minValue ||
    (current.maxValue ?? null) !== parsed.maxValue ||
    canonicalJson(current.targetTypes ?? null) !== canonicalJson(parsed.targetTypes) ||
    (current.cardinality ?? null) !== parsed.cardinality ||
    (current.minItems ?? null) !== parsed.minItems ||
    (current.maxItems ?? null) !== parsed.maxItems
  );
}

function ruleOf(
  definition: ParsedCustomFieldDefinition | CustomFieldDefinition,
  optionIds: readonly string[],
): CustomFieldValueRule {
  return {
    fieldType: definition.fieldType,
    pattern: definition.pattern ?? null,
    minValue: definition.minValue ?? null,
    maxValue: definition.maxValue ?? null,
    targetTypes: definition.targetTypes ?? null,
    cardinality: definition.cardinality ?? null,
    minItems: definition.minItems ?? null,
    maxItems: definition.maxItems ?? null,
    optionIds,
  };
}

function targetExists(db: SqliteDatabase, ref: CustomFieldRef, scope?: GraphScope): boolean {
  switch (ref.targetType) {
    case 'project':
      return idExists(db, 'SELECT 1 FROM project WHERE id = ?', ref.targetId);
    case 'manuscript':
      return idExists(db, 'SELECT 1 FROM manuscripts WHERE id = ?', ref.targetId);
    case 'layer':
      return idExists(db, 'SELECT 1 FROM layers WHERE id = ?', ref.targetId);
    case 'unit':
      return idExists(db, 'SELECT 1 FROM units WHERE id = ?', ref.targetId);
    case 'media':
      return idExists(db, 'SELECT 1 FROM media WHERE id = ?', ref.targetId);
    case 'source':
      return idExists(db, 'SELECT 1 FROM sources WHERE id = ?', ref.targetId);
    case 'speaker':
      return idExists(db, 'SELECT 1 FROM speakers WHERE id = ?', ref.targetId);
    case 'note':
      return idExists(db, 'SELECT 1 FROM notes WHERE id = ?', ref.targetId);
    case 'conversation':
      return idExists(db, 'SELECT 1 FROM conversations WHERE id = ?', ref.targetId);
    case 'message':
      return idExists(db, 'SELECT 1 FROM messages WHERE id = ?', ref.targetId);
    case 'language':
      return idExists(db, 'SELECT 1 FROM languages WHERE id = ?', ref.targetId);
    case 'orthography':
      return idExists(db, 'SELECT 1 FROM orthographies WHERE id = ?', ref.targetId);
    case 'orthography-bridge':
      return idExists(db, 'SELECT 1 FROM orthography_bridges WHERE id = ?', ref.targetId);
    case 'lexeme':
      return idExists(db, 'SELECT 1 FROM lexemes WHERE id = ?', ref.targetId);
    case 'lexeme-sense':
      return senseExists(db, ref.lexemeId, ref.targetId);
    case 'analysis-node':
      return graphIdExists(db, ref, 'nodes', scope);
    case 'analysis-relation':
      return graphIdExists(db, ref, 'relations', scope);
    default: {
      const unreachable: never = ref.targetType;
      return unreachable;
    }
  }
}

function graphIdExists(
  db: SqliteDatabase,
  ref: CustomFieldRef,
  kind: 'nodes' | 'relations',
  scope: GraphScope | undefined,
): boolean {
  if (ref.unitId === undefined) return false;
  if (scope !== undefined && scope.unitId === ref.unitId) {
    const list = kind === 'nodes' ? scope.graph.nodes : scope.graph.relations;
    return list.some((item) => item.id === ref.targetId);
  }
  const row = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(ref.unitId) as
    { analysis_graph_json: string | null } | undefined;
  if (row === undefined || row.analysis_graph_json === null) return false;
  const graph = JSON.parse(row.analysis_graph_json) as {
    nodes?: { id?: string }[];
    relations?: { id?: string }[];
  };
  const list = kind === 'nodes' ? graph.nodes : graph.relations;
  return Array.isArray(list) && list.some((item) => item.id === ref.targetId);
}

function senseExists(db: SqliteDatabase, lexemeId: string | undefined, senseId: string): boolean {
  if (lexemeId === undefined) return false;
  const row = db.prepare('SELECT entry_json FROM lexemes WHERE id = ?').get(lexemeId) as
    { entry_json: string } | undefined;
  if (row === undefined) return false;
  const entry = JSON.parse(row.entry_json) as { senses?: unknown };
  if (!Array.isArray(entry.senses)) return false;
  return entry.senses.some(
    (sense) =>
      typeof sense === 'object' && sense !== null && (sense as { id?: unknown }).id === senseId,
  );
}

function idExists(db: SqliteDatabase, sql: string, id: string): boolean {
  return db.prepare(sql).get(id) !== undefined;
}

function requireUnit(db: SqliteDatabase, unitId: string): void {
  if (!idExists(db, 'SELECT 1 FROM units WHERE id = ?', unitId)) throw new Error('unit is missing');
}

function requireDefinition(db: SqliteDatabase, id: string): CustomFieldDefinition {
  const definition = readDefinition(db, id);
  if (definition === null) throw new Error('custom field definition is missing');
  return definition;
}

function readDefinition(db: SqliteDatabase, id: string): CustomFieldDefinition | null {
  const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(id) as
    DefinitionRow | undefined;
  if (row === undefined) return null;
  return mapDefinition(row, readOptions(db, id));
}

function readAll(db: SqliteDatabase): CustomFieldDefinition[] {
  const rows = db.prepare('SELECT * FROM custom_field_definitions').all() as DefinitionRow[];
  return rows.map((row) => mapDefinition(row, readOptions(db, row.id)));
}

function readOptions(db: SqliteDatabase, definitionId: string): CustomFieldOption[] {
  const rows = db
    .prepare(
      `SELECT id, label_json, sort_order FROM custom_field_options
       WHERE definition_id = ? ORDER BY sort_order, id`,
    )
    .all(definitionId) as OptionRow[];
  return rows.map((row) => ({
    id: row.id,
    label: JSON.parse(row.label_json) as Record<string, string>,
    sortOrder: row.sort_order,
  }));
}

function mapDefinition(row: DefinitionRow, options: CustomFieldOption[]): CustomFieldDefinition {
  const definition: CustomFieldDefinition = {
    id: row.id,
    targetType: storedTarget(row.target_type),
    name: JSON.parse(row.name_json) as Record<string, string>,
    fieldType: storedType(row.field_type),
    required: row.required === 1,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    options,
  };
  if (row.description_json !== null)
    definition.description = JSON.parse(row.description_json) as Record<string, string>;
  if (row.placeholder_json !== null)
    definition.placeholder = JSON.parse(row.placeholder_json) as Record<string, string>;
  if (row.help_text_json !== null)
    definition.helpText = JSON.parse(row.help_text_json) as Record<string, string>;
  if (row.default_value_json !== null)
    definition.defaultValue = JSON.parse(row.default_value_json) as unknown;
  if (row.pattern !== null) definition.pattern = row.pattern;
  if (row.min_value !== null) definition.minValue = row.min_value;
  if (row.max_value !== null) definition.maxValue = row.max_value;
  if (row.target_types_json !== null)
    definition.targetTypes = JSON.parse(row.target_types_json) as CustomFieldTarget[];
  if (row.cardinality === 'one' || row.cardinality === 'many')
    definition.cardinality = row.cardinality;
  if (row.min_items !== null) definition.minItems = row.min_items;
  if (row.max_items !== null) definition.maxItems = row.max_items;
  return definition;
}

function storedTarget(value: string): CustomFieldTarget {
  if (!(CUSTOM_FIELD_TARGETS as readonly string[]).includes(value)) {
    throw new Error('custom field definition is invalid');
  }
  return value as CustomFieldTarget;
}

function storedType(value: string): CustomFieldType {
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(value)) {
    throw new Error('custom field definition is invalid');
  }
  return value as CustomFieldType;
}

function jsonMap(value: Record<string, string> | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function assertAllowed(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error('custom field definition is invalid');
  }
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message);
  return value;
}

function requiredRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('custom field definition is invalid');
  }
  return value;
}

export { CUSTOM_FIELD_DEFINITION_KEYS };
