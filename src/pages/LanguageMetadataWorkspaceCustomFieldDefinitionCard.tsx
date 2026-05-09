import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { CustomFieldDefinitionDocType, CustomFieldValueType } from '../types/jieyuDbDocTypes';
import { t, tf } from '../i18n';
import {
  CUSTOM_FIELD_RENDERER_REGISTRY,
  parseCustomFieldOptionsEditorValue,
  readLocalizedFieldText,
} from '../app/languageAssetPageAccess';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABEL_KEY,
  buildDefaultValueForFieldType,
  buildFormDefaultValues,
  parseOptionalFiniteNumber,
  setLocalizedOptionalText,
  setOptionalDefinitionField,
  type DefinitionFormValue,
} from './languageMetadataCustomFieldHelpers';

type LanguageMetadataWorkspaceCustomFieldDefinitionCardProps = {
  locale: WorkspaceLocale;
  definition: CustomFieldDefinitionDocType;
  index: number;
  total: number;
  onLocalChange: (definition: CustomFieldDefinitionDocType) => void;
  onPersist: (definitionId: string) => void;
  onTypeChange: (definition: CustomFieldDefinitionDocType, fieldType: CustomFieldValueType) => void;
  onMove: (fieldId: string, direction: -1 | 1) => void;
  onDelete: (definition: CustomFieldDefinitionDocType) => void;
};

