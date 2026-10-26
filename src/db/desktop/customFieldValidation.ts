export const CUSTOM_FIELD_TARGETS = [
  'project',
  'manuscript',
  'layer',
  'unit',
  'media',
  'source',
  'speaker',
  'note',
  'conversation',
  'message',
  'language',
  'orthography',
  'orthography-bridge',
  'lexeme',
  'lexeme-sense',
  'analysis-node',
  'analysis-relation',
] as const;

export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'select',
  'multiselect',
  'url',
  'ref',
] as const;

export const CUSTOM_FIELD_DEFINITION_KEYS = [
  'targetType',
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
  'options',
] as const;

export type CustomFieldTarget = (typeof CUSTOM_FIELD_TARGETS)[number];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldRef {
  targetType: CustomFieldTarget;
  targetId: string;
  unitId?: string;
  lexemeId?: string;
}

export interface ParsedCustomFieldDefinition {
  targetType: CustomFieldTarget;
  name: Record<string, string>;
  description: Record<string, string> | null;
  placeholder: Record<string, string> | null;
  helpText: Record<string, string> | null;
  fieldType: CustomFieldType;
  required: boolean;
  pattern: string | null;
  minValue: number | null;
  maxValue: number | null;
  targetTypes: CustomFieldTarget[] | null;
  cardinality: 'one' | 'many' | null;
  minItems: number | null;
  maxItems: number | null;
  sortOrder: number;
  options: { label: Record<string, string>; sortOrder: number }[];
  defaultValue: unknown | null;
}

export interface CustomFieldValueRule {
  fieldType: CustomFieldType;
  pattern: string | null;
  minValue: number | null;
  maxValue: number | null;
  targetTypes: readonly CustomFieldTarget[] | null;
  cardinality: 'one' | 'many' | null;
  minItems: number | null;
  maxItems: number | null;
  optionIds: readonly string[];
}

export function parseCustomFieldDefinition(input: unknown): ParsedCustomFieldDefinition {
  const record = recordValue(input);
  assertKeys(record, CUSTOM_FIELD_DEFINITION_KEYS);
  const targetType = targetValue(record.targetType);
  const fieldType = typeValue(record.fieldType);
  const choice = fieldType === 'select' || fieldType === 'multiselect';
  const options = parseOptions(record.options, choice);
  const parsed: ParsedCustomFieldDefinition = {
    targetType,
    name: requiredName(record.name),
    description: optionalMap(record.description),
    placeholder: optionalMap(record.placeholder),
    helpText: optionalMap(record.helpText),
    fieldType,
    required: record.required === undefined ? false : booleanValue(record.required),
    pattern: optionalPattern(record.pattern, fieldType),
    minValue: optionalBound(record.minValue, fieldType),
    maxValue: optionalBound(record.maxValue, fieldType),
    targetTypes:
      fieldType === 'ref' ? targetList(record.targetTypes) : absentTargets(record.targetTypes),
    cardinality:
      fieldType === 'ref'
        ? cardinalityValue(record.cardinality)
        : absentCardinality(record.cardinality),
    minItems: optionalCount(record.minItems, fieldType),
    maxItems: optionalCount(record.maxItems, fieldType),
    sortOrder:
      record.sortOrder === undefined
        ? 0
        : integerValue(record.sortOrder, 'custom field sort is invalid'),
    options,
    defaultValue: null,
  };
  assertRange(parsed.minValue, parsed.maxValue);
  assertRange(parsed.minItems, parsed.maxItems);
  if (parsed.cardinality === 'one') {
    if (
      (parsed.maxItems !== null && parsed.maxItems > 1) ||
      (parsed.minItems !== null && parsed.minItems > 1)
    ) {
      throw new Error('custom field constraint does not apply');
    }
  }
  if ('defaultValue' in record && record.defaultValue !== undefined) {
    if (record.defaultValue === null) throw new Error('custom field value is invalid');
    parsed.defaultValue = record.defaultValue;
  }
  return parsed;
}

