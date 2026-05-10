import {
  getDb,
  withTransaction,
  dexieStoresForCustomFieldDefinitionDeleteCascadeRw,
  type CustomFieldDefinitionDocType,
  type CustomFieldValueType,
  type LanguageDocType,
  type MultiLangString,
} from '../db';
import { newId } from '../utils/transcriptionFormatters';
import { validateCustomFieldDefinitionInput } from './LanguageMetadataCustomFields';
import { createLogger } from '../observability/logger';
import { refreshLanguageCatalogReadModelAfterMutation } from './LinguisticService.languageCatalog.refreshBridge';

const log = createLogger('LinguisticService.languageCatalog.customFieldAdmin');

export async function listCustomFieldDefinitions(): Promise<CustomFieldDefinitionDocType[]> {
  const db = await getDb();
  const all = await db.dexie.custom_field_definitions.toArray();
  return all.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function upsertCustomFieldDefinition(input: {
  id?: string;
  name: MultiLangString;
  fieldType: CustomFieldValueType;
  options?: string[];
  description?: MultiLangString;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  placeholder?: MultiLangString;
  helpText?: MultiLangString;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  sortOrder?: number;
}): Promise<CustomFieldDefinitionDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = input.id ? await db.dexie.custom_field_definitions.get(input.id) : undefined;
  const normalized = validateCustomFieldDefinitionInput(input);
  const maxSort = existing
    ? existing.sortOrder
    : (await db.dexie.custom_field_definitions.toArray()).reduce(
        (max, d) => Math.max(max, d.sortOrder),
        -1,
      ) + 1;

  const doc: CustomFieldDefinitionDocType = {
    id: normalized.id ?? newId('cfd'),
    name: normalized.name,
    fieldType: normalized.fieldType,
    ...(normalized.options?.length ? { options: normalized.options } : {}),
    ...(normalized.description ? { description: normalized.description } : {}),
    ...(normalized.required ? { required: true } : {}),
    ...(normalized.defaultValue !== undefined ? { defaultValue: normalized.defaultValue } : {}),
    ...(normalized.placeholder ? { placeholder: normalized.placeholder } : {}),
    ...(normalized.helpText ? { helpText: normalized.helpText } : {}),
    ...(normalized.minValue !== undefined ? { minValue: normalized.minValue } : {}),
    ...(normalized.maxValue !== undefined ? { maxValue: normalized.maxValue } : {}),
    ...(normalized.pattern ? { pattern: normalized.pattern } : {}),
    sortOrder: normalized.sortOrder ?? maxSort,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.dexie.custom_field_definitions.put(doc);
  return doc;
}

export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  const db = await getDb();
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForCustomFieldDefinitionDeleteCascadeRw(db)],
    async () => {
      await db.dexie.custom_field_definitions.delete(id);

      const languages = await db.dexie.languages.toArray();
      const updates = languages.flatMap((language) => {
        const customFields = language.customFields;
        if (!customFields || !(id in customFields)) {
          return [];
        }

        const { [id]: _removed, ...restCustomFields } = customFields;
        const { customFields: _currentCustomFields, ...restLanguage } = language;
        return [
          {
            ...restLanguage,
            ...(Object.keys(restCustomFields).length > 0 ? { customFields: restCustomFields } : {}),
            updatedAt: new Date().toISOString(),
          } satisfies LanguageDocType,
        ];
      });

      if (updates.length > 0) {
        await db.dexie.languages.bulkPut(updates);
      }
    },
    { label: 'LinguisticService.languageCatalog.deleteCustomFieldDefinition' },
  );

  await refreshLanguageCatalogReadModelAfterMutation().catch((refreshError) => {
    log.error(
      'failed to refresh language catalog read model after custom field definition delete',
      { err: refreshError },
    );
  });
}
