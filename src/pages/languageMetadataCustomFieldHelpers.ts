/**
 * languageMetadataCustomFieldHelpers — Pure helpers for custom field definition editing
 * Extracted from LanguageMetadataWorkspaceCustomFieldDefinitionCard.tsx
 */

import type { CustomFieldDefinitionDocType, CustomFieldValueType } from '../types/jieyuDbDocTypes';
import { t } from '../i18n';
import { formatCustomFieldOptionsEditorValue } from '../app/languageAssetPageAccess';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';

export const CUSTOM_FIELD_TYPES: CustomFieldValueType[] = [
  'text',
  'number',
  'boolean',
  'select',
  'multiselect',
  'url',
];

export const CUSTOM_FIELD_TYPE_LABEL_KEY: Record<CustomFieldValueType, Parameters<typeof t>[1]> = {
  text: 'workspace.languageMetadata.customFieldTypeText',
  number: 'workspace.languageMetadata.customFieldTypeNumber',
  boolean: 'workspace.languageMetadata.customFieldTypeBoolean',
  select: 'workspace.languageMetadata.customFieldTypeSelect',
  multiselect: 'workspace.languageMetadata.customFieldTypeMultiselect',
  url: 'workspace.languageMetadata.customFieldTypeUrl',
};

export type DefinitionFormValue = {
  name: string;
  fieldType: CustomFieldValueType;
  required: boolean;
  optionsText: string;
  placeholder: string;
  helpText: string;
  minValue: string;
  maxValue: string;
  pattern: string;
  defaultValueText: string;
  defaultValueBoolean: boolean;
  defaultValueList: string[];
};

export function parseOptionalFiniteNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function setOptionalDefinitionField<K extends keyof CustomFieldDefinitionDocType>(
  definition: CustomFieldDefinitionDocType,
  key: K,
  value: CustomFieldDefinitionDocType[K] | undefined,
): CustomFieldDefinitionDocType {
  if (value === undefined) {
    const { [key]: _removed, ...rest } = definition;
    return rest as CustomFieldDefinitionDocType;
  }

  return {
    ...definition,
    [key]: value,
  } as CustomFieldDefinitionDocType;
}

export function setLocalizedOptionalText(
  map: Record<string, string> | undefined,
  locale: WorkspaceLocale,
  value: string,
): Record<string, string> | undefined {
  const trimmed = value.trim();
  const next = { ...(map ?? {}) };
  if (trimmed) {
    next[locale] = value;
  } else {
    delete next[locale];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildFormDefaultValues(
  definition: CustomFieldDefinitionDocType,
  locale: WorkspaceLocale,
): DefinitionFormValue {
  return {
    name: definition.name[locale] ?? '',
    fieldType: definition.fieldType,
    required: Boolean(definition.required),
    optionsText: formatCustomFieldOptionsEditorValue(definition.options),
    placeholder: definition.placeholder?.[locale] ?? '',
    helpText: definition.helpText?.[locale] ?? '',
    minValue: definition.minValue !== undefined ? String(definition.minValue) : '',
    maxValue: definition.maxValue !== undefined ? String(definition.maxValue) : '',
    pattern: definition.pattern ?? '',
    defaultValueText:
      typeof definition.defaultValue === 'string' || typeof definition.defaultValue === 'number'
        ? String(definition.defaultValue)
        : '',
    defaultValueBoolean: definition.defaultValue === true,
    defaultValueList: Array.isArray(definition.defaultValue) ? definition.defaultValue : [],
  };
}

export function buildDefaultValueForFieldType(
  definition: CustomFieldDefinitionDocType,
  formValue: DefinitionFormValue,
): CustomFieldDefinitionDocType['defaultValue'] | undefined {
  switch (definition.fieldType) {
    case 'boolean':
      return formValue.defaultValueBoolean;
    case 'multiselect':
      return formValue.defaultValueList.length > 0 ? formValue.defaultValueList : undefined;
    case 'select':
      return formValue.defaultValueText ? formValue.defaultValueText : undefined;
    case 'number':
      return parseOptionalFiniteNumber(formValue.defaultValueText);
    case 'text':
    case 'url':
      return formValue.defaultValueText.trim() ? formValue.defaultValueText : undefined;
  }
}