export function assertCustomFieldValue(
  rule: CustomFieldValueRule,
  value: unknown,
  exists: (ref: CustomFieldRef) => boolean,
): void {
  switch (rule.fieldType) {
    case 'text':
      assertText(value, rule.pattern);
      return;
    case 'url':
      assertUrl(value, rule.pattern);
      return;
    case 'number':
      assertNumber(value, rule);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error('custom field value is invalid');
      return;
    case 'select':
      if (typeof value !== 'string' || !rule.optionIds.includes(value)) {
        throw new Error('custom field value is invalid');
      }
      return;
    case 'multiselect':
      assertMultiselect(value, rule.optionIds);
      return;
    case 'ref':
      assertRef(value, rule, exists);
      return;
    default: {
      const unreachable: never = rule.fieldType;
      throw new Error(`custom field value is invalid: ${unreachable}`);
    }
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function assertText(value: unknown, pattern: string | null): void {
  if (typeof value !== 'string') throw new Error('custom field value is invalid');
  if (pattern !== null && !new RegExp(pattern).test(value)) {
    throw new Error('custom field value is invalid');
  }
}

function assertUrl(value: unknown, pattern: string | null): void {
  if (typeof value !== 'string') throw new Error('custom field value is invalid');
  if (pattern !== null && !new RegExp(pattern).test(value)) {
    throw new Error('custom field value is invalid');
  }
  try {
    new URL(value);
  } catch {
    throw new Error('custom field value is invalid');
  }
}

function assertNumber(value: unknown, rule: CustomFieldValueRule): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('custom field value is invalid');
  }
  if (rule.minValue !== null && value < rule.minValue)
    throw new Error('custom field value is invalid');
  if (rule.maxValue !== null && value > rule.maxValue)
    throw new Error('custom field value is invalid');
}

function assertMultiselect(value: unknown, optionIds: readonly string[]): void {
  if (!Array.isArray(value)) throw new Error('custom field value is invalid');
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !optionIds.includes(item) || seen.has(item)) {
      throw new Error('custom field value is invalid');
    }
    seen.add(item);
  }
}

function assertRef(
  value: unknown,
  rule: CustomFieldValueRule,
  exists: (ref: CustomFieldRef) => boolean,
): void {
  const refs = rule.cardinality === 'many' ? refList(value) : [oneRef(value)];
  if (rule.minItems !== null && refs.length < rule.minItems) {
    throw new Error('custom field value is invalid');
  }
  if (rule.maxItems !== null && refs.length > rule.maxItems) {
    throw new Error('custom field value is invalid');
  }
  const seen = new Set<string>();
  for (const ref of refs) {
    if (rule.targetTypes === null || !rule.targetTypes.includes(ref.targetType)) {
      throw new Error('custom field value is invalid');
    }
    const identity = `${ref.targetType}\u0000${ref.targetId}\u0000${ref.unitId ?? ''}\u0000${ref.lexemeId ?? ''}`;
    if (seen.has(identity) || !exists(ref)) throw new Error('custom field value is invalid');
    seen.add(identity);
  }
}

function oneRef(value: unknown): CustomFieldRef {
  if (Array.isArray(value)) throw new Error('custom field value is invalid');
  return refValue(value);
}

function refList(value: unknown): CustomFieldRef[] {
  if (!Array.isArray(value)) throw new Error('custom field value is invalid');
  return value.map(refValue);
}

function refValue(value: unknown): CustomFieldRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('custom field value is invalid');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!['targetType', 'targetId', 'unitId', 'lexemeId'].includes(key)) {
      throw new Error('custom field value is invalid');
    }
  }
  let targetType: CustomFieldTarget;
  try {
    targetType = targetValue(record.targetType);
  } catch {
    throw new Error('custom field value is invalid');
  }
  if (typeof record.targetId !== 'string' || record.targetId.length === 0) {
    throw new Error('custom field value is invalid');
  }
  const ref: CustomFieldRef = { targetType, targetId: record.targetId };
  const needsUnit = targetType === 'analysis-node' || targetType === 'analysis-relation';
  const needsLexeme = targetType === 'lexeme-sense';
  if (needsUnit) {
    if (typeof record.unitId !== 'string' || record.unitId.length === 0) {
      throw new Error('custom field value is invalid');
    }
    ref.unitId = record.unitId;
  } else if ('unitId' in record) {
    throw new Error('custom field value is invalid');
  }
  if (needsLexeme) {
    if (typeof record.lexemeId !== 'string' || record.lexemeId.length === 0) {
      throw new Error('custom field value is invalid');
    }
    ref.lexemeId = record.lexemeId;
  } else if ('lexemeId' in record) {
    throw new Error('custom field value is invalid');
  }
  return ref;
}

