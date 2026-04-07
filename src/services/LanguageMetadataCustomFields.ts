import { z } from 'zod';
import { tf, type Locale } from '../i18n';
import type { CustomFieldDefinitionDocType, CustomFieldValueType, LanguageDocType, MultiLangString } from '../db';

export type CustomFieldStoredValue = NonNullable<LanguageDocType['customFields']>[string];

export const CUSTOM_FIELD_VALUE_TYPES = ['text', 'number', 'boolean', 'select', 'multiselect', 'url'] as const satisfies readonly CustomFieldValueType[];

export const CUSTOM_FIELD_RENDERER_REGISTRY: Record<CustomFieldValueType, {
  htmlInputType: 'text' | 'number' | 'checkbox' | 'select' | 'url';
  supportsOptions: boolean;
  supportsNumericRange: boolean;
  supportsPattern: boolean;
  supportsDefaultValue: boolean;
  isMultiValue: boolean;
}> = {
  text: { htmlInputType: 'text', supportsOptions: false, supportsNumericRange: false, supportsPattern: true, supportsDefaultValue: true, isMultiValue: false },
  number: { htmlInputType: 'number', supportsOptions: false, supportsNumericRange: true, supportsPattern: false, supportsDefaultValue: true, isMultiValue: false },
  boolean: { htmlInputType: 'checkbox', supportsOptions: false, supportsNumericRange: false, supportsPattern: false, supportsDefaultValue: true, isMultiValue: false },
  select: { htmlInputType: 'select', supportsOptions: true, supportsNumericRange: false, supportsPattern: false, supportsDefaultValue: true, isMultiValue: false },
  multiselect: { htmlInputType: 'select', supportsOptions: true, supportsNumericRange: false, supportsPattern: false, supportsDefaultValue: true, isMultiValue: true },
  url: { htmlInputType: 'url', supportsOptions: false, supportsNumericRange: false, supportsPattern: true, supportsDefaultValue: true, isMultiValue: false },
};

const multiLangStringSchema = z.record(z.string(), z.string());
const storedValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string())]);

export const customFieldDefinitionInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: multiLangStringSchema,
  fieldType: z.enum(CUSTOM_FIELD_VALUE_TYPES),
  options: z.array(z.string()).optional(),
  description: multiLangStringSchema.optional(),
  required: z.boolean().optional(),
  defaultValue: storedValueSchema.optional(),
  placeholder: multiLangStringSchema.optional(),
  helpText: multiLangStringSchema.optional(),
  minValue: z.number().finite().optional(),
  maxValue: z.number().finite().optional(),
  pattern: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).superRefine((value, ctx) => {
  const options = normalizeOptionList(value.options);
  const descriptor = CUSTOM_FIELD_RENDERER_REGISTRY[value.fieldType];

  if (readLocalizedFieldText('zh-CN', value.name).trim().length === 0 && readLocalizedFieldText('en-US', value.name).trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Field name is required.' });
  }

  if (descriptor.supportsOptions && (!options || options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Option-based fields require at least one option.' });
  }

  if (!descriptor.supportsOptions && options && options.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only select and multiselect fields can define options.' });
  }

  if (!descriptor.supportsNumericRange && (value.minValue !== undefined || value.maxValue !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only number fields support min/max.' });
  }

  if (value.minValue !== undefined && value.maxValue !== undefined && value.minValue > value.maxValue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Min value cannot be greater than max value.' });
  }

  if (!descriptor.supportsPattern && value.pattern?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This field type does not support regex pattern validation.' });
  }

  if (value.pattern?.trim()) {
    try {
      new RegExp(value.pattern.trim());
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Regex pattern is invalid.' });
    }
  }

  if (value.defaultValue !== undefined) {
    const result = validateStoredValueAgainstDefinition({
      fieldType: value.fieldType,
      ...(options ? { options } : {}),
      ...(value.minValue !== undefined ? { minValue: value.minValue } : {}),
      ...(value.maxValue !== undefined ? { maxValue: value.maxValue } : {}),
      ...(value.pattern?.trim() ? { pattern: value.pattern.trim() } : {}),
    } as Pick<CustomFieldDefinitionDocType, 'fieldType' | 'options' | 'minValue' | 'maxValue' | 'pattern'>, value.defaultValue);
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason ?? 'Default value does not match the field definition.' });
    }
  }
});

type NormalizedCustomFieldDefinitionInput = {
  id?: string;
  name: MultiLangString;
  fieldType: CustomFieldValueType;
  options?: string[];
  description?: MultiLangString;
  required?: boolean;
  defaultValue?: CustomFieldStoredValue;
  placeholder?: MultiLangString;
  helpText?: MultiLangString;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  sortOrder?: number;
};

