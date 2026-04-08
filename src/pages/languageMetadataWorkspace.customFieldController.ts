/**
 * 语言元数据工作台 – 自定义字段控制器
 * Language metadata workspace – Custom field definitions controller
 *
 * 从 LanguageMetadataWorkspaceDetailColumn 抽出，以满足 architecture-guard 行数/回调上限。
 * Extracted from LanguageMetadataWorkspaceDetailColumn to meet architecture-guard ceilings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { t, tf } from '../i18n';
import {
  applyCustomFieldDraftDefaults,
  CUSTOM_FIELD_RENDERER_REGISTRY,
} from '../services/LanguageMetadataCustomFields';
import {
  deleteCustomFieldDefinition,
  listCustomFieldDefinitions,
  upsertCustomFieldDefinition,
} from '../services/LinguisticService.languageCatalog';
import type { CustomFieldDefinitionDocType, CustomFieldValueType } from '../db';
import type { LanguageMetadataDraft, LanguageMetadataDraftChangeHandler, WorkspaceLocale } from './languageMetadataWorkspace.shared';

// ─── 返回类型 | Return type ───
export type CustomFieldControllerState = ReturnType<typeof useLanguageMetadataCustomFieldController>;

function buildCustomFieldDefinitionUpsertPayload(definition: CustomFieldDefinitionDocType) {
  return {
    id: definition.id,
    name: definition.name,
    fieldType: definition.fieldType,
    ...(definition.options?.length ? { options: definition.options } : {}),
    ...(definition.description ? { description: definition.description } : {}),
    ...(definition.required ? { required: true } : {}),
    ...(definition.defaultValue !== undefined ? { defaultValue: definition.defaultValue } : {}),
    ...(definition.placeholder ? { placeholder: definition.placeholder } : {}),
    ...(definition.helpText ? { helpText: definition.helpText } : {}),
    ...(definition.minValue !== undefined ? { minValue: definition.minValue } : {}),
    ...(definition.maxValue !== undefined ? { maxValue: definition.maxValue } : {}),
    ...(definition.pattern ? { pattern: definition.pattern } : {}),
    sortOrder: definition.sortOrder,
  };
}

function normalizeFieldTypeChangeDefinition(
  definition: CustomFieldDefinitionDocType,
  nextFieldType: CustomFieldValueType,
  locale: WorkspaceLocale,
): CustomFieldDefinitionDocType {
  const descriptor = CUSTOM_FIELD_RENDERER_REGISTRY[nextFieldType];
  const fallbackOptionLabel = `${t(locale, 'workspace.languageMetadata.customFieldTypeSelect')} 1`;
  const normalizedOptions = (definition.options ?? [])
    .map((option) => option.trim())
    .filter(Boolean)
    .filter((option, index, list) => list.indexOf(option) === index);
  const options = descriptor.supportsOptions
    ? (normalizedOptions.length > 0 ? normalizedOptions : [fallbackOptionLabel])
    : undefined;

  const {
    options: _oldOptions,
    minValue: _oldMinValue,
    maxValue: _oldMaxValue,
    pattern: _oldPattern,
    defaultValue: oldDefaultValue,
    ...rest
  } = definition;

  const migratedDefaultValue = (() => {
    if (oldDefaultValue === undefined) {
      return undefined;
    }

    switch (nextFieldType) {
      case 'number': {
        const numeric = typeof oldDefaultValue === 'number' ? oldDefaultValue : Number(String(oldDefaultValue).trim());
        return Number.isFinite(numeric) ? numeric : undefined;
      }
      case 'boolean': {
        if (typeof oldDefaultValue === 'boolean') {
          return oldDefaultValue;
        }
        const normalized = String(oldDefaultValue).trim().toLowerCase();
        if (normalized === 'true') {
          return true;
        }
        if (normalized === 'false') {
          return false;
        }
        return undefined;
      }
      case 'select': {
        const candidate = Array.isArray(oldDefaultValue)
          ? oldDefaultValue[0]
          : String(oldDefaultValue).trim();
        return candidate && options?.includes(candidate) ? candidate : undefined;
      }
      case 'multiselect': {
        const candidates = Array.isArray(oldDefaultValue)
          ? oldDefaultValue
          : [String(oldDefaultValue).trim()];
        const filtered = candidates.filter((item) => item && Boolean(options?.includes(item)));
        return filtered.length > 0 ? filtered : undefined;
      }
      case 'url': {
        const candidate = String(oldDefaultValue).trim();
        if (!candidate) {
          return undefined;
        }
        try {
          new URL(candidate);
          return candidate;
        } catch {
          return undefined;
        }
      }
      case 'text':
        return String(oldDefaultValue).trim() || undefined;
    }
  })();

  return {
    ...rest,
    fieldType: nextFieldType,
    ...(options ? { options } : {}),
    ...(descriptor.supportsNumericRange && definition.minValue !== undefined ? { minValue: definition.minValue } : {}),
    ...(descriptor.supportsNumericRange && definition.maxValue !== undefined ? { maxValue: definition.maxValue } : {}),
    ...(descriptor.supportsPattern && definition.pattern?.trim() ? { pattern: definition.pattern.trim() } : {}),
    ...(migratedDefaultValue !== undefined ? { defaultValue: migratedDefaultValue } : {}),
  };
}

export function useLanguageMetadataCustomFieldController(
  locale: WorkspaceLocale,
  draft: LanguageMetadataDraft,
  onDraftChange: LanguageMetadataDraftChangeHandler,
) {
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDefinitionDocType[]>([]);
  const [showFieldManage, setShowFieldManage] = useState(false);
  const [editingDefs, setEditingDefs] = useState<Map<string, CustomFieldDefinitionDocType>>(new Map());
  const editingDefsRef = useRef(editingDefs);
  editingDefsRef.current = editingDefs;
  const fieldDefsRef = useRef(fieldDefs);
  fieldDefsRef.current = fieldDefs;
  const customFieldValuesRef = useRef(draft.customFieldValues);
  customFieldValuesRef.current = draft.customFieldValues;

  // 加载自定义字段定义 | Load custom field definitions
  useEffect(() => {
    listCustomFieldDefinitions().then(setFieldDefs).catch(() => {/* ignore */});
  }, []);

  useEffect(() => {
    const next = applyCustomFieldDraftDefaults(fieldDefs, customFieldValuesRef.current);
    const current = customFieldValuesRef.current;
    const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
    const changed = Array.from(keys).some((key) => current[key] !== next[key]);
    if (changed) {
      onDraftChange('customFieldValues', next);
    }
  }, [fieldDefs, onDraftChange]);

  const handleAddFieldDef = useCallback(async () => {
    const name = t(locale, 'workspace.languageMetadata.customFieldDefaultName');
    try {
      const saved = await upsertCustomFieldDefinition({
        name: { 'zh-CN': name, 'en-US': name },
        fieldType: 'text',
      });
      setFieldDefs((prev) => [...prev, saved]);
    } catch (err) {
      console.error(t(locale, 'workspace.languageMetadata.customFieldAddLogError'), err);
    }
  }, [locale]);

  const handleFieldDefLocalChange = (def: CustomFieldDefinitionDocType) => {
    setEditingDefs((prev) => new Map(prev).set(def.id, def));
    setFieldDefs((prev) => prev.map((d) => d.id === def.id ? def : d));
  };

  const handleFieldDefBlur = useCallback(async (defId: string) => {
    const buffered = editingDefsRef.current.get(defId);
    if (!buffered) return;
    try {
      const saved = await upsertCustomFieldDefinition(buildCustomFieldDefinitionUpsertPayload(buffered));
      setFieldDefs((prev) => prev.map((d) => d.id === saved.id ? saved : d));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(defId); return next; });
    } catch (err) {
      console.error(t(locale, 'workspace.languageMetadata.customFieldPersistLogError'), err);
    }
  }, [locale]);

  const handleFieldTypeChange = useCallback(async (def: CustomFieldDefinitionDocType, newType: CustomFieldValueType) => {
    const previous = def;
    const updated = normalizeFieldTypeChangeDefinition(def, newType, locale);
    setEditingDefs((prev) => new Map(prev).set(def.id, updated));
    setFieldDefs((prev) => prev.map((d) => d.id === def.id ? updated : d));
    try {
      const saved = await upsertCustomFieldDefinition(buildCustomFieldDefinitionUpsertPayload(updated));
      setFieldDefs((prev) => prev.map((d) => d.id === saved.id ? saved : d));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(def.id); return next; });
    } catch (err) {
      setFieldDefs((prev) => prev.map((d) => d.id === previous.id ? previous : d));
      setEditingDefs((prev) => new Map(prev).set(previous.id, previous));
      console.error(t(locale, 'workspace.languageMetadata.customFieldTypeLogError'), err);
    }
  }, [locale]);

  const handleDeleteFieldDef = useCallback(async (def: CustomFieldDefinitionDocType) => {
    const label = def.name[locale] || def.name['en-US'] || def.name['zh-CN'] || '';
    if (!window.confirm(tf(locale, 'workspace.languageMetadata.customFieldDeleteConfirm', { '0': label }))) return;
    try {
      await deleteCustomFieldDefinition(def.id);
      setFieldDefs((prev) => prev.filter((d) => d.id !== def.id));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(def.id); return next; });
      const next = { ...customFieldValuesRef.current };
      delete next[def.id];
      onDraftChange('customFieldValues', next);
    } catch (err) {
      console.error(t(locale, 'workspace.languageMetadata.customFieldDeleteLogError'), err);
    }
  }, [locale, onDraftChange]);

  const handleCustomFieldValueChange = useCallback((fieldId: string, value: string) => {
    onDraftChange('customFieldValues', { ...customFieldValuesRef.current, [fieldId]: value });
  }, [onDraftChange]);

  const handleMoveFieldDef = useCallback(async (fieldId: string, direction: -1 | 1) => {
    const currentList = fieldDefsRef.current;
    const index = currentList.findIndex((definition) => definition.id === fieldId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentList.length) {
      return;
    }

    const reordered = [...currentList];
    const [moved] = reordered.splice(index, 1);
    if (!moved) {
      return;
    }
    reordered.splice(targetIndex, 0, moved);
    const nextDefinitions = reordered.map((definition, nextIndex) => ({ ...definition, sortOrder: nextIndex }));
    setFieldDefs(nextDefinitions);

    try {
      await Promise.all(nextDefinitions.map((definition) => upsertCustomFieldDefinition({
        ...buildCustomFieldDefinitionUpsertPayload(definition),
      })));
    } catch (err) {
      console.error(t(locale, 'workspace.languageMetadata.customFieldReorderLogError'), err);
      void listCustomFieldDefinitions().then(setFieldDefs).catch(() => {/* ignore */});
    }
  }, [locale]);

  return {
    fieldDefs,
    showFieldManage,
    setShowFieldManage,
    handleAddFieldDef,
    handleFieldDefLocalChange,
    handleFieldDefBlur,
    handleFieldTypeChange,
    handleDeleteFieldDef,
    handleCustomFieldValueChange,
    handleMoveFieldDef,
  } as const;
}
