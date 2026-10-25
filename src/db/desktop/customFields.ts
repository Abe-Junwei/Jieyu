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

export interface CustomFieldHostPreview {
  definitionId: string;
  revision: number;
  targetType: string;
  targetId: string;
}

export interface CustomFieldHostValue {
  definitionId: string;
  targetType: string;
  targetId: string;
  revision: number;
  value: unknown;
}

export interface CustomFieldLocation {
  targetType: string;
  targetId: string;
  lexemeId?: string;
  unitId?: string;
}

const TABLE_VALUE_HOSTS = [
  'project',
  'manuscript',
  'layer',
  'unit',
  'media',
  'speaker',
  'orthography',
  'orthography-bridge',
] as const;

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
  const preview = previewFieldValue(db, {
    definitionId: patch.definitionId,
    targetType: 'unit',
    targetId: patch.unitId,
    value: patch.value,
  });
  return {
    definitionId: preview.definitionId,
    revision: preview.revision,
    unitId: preview.targetId,
  };
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
  const stored = writeFieldValue(
    db,
    'unit',
    unitId,
    definitionId,
    patch.value,
    expectedRevision,
    afterWrite,
  );
  return { definitionId, unitId, revision: stored.revision, value: stored.value };
}

export function removeUnitValue(db: SqliteDatabase, input: unknown): void {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'unitId']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const unitId = requiredText(patch.unitId, 'unit is missing');
  removeFieldValue(db, { definitionId, targetType: 'unit', targetId: unitId });
}

export function missingUnitFields(db: SqliteDatabase, unitId: string): string[] {
  return missingFields(db, 'unit', unitId);
}

export function readUnitValue(
  db: SqliteDatabase,
  definitionId: string,
  unitId: string,
): unknown | null {
  return readFieldValue(db, definitionId, 'unit', unitId);
}

/** Called inside the unit-create transaction. Does not fill defaults. */
export function writeUnitFieldValues(
  db: SqliteDatabase,
  unitId: string,
  values: Record<string, unknown> | undefined,
): void {
  writeRequiredFieldValues(db, 'unit', unitId, values);
}

export function previewFieldValue(db: SqliteDatabase, input: unknown): CustomFieldHostPreview {
  const value = fieldValueInput(input, false);
  requireHost(db, value.targetType, value.targetId, value.lexemeId);
  const definition = requireDefinition(db, value.definitionId);
  if (definition.targetType !== value.targetType)
    throw new Error('custom field target does not match');
  assertCustomFieldValue(
    ruleOf(
      definition,
      definition.options.map((option) => option.id),
    ),
    value.value,
    (ref) => targetExists(db, ref),
  );
  return {
    definitionId: value.definitionId,
    revision: definition.revision,
    targetType: value.targetType,
    targetId: value.targetId,
  };
}

export function setFieldValue(
  db: SqliteDatabase,
  input: unknown,
  afterWrite?: () => void,
): CustomFieldHostValue {
  const value = fieldValueInput(input, true);
  return writeFieldValue(
    db,
    value.targetType,
    value.targetId,
    value.definitionId,
    value.value,
    value.expectedRevision,
    afterWrite,
    value.lexemeId,
  );
}

export function removeFieldValue(db: SqliteDatabase, input: unknown): void {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(patch, ['definitionId', 'targetType', 'targetId', 'lexemeId']);
  const definitionId = requiredText(patch.definitionId, 'custom field definition is missing');
  const targetType = requiredText(patch.targetType, 'custom field target does not match');
  const targetId = requiredText(patch.targetId, 'custom field target is missing');
  const lexemeId = lexemeScope(patch, targetType);
  const write = db.transaction(() => {
    if (readFieldValue(db, definitionId, targetType, targetId, lexemeId) === null) {
      throw new Error('custom field value is missing');
    }
    clearFieldValue(db, definitionId, targetType, targetId, lexemeId);
    if (readFieldValue(db, definitionId, targetType, targetId, lexemeId) !== null) {
      throw new Error('custom field readback failed');
    }
  });
  write();
}