function normalizeMultiLangString(value?: MultiLangString): MultiLangString | undefined {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([locale, text]) => [locale, text.trim()] as const)
    .filter(([, text]) => text.length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function normalizeOptionList(options?: readonly string[]): string[] | undefined {
  const normalized = (options ?? [])
    .map((option) => option.trim())
    .filter(Boolean)
    .filter((option, index, list) => list.indexOf(option) === index);

  return normalized.length > 0 ? normalized : undefined;
}

function validateStoredValueAgainstDefinition(
  definition: Pick<CustomFieldDefinitionDocType, 'fieldType' | 'options' | 'minValue' | 'maxValue' | 'pattern'>,
  value: CustomFieldStoredValue,
): { valid: boolean; reason?: string } {
  switch (definition.fieldType) {
    case 'boolean':
      return { valid: typeof value === 'boolean' };
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return { valid: false, reason: 'Default value must be a valid number.' };
      }
      if (definition.minValue !== undefined && value < definition.minValue) {
        return { valid: false, reason: 'Default value is below min value.' };
      }
      if (definition.maxValue !== undefined && value > definition.maxValue) {
        return { valid: false, reason: 'Default value is above max value.' };
      }
      return { valid: true };
    }
    case 'select':
      return {
        valid: typeof value === 'string' && !!definition.options?.includes(value),
        ...(typeof value === 'string' && definition.options?.includes(value) ? {} : { reason: 'Default value must match one of the options.' }),
      };
    case 'multiselect':
      return {
        valid: Array.isArray(value) && value.every((item) => typeof item === 'string' && !!definition.options?.includes(item)),
        ...(Array.isArray(value) && value.every((item) => typeof item === 'string' && !!definition.options?.includes(item)) ? {} : { reason: 'Default value must only contain valid options.' }),
      };
    case 'url':
    case 'text': {
      if (typeof value !== 'string') {
        return { valid: false, reason: 'Default value must be text.' };
      }
      if (definition.pattern?.trim()) {
        const regex = new RegExp(definition.pattern.trim());
        if (!regex.test(value)) {
          return { valid: false, reason: 'Default value does not match the regex pattern.' };
        }
      }
      if (definition.fieldType === 'url' && value.trim()) {
        try {
          new URL(value);
        } catch {
          return { valid: false, reason: 'Default value must be a valid URL.' };
        }
      }
      return { valid: true };
    }
  }
}

export function validateCustomFieldDefinitionInput(input: {
  id?: string;
  name: MultiLangString;
  fieldType: CustomFieldValueType;
  options?: string[];
  description?: MultiLangString;
  required?: boolean;
  defaultValue?: CustomFieldStoredValue;
  placeholder?: MultiLangString;
  helpText?: MultiLangString;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  sortOrder?: number;
}): NormalizedCustomFieldDefinitionInput {
  const parsed = customFieldDefinitionInputSchema.parse(input);
  const normalizedName = normalizeMultiLangString(parsed.name) ?? parsed.name;
  const normalizedOptions = normalizeOptionList(parsed.options);
  const normalizedDescription = normalizeMultiLangString(parsed.description);
  const normalizedPlaceholder = normalizeMultiLangString(parsed.placeholder);
  const normalizedHelpText = normalizeMultiLangString(parsed.helpText);
  const normalizedPattern = parsed.pattern?.trim();

  return {
    ...(parsed.id ? { id: parsed.id.trim() } : {}),
    name: normalizedName,
    fieldType: parsed.fieldType,
    ...(normalizedOptions ? { options: normalizedOptions } : {}),
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    ...(parsed.required ? { required: true } : {}),
    ...(parsed.defaultValue !== undefined ? { defaultValue: parsed.defaultValue } : {}),
    ...(normalizedPlaceholder ? { placeholder: normalizedPlaceholder } : {}),
    ...(normalizedHelpText ? { helpText: normalizedHelpText } : {}),
    ...(parsed.minValue !== undefined ? { minValue: parsed.minValue } : {}),
    ...(parsed.maxValue !== undefined ? { maxValue: parsed.maxValue } : {}),
    ...(normalizedPattern ? { pattern: normalizedPattern } : {}),
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {}),
  };
}

export function readLocalizedFieldText(locale: Locale, value?: MultiLangString): string {
  return value?.[locale] ?? value?.['zh-CN'] ?? value?.['en-US'] ?? '';
}

export function formatCustomFieldOptionsEditorValue(options?: readonly string[]): string {
  return (options ?? []).join('\n');
}

export function parseCustomFieldOptionsEditorValue(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function serializeCustomFieldDraftValue(value: CustomFieldStoredValue): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

export function parseCustomFieldDraftMultiselectValue(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // 兼容旧版逗号协议 | Backward compatibility for legacy comma-delimited values
  }

  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

export function buildCustomFieldDraftValues(customFields?: LanguageDocType['customFields']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(customFields ?? {}).map(([key, value]) => [key, serializeCustomFieldDraftValue(value)])
  );
}