function parseOptions(
  value: unknown,
  choice: boolean,
): { label: Record<string, string>; sortOrder: number }[] {
  if (value === undefined) {
    if (choice) throw new Error('custom field option is missing');
    return [];
  }
  if (!choice || !Array.isArray(value) || value.length === 0) {
    throw new Error('custom field constraint does not apply');
  }
  return value.map((item, index) => {
    const record = recordValue(item);
    assertKeys(record, ['label', 'sortOrder']);
    return {
      label: requiredName(record.label),
      sortOrder:
        record.sortOrder === undefined
          ? index
          : integerValue(record.sortOrder, 'custom field sort is invalid'),
    };
  });
}

function requiredName(value: unknown): Record<string, string> {
  const map = stringMap(value);
  if (map === null || !Object.values(map).some((item) => item.length > 0)) {
    throw new Error('custom field name is empty');
  }
  return map;
}

function optionalMap(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) return null;
  const map = stringMap(value);
  if (map === null) throw new Error('custom field definition is invalid');
  return map;
}

function optionalPattern(value: unknown, fieldType: CustomFieldType): string | null {
  if (value === undefined || value === null) return null;
  if (
    (fieldType !== 'text' && fieldType !== 'url') ||
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error('custom field constraint does not apply');
  }
  try {
    new RegExp(value);
  } catch {
    throw new Error('custom field pattern is invalid');
  }
  return value;
}

function optionalBound(value: unknown, fieldType: CustomFieldType): number | null {
  if (value === undefined || value === null) return null;
  if (fieldType !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('custom field constraint does not apply');
  }
  return value;
}

function optionalCount(value: unknown, fieldType: CustomFieldType): number | null {
  if (value === undefined || value === null) return null;
  if (fieldType !== 'ref') throw new Error('custom field constraint does not apply');
  const count = integerValue(value, 'custom field constraint does not apply');
  if (count < 0) throw new Error('custom field constraint does not apply');
  return count;
}

function absentTargets(value: unknown): null {
  if (value !== undefined && value !== null)
    throw new Error('custom field constraint does not apply');
  return null;
}

function absentCardinality(value: unknown): null {
  if (value !== undefined && value !== null)
    throw new Error('custom field constraint does not apply');
  return null;
}

function targetList(value: unknown): CustomFieldTarget[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('custom field constraint does not apply');
  const targets = value.map(targetValue);
  if (new Set(targets).size !== targets.length)
    throw new Error('custom field constraint does not apply');
  return targets;
}

function cardinalityValue(value: unknown): 'one' | 'many' {
  if (value !== 'one' && value !== 'many')
    throw new Error('custom field constraint does not apply');
  return value;
}

function assertRange(min: number | null, max: number | null): void {
  if (min !== null && max !== null && min > max) throw new Error('custom field range is invalid');
}

function targetValue(value: unknown): CustomFieldTarget {
  if (typeof value !== 'string' || !isTarget(value))
    throw new Error('custom field definition is invalid');
  return value;
}

function typeValue(value: unknown): CustomFieldType {
  if (typeof value !== 'string' || !isType(value))
    throw new Error('custom field definition is invalid');
  return value;
}

function isTarget(value: string): value is CustomFieldTarget {
  return (CUSTOM_FIELD_TARGETS as readonly string[]).includes(value);
}

function isType(value: string): value is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('custom field definition is invalid');
  return value;
}

function integerValue(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(message);
  return value;
}

function stringMap(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const map: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || typeof item !== 'string') return null;
    map[key] = item;
  }
  return map;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('custom field definition is invalid');
  }
  return value as Record<string, unknown>;
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error('custom field definition is invalid');
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value === 'object' && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
