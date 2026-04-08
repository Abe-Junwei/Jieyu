import { t } from '../i18n';
import type { CustomFieldValueType } from '../db';
import {
  CUSTOM_FIELD_RENDERER_REGISTRY,
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldOptionsEditorValue,
  readLocalizedFieldText,
} from '../services/LanguageMetadataCustomFields';
import type { CustomFieldControllerState } from './languageMetadataWorkspace.customFieldController';
import type { LanguageMetadataDraft, WorkspaceLocale } from './languageMetadataWorkspace.shared';
import { LanguageMetadataWorkspaceCustomFieldValueField } from './LanguageMetadataWorkspaceCustomFieldValueField';

const CUSTOM_FIELD_TYPES: CustomFieldValueType[] = ['text', 'number', 'boolean', 'select', 'multiselect', 'url'];
const CUSTOM_FIELD_TYPE_LABEL_KEY: Record<CustomFieldValueType, Parameters<typeof t>[1]> = {
  text: 'workspace.languageMetadata.customFieldTypeText',
  number: 'workspace.languageMetadata.customFieldTypeNumber',
  boolean: 'workspace.languageMetadata.customFieldTypeBoolean',
  select: 'workspace.languageMetadata.customFieldTypeSelect',
  multiselect: 'workspace.languageMetadata.customFieldTypeMultiselect',
  url: 'workspace.languageMetadata.customFieldTypeUrl',
};
type LanguageMetadataWorkspaceCustomFieldsSectionProps = {
  locale: WorkspaceLocale;
  draft: LanguageMetadataDraft;
  cf: CustomFieldControllerState;
};

function parseOptionalFiniteNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function withOptionalDefinitionField<K extends keyof CustomFieldControllerState['fieldDefs'][number]>(
  definition: CustomFieldControllerState['fieldDefs'][number],
  key: K,
  value: CustomFieldControllerState['fieldDefs'][number][K] | undefined,
) {
  if (value === undefined) {
    const { [key]: _removed, ...rest } = definition;
    return rest as CustomFieldControllerState['fieldDefs'][number];
  }

  return {
    ...definition,
    [key]: value,
  } as CustomFieldControllerState['fieldDefs'][number];
}