export function applyCustomFieldDraftDefaults(
  definitions: readonly CustomFieldDefinitionDocType[],
  draftValues: Record<string, string>,
): Record<string, string> {
  const next = { ...draftValues };

  definitions.forEach((definition) => {
    if ((next[definition.id] ?? '').trim()) {
      return;
    }
    if (definition.defaultValue === undefined) {
      return;
    }
    next[definition.id] = serializeCustomFieldDraftValue(definition.defaultValue);
  });

  return next;
}

export function validateCustomFieldDraftValue(
  definition: CustomFieldDefinitionDocType,
  rawValue: string | boolean | string[],
  locale: Locale,
): string | null {
  const label = readLocalizedFieldText(locale, definition.name) || definition.id;
  const descriptor = CUSTOM_FIELD_RENDERER_REGISTRY[definition.fieldType];

  const isEmpty = Array.isArray(rawValue)
    ? rawValue.length === 0
    : typeof rawValue === 'boolean'
      ? false
      : rawValue.trim().length === 0;

  if (definition.required && isEmpty) {
    return tf(locale, 'workspace.languageMetadata.customFieldErrorRequired', { field: label });
  }

  if (isEmpty) {
    return null;
  }

  switch (definition.fieldType) {
    case 'number': {
      const value = typeof rawValue === 'string' ? Number(rawValue.trim()) : Number(rawValue);
      if (Number.isNaN(value)) {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorNumber', { field: label });
      }
      if (definition.minValue !== undefined && value < definition.minValue) {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorMin', { field: label, min: String(definition.minValue) });
      }
      if (definition.maxValue !== undefined && value > definition.maxValue) {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorMax', { field: label, max: String(definition.maxValue) });
      }
      return null;
    }
    case 'select': {
      const value = String(rawValue).trim();
      if (definition.options?.length && !definition.options.includes(value)) {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorOption', { field: label });
      }
      return null;
    }
    case 'multiselect': {
      const values = Array.isArray(rawValue) ? rawValue : parseCustomFieldDraftMultiselectValue(String(rawValue));
      if (definition.options?.length && values.some((item) => !definition.options?.includes(item))) {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorOption', { field: label });
      }
      return null;
    }
    case 'url': {
      const value = String(rawValue).trim();
      try {
        new URL(value);
      } catch {
        return tf(locale, 'workspace.languageMetadata.customFieldErrorUrl', { field: label });
      }
      if (definition.pattern?.trim()) {
        const regex = new RegExp(definition.pattern.trim());
        if (!regex.test(value)) {
          return tf(locale, 'workspace.languageMetadata.customFieldErrorPattern', { field: label });
        }
      }
      return null;
    }
    case 'text': {
      if (descriptor.supportsPattern && definition.pattern?.trim()) {
        const regex = new RegExp(definition.pattern.trim());
        if (!regex.test(String(rawValue))) {
          return tf(locale, 'workspace.languageMetadata.customFieldErrorPattern', { field: label });
        }
      }
      return null;
    }
    case 'boolean':
      return null;
  }
}

export function parseCustomFieldDraftValue(
  definition: CustomFieldDefinitionDocType,
  rawValue: string,
): CustomFieldStoredValue | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  switch (definition.fieldType) {
    case 'number': {
      const numeric = Number(trimmed);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    case 'boolean':
      return trimmed === 'true';
    case 'multiselect':
      return parseCustomFieldDraftMultiselectValue(trimmed);
    default:
      return trimmed;
  }
}

export function buildPersistedCustomFieldValues(
  draftValues: Record<string, string>,
  definitions: readonly CustomFieldDefinitionDocType[],
  locale: Locale,
): Record<string, CustomFieldStoredValue> {
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition] as const));
  const result: Record<string, CustomFieldStoredValue> = {};

  for (const [fieldId, rawValue] of Object.entries(draftValues)) {
    const definition = definitionMap.get(fieldId);
    if (!definition) {
      // 字段定义不存在时丢弃值，避免被删除字段在保存时“幽灵复活” | Drop values without active definitions to avoid resurrecting removed fields
      continue;
    }

    const normalizedInput = definition.fieldType === 'multiselect'
      ? parseCustomFieldDraftMultiselectValue(rawValue)
      : definition.fieldType === 'boolean'
        ? rawValue === 'true'
        : rawValue;

    const validationMessage = validateCustomFieldDraftValue(definition, normalizedInput, locale);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const persistedValue = parseCustomFieldDraftValue(definition, rawValue);
    if (persistedValue !== undefined) {
      result[fieldId] = persistedValue;
    }
  }

  return result;
}