export function missingFields(
  db: SqliteDatabase,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): string[] {
  requireHost(db, targetType, targetId, lexemeId);
  const required = requiredDefinitionIds(db, targetType);
  if (targetType === 'language' || targetType === 'lexeme' || targetType === 'lexeme-sense') {
    const map = jsonValueMap(db, targetType, targetId, lexemeId);
    return required.filter((id) => !(id in map));
  }
  const rows = db
    .prepare(
      `SELECT id FROM custom_field_definitions
       WHERE target_type = ? AND required = 1
         AND NOT EXISTS (
           SELECT 1 FROM custom_field_values
           WHERE definition_id = custom_field_definitions.id
             AND target_type = ? AND target_id = ?
         )
       ORDER BY sort_order, id`,
    )
    .all(targetType, targetType, targetId) as { id: string }[];
  return rows.map((row) => row.id);
}

export function readFieldValue(
  db: SqliteDatabase,
  definitionId: string,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): unknown | null {
  if (targetType === 'language' || targetType === 'lexeme' || targetType === 'lexeme-sense') {
    const map = jsonValueMap(db, targetType, targetId, lexemeId);
    return definitionId in map ? map[definitionId] : null;
  }
  const row = db
    .prepare(
      `SELECT value_json FROM custom_field_values
       WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
    )
    .get(definitionId, targetType, targetId) as { value_json: string } | undefined;
  if (row === undefined) return null;
  return JSON.parse(row.value_json) as unknown;
}

export function locateCustomFieldValues(
  db: SqliteDatabase,
  definitionId: string,
): CustomFieldLocation[] {
  requireDefinition(db, definitionId);
  const rows = db
    .prepare(
      `SELECT target_type, target_id FROM custom_field_values
       WHERE definition_id = ?`,
    )
    .all(definitionId) as { target_type: string; target_id: string }[];
  const located = rows.map((row) => ({ targetType: row.target_type, targetId: row.target_id }));
  const languages = db.prepare('SELECT id, custom_fields_json FROM languages').all() as {
    id: string;
    custom_fields_json: string;
  }[];
  for (const language of languages) {
    if (definitionId in objectMap(language.custom_fields_json)) {
      located.push({ targetType: 'language', targetId: language.id });
    }
  }
  // ponytail: scans every lexeme and graph row; index when purge runs on large projects
  locateLexemeValues(db, definitionId, located);
  locateGraphValues(db, definitionId, located);
  located.sort(compareLocation);
  return located;
}

/** Called inside a host-create transaction. Does not fill defaults. */
export function writeRequiredFieldValues(
  db: SqliteDatabase,
  targetType: string,
  targetId: string,
  values: Record<string, unknown> | undefined,
  lexemeId?: string,
): void {
  const provided = values ?? {};
  for (const id of requiredDefinitionIds(db, targetType)) {
    if (!(id in provided)) throw new Error(`${targetType} is missing a required field`);
  }
  for (const [definitionId, value] of Object.entries(provided)) {
    storeFieldValue(db, requireDefinition(db, definitionId), targetType, targetId, value, lexemeId);
  }
}

/** Save keeps stored bags. Callers edit values through setFieldValue, not jieyu. */
export function splitLexemeExtension(jieyu: unknown): unknown {
  if (typeof jieyu !== 'object' || jieyu === null || Array.isArray(jieyu)) return jieyu;
  const domain = { ...(jieyu as Record<string, unknown>) };
  delete domain.customFields;
  delete domain.senseCustomFields;
  return domain;
}

export function lexemeExtensionForSave(
  existingJieyuJson: string | undefined,
  domain: Record<string, unknown>,
  senseIds: readonly string[],
): Record<string, unknown> {
  const stored = existingJieyuJson === undefined ? {} : objectMap(existingJieyuJson);
  const next: Record<string, unknown> = { ...domain };
  const fields = bag(stored.customFields);
  if (Object.keys(fields).length > 0) next.customFields = fields;
  const senses = bag(stored.senseCustomFields);
  const kept: Record<string, unknown> = {};
  for (const senseId of senseIds) {
    if (senseId in senses) kept[senseId] = senses[senseId];
  }
  if (Object.keys(kept).length > 0) next.senseCustomFields = kept;
  return next;
}

export function dropSenseFieldBag(db: SqliteDatabase, lexemeId: string, senseId: string): void {
  const jieyu = readJieyu(db, lexemeId);
  if (jieyu === null) return;
  const senses = bag(jieyu.senseCustomFields);
  if (!(senseId in senses)) return;
  delete senses[senseId];
  if (Object.keys(senses).length === 0) delete jieyu.senseCustomFields;
  else jieyu.senseCustomFields = senses;
  writeJieyu(db, lexemeId, jieyu);
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

function writeFieldValue(
  db: SqliteDatabase,
  targetType: string,
  targetId: string,
  definitionId: string,
  value: unknown,
  expectedRevision: number,
  afterWrite?: () => void,
  lexemeId?: string,
): CustomFieldHostValue {
  const write = db.transaction(() => {
    requireHost(db, targetType, targetId, lexemeId);
    const definition = requireDefinition(db, definitionId);
    if (definition.revision !== expectedRevision)
      throw new Error('custom field revision does not match');
    storeFieldValue(db, definition, targetType, targetId, value, lexemeId);
    afterWrite?.();
    const stored = readFieldValue(db, definitionId, targetType, targetId, lexemeId);
    if (canonicalJson(stored) !== canonicalJson(value))
      throw new Error('custom field readback failed');
    return { definitionId, targetType, targetId, revision: definition.revision, value: stored };
  });
  return write();
}

function fieldValueInput(
  input: unknown,
  withRevision: boolean,
): {
  definitionId: string;
  targetType: string;
  targetId: string;
  value: unknown;
  expectedRevision: number;
  lexemeId?: string;
} {
  const patch = record(input, 'custom field definition is invalid');
  assertAllowed(
    patch,
    withRevision
      ? ['definitionId', 'targetType', 'targetId', 'value', 'expectedRevision', 'lexemeId']
      : ['definitionId', 'targetType', 'targetId', 'value', 'lexemeId'],
  );
  if (!('value' in patch) || patch.value === undefined || patch.value === null) {
    throw new Error('custom field value is missing');
  }
  const targetType = requiredText(patch.targetType, 'custom field target does not match');
  const lexemeId = lexemeScope(patch, targetType);
  return {
    definitionId: requiredText(patch.definitionId, 'custom field definition is missing'),
    targetType,
    targetId: requiredText(patch.targetId, 'custom field target is missing'),
    value: patch.value,
    expectedRevision: withRevision ? requiredRevision(patch.expectedRevision) : 0,
    ...(lexemeId === undefined ? {} : { lexemeId }),
  };
}

function lexemeScope(patch: Record<string, unknown>, targetType: string): string | undefined {
  if (targetType === 'lexeme-sense') return requiredText(patch.lexemeId, 'lexeme id is missing');
  if ('lexemeId' in patch) throw new Error('custom field target does not match');
  return undefined;
}

function requireHost(
  db: SqliteDatabase,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): void {
  if (!isWritableHost(targetType)) throw new Error('custom field target is not writable yet');
  if (targetType === 'lexeme-sense' && lexemeId === undefined) {
    throw new Error('lexeme id is missing');
  }
  const ref = {
    targetType: storedTarget(targetType),
    targetId,
    ...(lexemeId === undefined ? {} : { lexemeId }),
  };
  if (!targetExists(db, ref)) throw new Error(`${targetType} is missing`);
}

function requiredDefinitionIds(db: SqliteDatabase, targetType: string): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM custom_field_definitions
       WHERE target_type = ? AND required = 1
       ORDER BY sort_order, id`,
    )
    .all(targetType) as { id: string }[];
  return rows.map((row) => row.id);
}

