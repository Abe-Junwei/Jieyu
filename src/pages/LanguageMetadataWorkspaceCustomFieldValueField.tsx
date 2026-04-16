import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { CustomFieldDefinitionDocType } from '../db';
import { CUSTOM_FIELD_RENDERER_REGISTRY, parseCustomFieldDraftMultiselectValue, readLocalizedFieldText, serializeCustomFieldDraftValue, validateCustomFieldDraftValue } from '../services/LanguageMetadataCustomFields';
import { t } from '../i18n';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';

type CustomFieldValueForm = {
  value: string | boolean | string[];
};

type LanguageMetadataWorkspaceCustomFieldValueFieldProps = {
  locale: WorkspaceLocale;
  definition: CustomFieldDefinitionDocType;
  draftValue: string;
  onValueChange: (value: string) => void;
};

function readFormValue(definition: CustomFieldDefinitionDocType, draftValue: string): string | boolean | string[] {
  switch (definition.fieldType) {
    case 'boolean':
      return draftValue === 'true';
    case 'multiselect':
      return parseCustomFieldDraftMultiselectValue(draftValue);
    default:
      return draftValue;
  }
}

export function LanguageMetadataWorkspaceCustomFieldValueField({ locale, definition, draftValue, onValueChange }: LanguageMetadataWorkspaceCustomFieldValueFieldProps) {
  const descriptor = CUSTOM_FIELD_RENDERER_REGISTRY[definition.fieldType];
  const localizedLabel = readLocalizedFieldText(locale, definition.name) || definition.id;
  const placeholder = readLocalizedFieldText(locale, definition.placeholder);
  const helpText = readLocalizedFieldText(locale, definition.helpText);
  const { control, reset } = useForm<CustomFieldValueForm>({
    mode: 'onChange',
    defaultValues: { value: readFormValue(definition, draftValue) },
  });

  useEffect(() => {
    reset({ value: readFormValue(definition, draftValue) });
  }, [definition, draftValue, reset]);

  return (
    <label className="lm-field lm-field-block">
      <span className="lm-field-label-row">
        <span>{localizedLabel}</span>
        {definition.required ? <strong className="lm-field-required">*</strong> : null}
      </span>
      <Controller
        name="value"
        control={control}
        rules={{
          validate: (value) => validateCustomFieldDraftValue(definition, value, locale) ?? true,
        }}
        render={({ field, fieldState }) => (
          <>
            {definition.fieldType === 'boolean' ? (
              <label className="lm-checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(event) => {
                    field.onChange(event.target.checked);
                    onValueChange(String(event.target.checked));
                  }}
                />
                <span>{t(locale, 'workspace.languageMetadata.customFieldBooleanEnabled')}</span>
              </label>
            ) : definition.fieldType === 'select' ? (
              <select
                className="input"
                value={String(field.value ?? '')}
                onChange={(event) => {
                  field.onChange(event.target.value);
                  onValueChange(event.target.value);
                }}
              >
                <option value="" />
                {(definition.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : definition.fieldType === 'multiselect' ? (
              <select
                className="input"
                multiple
                value={Array.isArray(field.value) ? field.value : []}
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions, (option) => option.value);
                  field.onChange(selected);
                  onValueChange(serializeCustomFieldDraftValue(selected));
                }}
              >
                {(definition.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                className="input"
                type={descriptor.htmlInputType}
                value={String(field.value ?? '')}
                placeholder={placeholder}
                {...(definition.fieldType === 'number' && definition.minValue !== undefined ? { min: definition.minValue } : {})}
                {...(definition.fieldType === 'number' && definition.maxValue !== undefined ? { max: definition.maxValue } : {})}
                onChange={(event) => {
                  field.onChange(event.target.value);
                  onValueChange(event.target.value);
                }}
              />
            )}
            {helpText ? <span className="lm-field-helper">{helpText}</span> : null}
            {fieldState.error?.message ? <span className="lm-field-error">{fieldState.error.message}</span> : null}
          </>
        )}
      />
    </label>
  );
}