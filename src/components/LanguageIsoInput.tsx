import { useId, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import {
  formatLanguageCatalogMatch,
  resolveLanguageCodeInput,
  searchLanguageCatalog,
  type LanguageSearchLocale,
} from '../utils/langMapping';

export type LanguageIsoInputValue = {
  languageName: string;
  languageCode: string;
  localeTag?: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
};

type LanguageIsoInputProps = {
  locale: LanguageSearchLocale;
  value: LanguageIsoInputValue;
  onChange: (value: LanguageIsoInputValue) => void;
  nameLabel: string;
  codeLabel: string;
  namePlaceholder: string;
  codePlaceholder: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
};

function pickAutoFillMatch(query: string, locale: LanguageSearchLocale, maxResults = 5) {
  const matches = searchLanguageCatalog(query, locale, maxResults);
  const exactMatch = matches.find((match) => match.matchSource === 'alias-exact' || match.matchSource === 'name-exact');
  if (exactMatch) return exactMatch;
  if (matches.length === 1 && matches[0]?.matchSource === 'prefix') {
    return matches[0];
  }
  return undefined;
}

function clearDetectedLanguageTags(value: LanguageIsoInputValue): LanguageIsoInputValue {
  const next = { ...value };
  delete next.localeTag;
  delete next.scriptTag;
  delete next.regionTag;
  delete next.variantTag;
  return next;
}

export function LanguageIsoInput({
  locale,
  value,
  onChange,
  nameLabel,
  codeLabel,
  namePlaceholder,
  codePlaceholder,
  required = false,
  disabled = false,
  error = '',
  className = '',
}: LanguageIsoInputProps) {
  const fieldIdPrefix = useId();
  const trimmedLanguageName = value.languageName.trim();
  const nameMatches = useMemo(
    () => searchLanguageCatalog(trimmedLanguageName, locale, 5),
    [locale, trimmedLanguageName],
  );
  const resolvedCode = useMemo(
    () => resolveLanguageCodeInput(value.languageCode, locale),
    [locale, value.languageCode],
  );
  const suggestionMatches = trimmedLanguageName.length > 0 ? nameMatches : [];
  const ambiguityHint = suggestionMatches.length > 1 && !pickAutoFillMatch(trimmedLanguageName, locale)
    ? (locale === 'zh-CN' ? '\u5b58\u5728\u591a\u4e2a\u53ef\u80fd\u8bed\u8a00\uff0c\u8bf7\u9009\u62e9\u66f4\u5177\u4f53\u9879\u3002' : 'Multiple languages matched. Please choose a more specific option.')
    : '';
  const codeError = value.languageCode.trim().length > 0 && resolvedCode.status === 'invalid'
    ? (locale === 'zh-CN' ? '\u8bf7\u8f93\u5165\u6709\u6548\u7684 ISO 639 / BCP 47 \u8bed\u8a00\u4ee3\u7801\u3002' : 'Enter a valid ISO 639 / BCP 47 language code.')
    : '';
  const warnings = [
    ...resolvedCode.warnings,
    ...(suggestionMatches[0]?.warnings ?? []),
  ].filter((item, index, all) => item && all.indexOf(item) === index);

  const applyMatch = (matchIndex: number) => {
    const match = suggestionMatches[matchIndex];
    if (!match) return;
    onChange({
      ...clearDetectedLanguageTags(value),
      languageName: locale === 'zh-CN' ? (match.entry.displayNameZh ?? match.entry.name) : match.entry.name,
      languageCode: match.entry.iso6393,
    });
  };

  const handleLanguageNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextLanguageName = event.target.value;
    const nextMatch = pickAutoFillMatch(nextLanguageName, locale);
    if (!nextMatch) {
      onChange({
        ...value,
        languageName: nextLanguageName,
      });
      return;
    }
    onChange({
      ...clearDetectedLanguageTags(value),
      languageName: nextLanguageName,
      languageCode: nextMatch.entry.iso6393,
    });
  };

  const handleLanguageCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawInput = event.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 24).toLowerCase();
    const resolved = resolveLanguageCodeInput(rawInput, locale);
    if (resolved.status !== 'resolved') {
      const baseValue = rawInput ? value : clearDetectedLanguageTags(value);
      onChange({
        ...baseValue,
        languageCode: rawInput,
      });
      return;
    }

    const clearedValue = clearDetectedLanguageTags(value);
    onChange({
      ...clearedValue,
      languageName: resolved.languageName ?? value.languageName,
      languageCode: resolved.languageId ?? rawInput,
      ...(resolved.localeTag ? { localeTag: resolved.localeTag } : {}),
      ...(resolved.scriptTag ? { scriptTag: resolved.scriptTag } : {}),
      ...(resolved.regionTag ? { regionTag: resolved.regionTag } : {}),
      ...(resolved.variantTag ? { variantTag: resolved.variantTag } : {}),
    });
  };

  return (
    <div className={`language-iso-input ${className}`.trim()}>
      <div className="language-iso-input-grid">
        <label className="dialog-field">
          <span>{nameLabel}{required ? ' *' : ''}</span>
          <input
            id={`${fieldIdPrefix}-language-name`}
            className="input panel-input"
            type="text"
            value={value.languageName}
            onChange={handleLanguageNameChange}
            placeholder={namePlaceholder}
            autoComplete="off"
            disabled={disabled}
          />
        </label>
        <label className="dialog-field">
          <span>{codeLabel}{required ? ' *' : ''}</span>
          <input
            id={`${fieldIdPrefix}-language-code`}
            className="input panel-input"
            type="text"
            value={value.languageCode}
            onChange={handleLanguageCodeChange}
            placeholder={codePlaceholder}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
        </label>
      </div>

      {suggestionMatches.length > 0 && (
        <div className="language-iso-input-suggestions" role="listbox" aria-label={nameLabel}>
          {suggestionMatches.slice(0, 4).map((match, index) => (
            <button
              key={`${match.entry.iso6393}-${index}`}
              type="button"
              className="language-iso-input-suggestion"
              onClick={() => applyMatch(index)}
              disabled={disabled}
            >
              {formatLanguageCatalogMatch(match, locale)}
            </button>
          ))}
        </div>
      )}

      {(value.localeTag || value.scriptTag || value.regionTag || value.variantTag) && (
        <p className="dialog-hint">
          {locale === 'zh-CN' ? '\u8bc6\u522b\u5230\u6807\u7b7e\uff1a' : 'Detected tag: '}
          {[
            value.localeTag,
            value.scriptTag,
            value.regionTag,
            value.variantTag,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {ambiguityHint && <p className="dialog-hint">{ambiguityHint}</p>}
      {warnings[0] && <p className="dialog-hint">{warnings[0]}</p>}
      {(error || codeError) && <p className="error">{error || codeError}</p>}
    </div>
  );
}