function languageMap(db: SqliteDatabase, languageId: string): Record<string, unknown> {
  const row = db
    .prepare('SELECT custom_fields_json FROM languages WHERE id = ?')
    .get(languageId) as { custom_fields_json: string } | undefined;
  if (row === undefined) throw new Error('language is missing');
  return objectMap(row.custom_fields_json);
}

function objectMap(json: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('custom field value is invalid');
  }
  return parsed as Record<string, unknown>;
}

function storeLanguageValue(
  db: SqliteDatabase,
  definitionId: string,
  languageId: string,
  value: unknown,
): void {
  const map = languageMap(db, languageId);
  map[definitionId] = value;
  db.prepare('UPDATE languages SET custom_fields_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(map),
    new Date().toISOString(),
    languageId,
  );
}

function isTableHost(value: string): boolean {
  return (TABLE_VALUE_HOSTS as readonly string[]).includes(value);
}

function isWritableHost(value: string): boolean {
  return (
    value === 'language' || value === 'lexeme' || value === 'lexeme-sense' || isTableHost(value)
  );
}

function jsonValueMap(
  db: SqliteDatabase,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): Record<string, unknown> {
  if (targetType === 'language') {
    const row = db
      .prepare('SELECT custom_fields_json FROM languages WHERE id = ?')
      .get(targetId) as { custom_fields_json: string } | undefined;
    return row === undefined ? {} : objectMap(row.custom_fields_json);
  }
  const jieyu = readJieyu(db, targetType === 'lexeme' ? targetId : (lexemeId ?? ''));
  if (jieyu === null) return {};
  if (targetType === 'lexeme') return bag(jieyu.customFields);
  return bag(bag(jieyu.senseCustomFields)[targetId]);
}