export function LanguageMetadataWorkspaceCustomFieldDefinitionCard({
  locale,
  definition,
  index,
  total,
  onLocalChange,
  onPersist,
  onTypeChange,
  onMove,
  onDelete,
}: LanguageMetadataWorkspaceCustomFieldDefinitionCardProps) {
  const descriptor = CUSTOM_FIELD_RENDERER_REGISTRY[definition.fieldType];
  const { control, getValues, reset } = useForm<DefinitionFormValue>({
    mode: 'onChange',
    defaultValues: buildFormDefaultValues(definition, locale),
  });

  useEffect(() => {
    reset(buildFormDefaultValues(definition, locale));
  }, [definition, locale, reset]);

  const nameLabel = t(locale, 'workspace.languageMetadata.customFieldName');
  const optionsLabel = t(locale, 'workspace.languageMetadata.customFieldOptions');
  const minLabel = t(locale, 'workspace.languageMetadata.customFieldMinValue');
  const maxLabel = t(locale, 'workspace.languageMetadata.customFieldMaxValue');
  const patternLabel = t(locale, 'workspace.languageMetadata.customFieldPattern');
  const defaultLabel = t(locale, 'workspace.languageMetadata.customFieldDefaultValue');

  return (
    <div className="lm-field-editor-card">
      <div className="lm-field-toolbar">
        <strong>{readLocalizedFieldText(locale, definition.name) || definition.id}</strong>
        <div className="lm-field-toolbar-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onMove(definition.id, -1)}
            disabled={index === 0}
          >
            {t(locale, 'workspace.languageMetadata.customFieldMoveUp')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onMove(definition.id, 1)}
            disabled={index === total - 1}
          >
            {t(locale, 'workspace.languageMetadata.customFieldMoveDown')}
          </button>
        </div>
      </div>
      <div className="lm-grid lm-field-definition-grid">
        <Controller
          name="name"
          control={control}
          rules={{
            validate: (value) =>
              value.trim()
                ? true
                : tf(locale, 'workspace.languageMetadata.customFieldErrorRequired', {
                    field: nameLabel,
                  }),
          }}
          render={({ field, fieldState }) => (
            <label className="lm-inline-field">
              <span className="lm-inline-field-label">{nameLabel}</span>
              <input
                className="input"
                value={field.value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  field.onChange(nextValue);
                  onLocalChange({
                    ...definition,
                    name: {
                      ...definition.name,
                      [locale]: nextValue,
                    },
                  });
                }}
                onBlur={() => {
                  field.onBlur();
                  onPersist(definition.id);
                }}
              />
              {fieldState.error?.message ? (
                <span className="lm-field-error">{fieldState.error.message}</span>
              ) : null}
            </label>
          )}
        />

        <Controller
          name="fieldType"
          control={control}
          render={({ field }) => (
            <label className="lm-inline-field">
              <span className="lm-inline-field-label">
                {t(locale, 'workspace.languageMetadata.customFieldType')}
              </span>
              <select
                className="input"
                value={field.value}
                onChange={(event) => {
                  const nextType = event.target.value as CustomFieldValueType;
                  field.onChange(nextType);
                  onTypeChange(definition, nextType);
                }}
                onBlur={field.onBlur}
              >
                {CUSTOM_FIELD_TYPES.map((fieldType) => (
                  <option key={fieldType} value={fieldType}>
                    {t(locale, CUSTOM_FIELD_TYPE_LABEL_KEY[fieldType])}
                  </option>
                ))}
              </select>
            </label>
          )}
        />

        <Controller
          name="required"
          control={control}
          render={({ field }) => (
            <label className="lm-inline-field">
              <span className="lm-inline-field-label">
                {t(locale, 'workspace.languageMetadata.customFieldRequired')}
              </span>
              <input
                type="checkbox"
                checked={field.value}
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  field.onChange(nextValue);
                  onLocalChange(
                    setOptionalDefinitionField(
                      definition,
                      'required',
                      nextValue ? true : undefined,
                    ),
                  );
                }}
                onBlur={() => {
                  field.onBlur();
                  onPersist(definition.id);
                }}
              />
            </label>
          )}
        />

        {definition.fieldType === 'select' || definition.fieldType === 'multiselect' ? (
          <Controller
            name="optionsText"
            control={control}
            rules={{
              validate: (value) => {
                const options = parseCustomFieldOptionsEditorValue(value);
                return options.length > 0
                  ? true
                  : tf(locale, 'workspace.languageMetadata.customFieldErrorOption', {
                      field: optionsLabel,
                    });
              },
            }}
            render={({ field, fieldState }) => (
              <label className="lm-inline-field lm-inline-field-top">
                <span className="lm-inline-field-label">{optionsLabel}</span>
                <textarea
                  className="input lm-textarea"
                  rows={3}
                  value={field.value}
                  placeholder={t(
                    locale,
                    'workspace.languageMetadata.customFieldOptionsPlaceholder',
                  )}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    field.onChange(nextValue);
                    onLocalChange({
                      ...definition,
                      options: parseCustomFieldOptionsEditorValue(nextValue),
                    });
                  }}
                  onBlur={() => {
                    field.onBlur();
                    onPersist(definition.id);
                  }}
                />
                {fieldState.error?.message ? (
                  <span className="lm-field-error">{fieldState.error.message}</span>
                ) : null}
              </label>
            )}
          />
        ) : null}

        <Controller
          name="placeholder"
          control={control}
          render={({ field }) => (
            <label className="lm-inline-field">
              <span className="lm-inline-field-label">
                {t(locale, 'workspace.languageMetadata.customFieldPlaceholder')}
              </span>
              <input
                className="input"
                value={field.value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  field.onChange(nextValue);
                  onLocalChange(
                    setOptionalDefinitionField(
                      definition,
                      'placeholder',
                      setLocalizedOptionalText(definition.placeholder, locale, nextValue),
                    ),
                  );
                }}
                onBlur={() => {
                  field.onBlur();
                  onPersist(definition.id);
                }}
              />
            </label>
          )}
        />

        <Controller
          name="helpText"
          control={control}
          render={({ field }) => (
            <label className="lm-inline-field">
              <span className="lm-inline-field-label">
                {t(locale, 'workspace.languageMetadata.customFieldHelpText')}
              </span>
              <input
                className="input"
                value={field.value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  field.onChange(nextValue);
                  onLocalChange(
                    setOptionalDefinitionField(
                      definition,
                      'helpText',
                      setLocalizedOptionalText(definition.helpText, locale, nextValue),
                    ),
                  );
                }}
                onBlur={() => {
                  field.onBlur();
                  onPersist(definition.id);
                }}
              />
            </label>
          )}
        />

        {descriptor.supportsNumericRange ? (
          <>
            <Controller
              name="minValue"
              control={control}
              rules={{
                validate: (value) => {
                  if (!value.trim()) {
                    return true;
                  }
                  const parsed = Number(value);
                  if (!Number.isFinite(parsed)) {
                    return tf(locale, 'workspace.languageMetadata.customFieldErrorNumber', {
                      field: minLabel,
                    });
                  }
                  const maxValue = parseOptionalFiniteNumber(getValues('maxValue'));
                  if (maxValue !== undefined && parsed > maxValue) {
                    return tf(locale, 'workspace.languageMetadata.customFieldErrorMax', {
                      field: minLabel,
                      max: String(maxValue),
                    });
                  }
                  return true;
                },
              }}
              render={({ field, fieldState }) => (
                <label className="lm-inline-field">
                  <span className="lm-inline-field-label">{minLabel}</span>
                  <input
                    className="input"
                    type="number"
                    value={field.value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      field.onChange(nextValue);
                      onLocalChange(
                        setOptionalDefinitionField(
                          definition,
                          'minValue',
                          parseOptionalFiniteNumber(nextValue),
                        ),
                      );
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  />
                  {fieldState.error?.message ? (
                    <span className="lm-field-error">{fieldState.error.message}</span>
                  ) : null}
                </label>
              )}
            />

            <Controller
              name="maxValue"
              control={control}
              rules={{
                validate: (value) => {
                  if (!value.trim()) {
                    return true;
                  }
                  const parsed = Number(value);
                  if (!Number.isFinite(parsed)) {
                    return tf(locale, 'workspace.languageMetadata.customFieldErrorNumber', {
                      field: maxLabel,
                    });
                  }
                  const minValue = parseOptionalFiniteNumber(getValues('minValue'));
                  if (minValue !== undefined && parsed < minValue) {
                    return tf(locale, 'workspace.languageMetadata.customFieldErrorMin', {
                      field: maxLabel,
                      min: String(minValue),
                    });
                  }
                  return true;
                },
              }}
              render={({ field, fieldState }) => (
                <label className="lm-inline-field">
                  <span className="lm-inline-field-label">{maxLabel}</span>
                  <input
                    className="input"
                    type="number"
                    value={field.value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      field.onChange(nextValue);
                      onLocalChange(
                        setOptionalDefinitionField(
                          definition,
                          'maxValue',
                          parseOptionalFiniteNumber(nextValue),
                        ),
                      );
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  />
                  {fieldState.error?.message ? (
                    <span className="lm-field-error">{fieldState.error.message}</span>
                  ) : null}
                </label>
              )}
            />
          </>
        ) : null}

        {descriptor.supportsPattern ? (
          <Controller
            name="pattern"
            control={control}
            rules={{
              validate: (value) => {
                const trimmed = value.trim();
                if (!trimmed) {
                  return true;
                }
                try {
                  new RegExp(trimmed);
                  return true;
                } catch {
                  return tf(locale, 'workspace.languageMetadata.customFieldErrorPattern', {
                    field: patternLabel,
                  });
                }
              },
            }}
            render={({ field, fieldState }) => (
              <label className="lm-field-block lm-inline-field">
                <span className="lm-inline-field-label">{patternLabel}</span>
                <input
                  className="input"
                  value={field.value}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    field.onChange(nextValue);
                    onLocalChange(
                      setOptionalDefinitionField(
                        definition,
                        'pattern',
                        nextValue.trim() ? nextValue : undefined,
                      ),
                    );
                  }}
                  onBlur={() => {
                    field.onBlur();
                    onPersist(definition.id);
                  }}
                />
                {fieldState.error?.message ? (
                  <span className="lm-field-error">{fieldState.error.message}</span>
                ) : null}
              </label>
            )}
          />
        ) : null}

        {descriptor.supportsDefaultValue ? (
          <Controller
            name={
              definition.fieldType === 'boolean'
                ? 'defaultValueBoolean'
                : definition.fieldType === 'multiselect'
                  ? 'defaultValueList'
                  : 'defaultValueText'
            }
            control={control}
            rules={
              definition.fieldType === 'multiselect'
                ? {
                    validate: (value) => {
                      if (!Array.isArray(value) || value.length === 0) {
                        return true;
                      }
                      const options = definition.options ?? [];
                      return value.every((option) => options.includes(option))
                        ? true
                        : tf(locale, 'workspace.languageMetadata.customFieldErrorOption', {
                            field: defaultLabel,
                          });
                    },
                  }
                : {
                    validate: (value) => {
                      if (Array.isArray(value) || typeof value === 'boolean') {
                        return true;
                      }
                      if (!value.trim()) {
                        return true;
                      }

                      if (definition.fieldType === 'number') {
                        const parsed = Number(value);
                        if (!Number.isFinite(parsed)) {
                          return tf(locale, 'workspace.languageMetadata.customFieldErrorNumber', {
                            field: defaultLabel,
                          });
                        }
                        const minValue = parseOptionalFiniteNumber(getValues('minValue'));
                        if (minValue !== undefined && parsed < minValue) {
                          return tf(locale, 'workspace.languageMetadata.customFieldErrorMin', {
                            field: defaultLabel,
                            min: String(minValue),
                          });
                        }
                        const maxValue = parseOptionalFiniteNumber(getValues('maxValue'));
                        if (maxValue !== undefined && parsed > maxValue) {
                          return tf(locale, 'workspace.languageMetadata.customFieldErrorMax', {
                            field: defaultLabel,
                            max: String(maxValue),
                          });
                        }
                      }

                      if (definition.fieldType === 'url') {
                        try {
                          new URL(value);
                        } catch {
                          return tf(locale, 'workspace.languageMetadata.customFieldErrorUrl', {
                            field: defaultLabel,
                          });
                        }
                      }

                      if (definition.fieldType === 'select') {
                        const options = definition.options ?? [];
                        if (!options.includes(value)) {
                          return tf(locale, 'workspace.languageMetadata.customFieldErrorOption', {
                            field: defaultLabel,
                          });
                        }
                      }

                      return true;
                    },
                  }
            }
            render={({ field, fieldState }) => (
              <label className="lm-field-block lm-inline-field lm-inline-field-top">
                <span className="lm-inline-field-label">{defaultLabel}</span>
                {definition.fieldType === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onChange={(event) => {
                      const nextValue = event.target.checked;
                      field.onChange(nextValue);
                      onLocalChange({ ...definition, defaultValue: nextValue });
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  />
                ) : definition.fieldType === 'select' ? (
                  <select
                    className="input"
                    value={String(field.value ?? '')}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      field.onChange(nextValue);
                      onLocalChange(
                        setOptionalDefinitionField(
                          definition,
                          'defaultValue',
                          nextValue || undefined,
                        ),
                      );
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  >
                    <option value="" />
                    {(definition.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : definition.fieldType === 'multiselect' ? (
                  <select
                    className="input"
                    multiple
                    value={Array.isArray(field.value) ? field.value : []}
                    onChange={(event) => {
                      const nextValue = Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      );
                      field.onChange(nextValue);
                      onLocalChange(
                        setOptionalDefinitionField(
                          definition,
                          'defaultValue',
                          nextValue.length > 0 ? nextValue : undefined,
                        ),
                      );
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  >
                    {(definition.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={
                      definition.fieldType === 'number'
                        ? 'number'
                        : definition.fieldType === 'url'
                          ? 'url'
                          : 'text'
                    }
                    value={String(field.value ?? '')}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      field.onChange(nextValue);
                      onLocalChange(
                        setOptionalDefinitionField(
                          definition,
                          'defaultValue',
                          buildDefaultValueForFieldType(definition, {
                            ...getValues(),
                            defaultValueText: nextValue,
                          }),
                        ),
                      );
                    }}
                    onBlur={() => {
                      field.onBlur();
                      onPersist(definition.id);
                    }}
                  />
                )}
                {fieldState.error?.message ? (
                  <span className="lm-field-error">{fieldState.error.message}</span>
                ) : null}
              </label>
            )}
          />
        ) : null}
      </div>
      <button type="button" className="btn btn-danger" onClick={() => onDelete(definition)}>
        {t(locale, 'workspace.languageMetadata.customFieldDelete')}
      </button>
    </div>
  );
}