export function LanguageMetadataWorkspaceCustomFieldsSection({ locale, draft, cf }: LanguageMetadataWorkspaceCustomFieldsSectionProps) {
  return (
    <section className="language-metadata-workspace-subsection">
      <div className="language-metadata-workspace-subsection-header">
        <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionCustomFields')}</h3>
        <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionCustomFieldsDescription')}</p>
        <div className="language-metadata-workspace-inline-actions">
          <button type="button" className="btn btn-ghost" onClick={cf.handleAddFieldDef}>{t(locale, 'workspace.languageMetadata.customFieldAdd')}</button>
          {cf.fieldDefs.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => cf.setShowFieldManage((prev) => !prev)}>
              {t(locale, 'workspace.languageMetadata.customFieldManage')}
            </button>
          )}
        </div>
      </div>

      {cf.fieldDefs.length === 0 ? (
        <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.customFieldEmpty')}</p>
      ) : (
        <div className="language-metadata-workspace-grid">
          {cf.fieldDefs.map((def, index) => (
            <div key={def.id} className="language-metadata-workspace-field language-metadata-workspace-field-block">
              {cf.showFieldManage ? (
                <div className="language-metadata-workspace-field-editor-card">
                  <div className="language-metadata-workspace-field-toolbar">
                    <strong>{readLocalizedFieldText(locale, def.name) || def.id}</strong>
                    <div className="language-metadata-workspace-field-toolbar-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => cf.handleMoveFieldDef(def.id, -1)} disabled={index === 0}>{t(locale, 'workspace.languageMetadata.customFieldMoveUp')}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => cf.handleMoveFieldDef(def.id, 1)} disabled={index === cf.fieldDefs.length - 1}>{t(locale, 'workspace.languageMetadata.customFieldMoveDown')}</button>
                    </div>
                  </div>
                  <div className="language-metadata-workspace-grid language-metadata-workspace-field-definition-grid">
                  <label className="language-metadata-workspace-inline-field">
                    <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldName')}</span>
                    <input
                      className="input"
                      value={def.name[locale] || ''}
                      onChange={(event) => cf.handleFieldDefLocalChange({ ...def, name: { ...def.name, [locale]: event.target.value } })}
                      onBlur={() => cf.handleFieldDefBlur(def.id)}
                    />
                  </label>
                  <label className="language-metadata-workspace-inline-field">
                    <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldType')}</span>
                    <select
                      className="input"
                      value={def.fieldType}
                      onChange={(event) => cf.handleFieldTypeChange(def, event.target.value as CustomFieldValueType)}
                    >
                      {CUSTOM_FIELD_TYPES.map((fieldType) => (
                        <option key={fieldType} value={fieldType}>{t(locale, CUSTOM_FIELD_TYPE_LABEL_KEY[fieldType])}</option>
                      ))}
                    </select>
                  </label>
                  <label className="language-metadata-workspace-inline-field">
                    <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldRequired')}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(def.required)}
                      onChange={(event) => cf.handleFieldDefLocalChange(withOptionalDefinitionField(def, 'required', event.target.checked ? true : undefined))}
                      onBlur={() => cf.handleFieldDefBlur(def.id)}
                    />
                  </label>
                  {(def.fieldType === 'select' || def.fieldType === 'multiselect') && (
                    <label className="language-metadata-workspace-inline-field language-metadata-workspace-inline-field-top">
                      <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldOptions')}</span>
                      <textarea
                        className="input language-metadata-workspace-textarea"
                        rows={3}
                        value={formatCustomFieldOptionsEditorValue(def.options)}
                        placeholder={t(locale, 'workspace.languageMetadata.customFieldOptionsPlaceholder')}
                        onChange={(event) => cf.handleFieldDefLocalChange({ ...def, options: parseCustomFieldOptionsEditorValue(event.target.value) })}
                        onBlur={() => cf.handleFieldDefBlur(def.id)}
                      />
                    </label>
                  )}
                  <label className="language-metadata-workspace-inline-field">
                    <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldPlaceholder')}</span>
                    <input
                      className="input"
                      value={def.placeholder?.[locale] ?? ''}
                      onChange={(event) => cf.handleFieldDefLocalChange({ ...def, placeholder: { ...def.placeholder, [locale]: event.target.value } })}
                      onBlur={() => cf.handleFieldDefBlur(def.id)}
                    />
                  </label>
                  <label className="language-metadata-workspace-inline-field">
                    <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldHelpText')}</span>
                    <input
                      className="input"
                      value={def.helpText?.[locale] ?? ''}
                      onChange={(event) => cf.handleFieldDefLocalChange({ ...def, helpText: { ...def.helpText, [locale]: event.target.value } })}
                      onBlur={() => cf.handleFieldDefBlur(def.id)}
                    />
                  </label>
                  {CUSTOM_FIELD_RENDERER_REGISTRY[def.fieldType].supportsNumericRange && (
                    <>
                      <label className="language-metadata-workspace-inline-field">
                        <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldMinValue')}</span>
                        <input
                          className="input"
                          type="number"
                          value={def.minValue ?? ''}
                          onChange={(event) => cf.handleFieldDefLocalChange(withOptionalDefinitionField(def, 'minValue', parseOptionalFiniteNumber(event.target.value)))}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        />
                      </label>
                      <label className="language-metadata-workspace-inline-field">
                        <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldMaxValue')}</span>
                        <input
                          className="input"
                          type="number"
                          value={def.maxValue ?? ''}
                          onChange={(event) => cf.handleFieldDefLocalChange(withOptionalDefinitionField(def, 'maxValue', parseOptionalFiniteNumber(event.target.value)))}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        />
                      </label>
                    </>
                  )}
                  {CUSTOM_FIELD_RENDERER_REGISTRY[def.fieldType].supportsPattern && (
                    <label className="language-metadata-workspace-field-block language-metadata-workspace-inline-field">
                      <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldPattern')}</span>
                      <input
                        className="input"
                        value={def.pattern ?? ''}
                        onChange={(event) => cf.handleFieldDefLocalChange(withOptionalDefinitionField(def, 'pattern', event.target.value.trim() ? event.target.value : undefined))}
                        onBlur={() => cf.handleFieldDefBlur(def.id)}
                      />
                    </label>
                  )}
                  {CUSTOM_FIELD_RENDERER_REGISTRY[def.fieldType].supportsDefaultValue && (
                    <label className="language-metadata-workspace-field-block language-metadata-workspace-inline-field language-metadata-workspace-inline-field-top">
                      <span className="language-metadata-workspace-inline-field-label">{t(locale, 'workspace.languageMetadata.customFieldDefaultValue')}</span>
                      {def.fieldType === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={def.defaultValue === true}
                          onChange={(event) => cf.handleFieldDefLocalChange({ ...def, defaultValue: event.target.checked })}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        />
                      ) : def.fieldType === 'select' ? (
                        <select
                          className="input"
                          value={typeof def.defaultValue === 'string' ? def.defaultValue : ''}
                          onChange={(event) => cf.handleFieldDefLocalChange(withOptionalDefinitionField(def, 'defaultValue', event.target.value ? event.target.value : undefined))}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        >
                          <option value="" />
                          {(def.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : def.fieldType === 'multiselect' ? (
                        <select
                          className="input"
                          multiple
                          value={Array.isArray(def.defaultValue) ? def.defaultValue : []}
                          onChange={(event) => cf.handleFieldDefLocalChange({ ...def, defaultValue: Array.from(event.target.selectedOptions, (option) => option.value) })}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        >
                          {(def.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          className="input"
                          type={def.fieldType === 'number' ? 'number' : def.fieldType === 'url' ? 'url' : 'text'}
                          value={typeof def.defaultValue === 'string' || typeof def.defaultValue === 'number' ? String(def.defaultValue) : ''}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            cf.handleFieldDefLocalChange(withOptionalDefinitionField(
                              def,
                              'defaultValue',
                              nextValue.trim()
                                ? (def.fieldType === 'number' ? parseOptionalFiniteNumber(nextValue) : nextValue)
                                : undefined,
                            ));
                          }}
                          onBlur={() => cf.handleFieldDefBlur(def.id)}
                        />
                      )}
                    </label>
                  )}
                  </div>
                  <button type="button" className="btn btn-danger" onClick={() => cf.handleDeleteFieldDef(def)}>
                    {t(locale, 'workspace.languageMetadata.customFieldDelete')}
                  </button>
                </div>
              ) : (
                <LanguageMetadataWorkspaceCustomFieldValueField
                  locale={locale}
                  definition={def}
                  draftValue={draft.customFieldValues[def.id] ?? ''}
                  onValueChange={(value) => cf.handleCustomFieldValueChange(def.id, value)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