function clearFieldValue(
  db: SqliteDatabase,
  definitionId: string,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): void {
  if (targetType === 'language') {
    const map = languageMap(db, targetId);
    delete map[definitionId];
    db.prepare('UPDATE languages SET custom_fields_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(map),
      new Date().toISOString(),
      targetId,
    );
    return;
  }
  if (targetType === 'lexeme' || targetType === 'lexeme-sense') {
    clearLexemeValue(db, definitionId, targetType, targetId, lexemeId);
    return;
  }
  db.prepare(
    `DELETE FROM custom_field_values
     WHERE definition_id = ? AND target_type = ? AND target_id = ?`,
  ).run(definitionId, targetType, targetId);
}

function clearLexemeValue(
  db: SqliteDatabase,
  definitionId: string,
  targetType: string,
  targetId: string,
  lexemeId?: string,
): void {
  const ownerId = targetType === 'lexeme' ? targetId : lexemeId;
  if (ownerId === undefined) throw new Error('lexeme id is missing');
  const jieyu = readJieyu(db, ownerId);
  if (jieyu === null) throw new Error('lexeme is missing');
  if (targetType === 'lexeme') {
    const fields = bag(jieyu.customFields);
    delete fields[definitionId];
    if (Object.keys(fields).length === 0) delete jieyu.customFields;
    else jieyu.customFields = fields;
  } else {
    const senses = bag(jieyu.senseCustomFields);
    const fields = bag(senses[targetId]);
    delete fields[definitionId];
    if (Object.keys(fields).length === 0) delete senses[targetId];
    else senses[targetId] = fields;
    if (Object.keys(senses).length === 0) delete jieyu.senseCustomFields;
    else jieyu.senseCustomFields = senses;
  }
  writeJieyu(db, ownerId, jieyu);
}

function storeLexemeBag(
  db: SqliteDatabase,
  definitionId: string,
  lexemeId: string,
  value: unknown,
): void {
  const jieyu = readJieyu(db, lexemeId);
  if (jieyu === null) throw new Error('lexeme is missing');
  const fields = bag(jieyu.customFields);
  fields[definitionId] = value;
  jieyu.customFields = fields;
  writeJieyu(db, lexemeId, jieyu);
}

function storeSenseBag(
  db: SqliteDatabase,
  definitionId: string,
  senseId: string,
  value: unknown,
  lexemeId: string | undefined,
): void {
  if (lexemeId === undefined) throw new Error('lexeme id is missing');
  const jieyu = readJieyu(db, lexemeId);
  if (jieyu === null) throw new Error('lexeme is missing');
  if (!senseExists(db, lexemeId, senseId)) throw new Error('lexeme-sense is missing');
  const senses = bag(jieyu.senseCustomFields);
  const fields = bag(senses[senseId]);
  fields[definitionId] = value;
  senses[senseId] = fields;
  jieyu.senseCustomFields = senses;
  writeJieyu(db, lexemeId, jieyu);
}

function readJieyu(db: SqliteDatabase, lexemeId: string): Record<string, unknown> | null {
  const row = db.prepare('SELECT jieyu_json FROM lexemes WHERE id = ?').get(lexemeId) as
    { jieyu_json: string } | undefined;
  return row === undefined ? null : objectMap(row.jieyu_json);
}

function writeJieyu(db: SqliteDatabase, lexemeId: string, jieyu: Record<string, unknown>): void {
  db.prepare('UPDATE lexemes SET jieyu_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(jieyu),
    new Date().toISOString(),
    lexemeId,
  );
}

function bag(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('custom field value is invalid');
  }
  return value as Record<string, unknown>;
}

function locateLexemeValues(
  db: SqliteDatabase,
  definitionId: string,
  located: CustomFieldLocation[],
): void {
  const rows = db.prepare('SELECT id, jieyu_json FROM lexemes').all() as {
    id: string;
    jieyu_json: string;
  }[];
  for (const row of rows) {
    const jieyu = objectMap(row.jieyu_json);
    if (definitionId in bag(jieyu.customFields)) {
      located.push({ targetType: 'lexeme', targetId: row.id });
    }
    const senses = bag(jieyu.senseCustomFields);
    for (const [senseId, fields] of Object.entries(senses)) {
      if (definitionId in bag(fields)) {
        located.push({ targetType: 'lexeme-sense', targetId: senseId, lexemeId: row.id });
      }
    }
  }
}

function locateGraphValues(
  db: SqliteDatabase,
  definitionId: string,
  located: CustomFieldLocation[],
): void {
  const rows = db
    .prepare('SELECT id, analysis_graph_json FROM units WHERE analysis_graph_json IS NOT NULL')
    .all() as { id: string; analysis_graph_json: string }[];
  for (const row of rows) {
    const graph = JSON.parse(row.analysis_graph_json) as {
      nodes?: { id?: string; customFields?: unknown }[];
      relations?: { id?: string; customFields?: unknown }[];
    };
    collectGraphFields(located, 'analysis-node', row.id, definitionId, graph.nodes);
    collectGraphFields(located, 'analysis-relation', row.id, definitionId, graph.relations);
  }
}

function collectGraphFields(
  located: CustomFieldLocation[],
  targetType: 'analysis-node' | 'analysis-relation',
  unitId: string,
  definitionId: string,
  items: { id?: string; customFields?: unknown }[] | undefined,
): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (typeof item.id !== 'string') continue;
    if (definitionId in bag(item.customFields)) {
      located.push({ targetType, targetId: item.id, unitId });
    }
  }
}

function compareLocation(left: CustomFieldLocation, right: CustomFieldLocation): number {
  const byType = left.targetType.localeCompare(right.targetType);
  if (byType !== 0) return byType;
  const byId = left.targetId.localeCompare(right.targetId);
  if (byId !== 0) return byId;
  const byLexeme = (left.lexemeId ?? '').localeCompare(right.lexemeId ?? '');
  if (byLexeme !== 0) return byLexeme;
  return (left.unitId ?? '').localeCompare(right.unitId ?? '');
}

function storeFieldValue(
  db: SqliteDatabase,
  definition: CustomFieldDefinition,
  targetType: string,
  targetId: string,
  value: unknown,
  lexemeId?: string,
): void {
  if (definition.targetType !== targetType) throw new Error('custom field target does not match');
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
  const stored = JSON.parse(text) as unknown;
  if (targetType === 'language') {
    storeLanguageValue(db, definition.id, targetId, stored);
    return;
  }
  if (targetType === 'lexeme') {
    storeLexemeBag(db, definition.id, targetId, stored);
    return;
  }
  if (targetType === 'lexeme-sense') {
    storeSenseBag(db, definition.id, targetId, stored, lexemeId);
    return;
  }
  if (!isTableHost(targetType)) throw new Error('custom field target is not writable yet');
  db.prepare(
    `INSERT INTO custom_field_values (definition_id, target_type, target_id, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(definition_id, target_type, target_id) DO UPDATE SET
       value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(definition.id, targetType, targetId, text, new Date().toISOString());
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
