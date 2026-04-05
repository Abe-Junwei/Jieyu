import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import {
  formatLanguageCatalogMatch,
  type LanguageSearchLocale,
} from '../utils/langMapping';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import type { LanguageIsoInputValue } from '../utils/languageInputTypes';
import {
  createLanguageInputModel,
  MAX_LANGUAGE_INPUT_VISIBLE_SUGGESTIONS,
  reduceLanguageInput,
  selectCommittedLanguageInputValue,
  selectDisplayedLanguageInputValue,
  selectLanguageInputAssistState,
  selectPresentedLanguageInputValue,
  serializeLanguageInputValue,
} from '../utils/languageInputReducer';

export type { LanguageIsoInputValue } from '../utils/languageInputTypes';

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
  /** 抑制组件内部的 codeError 显示，由外部统一展示 | Suppress internal codeError, let parent render it */
  suppressCodeError?: boolean;
  className?: string;
  resolveLanguageDisplayName?: ResolveLanguageDisplayName;
};

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
  suppressCodeError = false,
  className = '',
  resolveLanguageDisplayName,
}: LanguageIsoInputProps) {
  const fieldIdPrefix = useId();
  const serializedIncomingValue = serializeLanguageInputValue(value);
  const [model, dispatch] = useReducer(
    (state: ReturnType<typeof createLanguageInputModel>, action: Parameters<typeof reduceLanguageInput>[1]) => reduceLanguageInput(state, action, locale, { resolveLanguageDisplayName }),
    value,
    (initialValue) => createLanguageInputModel(initialValue, locale, { resolveLanguageDisplayName }),
  );
  const lastSeenValueKeyRef = useRef(serializedIncomingValue);
  const lastSeenLocaleRef = useRef(locale);
  const lastSeenResolverRef = useRef(resolveLanguageDisplayName);
  const lastNotifiedCommittedKeyRef = useRef(serializedIncomingValue);
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const displayedValue = useMemo(() => selectDisplayedLanguageInputValue(model), [model]);
  const presentedValue = useMemo(
    () => selectPresentedLanguageInputValue(model, locale, isNameInputFocused),
    [isNameInputFocused, locale, model],
  );
  const committedValue = useMemo(() => selectCommittedLanguageInputValue(model), [model]);
  const assistState = useMemo(
    () => selectLanguageInputAssistState(model, locale),
    [locale, model],
  );
  const visibleSuggestionMatches = useMemo(
    () => assistState.suggestionMatches.slice(0, MAX_LANGUAGE_INPUT_VISIBLE_SUGGESTIONS),
    [assistState.suggestionMatches],
  );
  const committedValueKey = serializeLanguageInputValue(committedValue);

  useEffect(() => {
    const localeChanged = locale !== lastSeenLocaleRef.current;
    const resolverChanged = resolveLanguageDisplayName !== lastSeenResolverRef.current;
    if (!localeChanged && !resolverChanged && serializedIncomingValue === lastSeenValueKeyRef.current) {
      return;
    }
    lastSeenValueKeyRef.current = serializedIncomingValue;
    lastSeenLocaleRef.current = locale;
    lastSeenResolverRef.current = resolveLanguageDisplayName;
    if (!localeChanged && !resolverChanged && serializedIncomingValue === lastNotifiedCommittedKeyRef.current) {
      return;
    }
    dispatch({ type: 'externalValueSynced', value });
  }, [locale, resolveLanguageDisplayName, serializedIncomingValue, value]);

  useEffect(() => {
    if (committedValueKey === lastNotifiedCommittedKeyRef.current) {
      return;
    }
    lastNotifiedCommittedKeyRef.current = committedValueKey;
    onChange(committedValue);
  }, [committedValue, committedValueKey, onChange]);

  const handleLanguageNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const suggestionCount = visibleSuggestionMatches.length;
    if (suggestionCount === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      dispatch({ type: 'highlightNextSuggestion', visibleCount: suggestionCount });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({ type: 'highlightPreviousSuggestion', visibleCount: suggestionCount });
      return;
    }

    if (event.key === 'Escape') {
      dispatch({ type: 'clearSuggestionHighlight' });
      return;
    }

    if (event.key === 'Enter' && model.activeSuggestionIndex >= 0 && model.activeSuggestionIndex < suggestionCount) {
      event.preventDefault();
      dispatch({ type: 'nameSuggestionCommitted', index: model.activeSuggestionIndex, source: 'enter' });
    }
  };

  const languageNameInputId = `${fieldIdPrefix}-language-name`;
  const suggestionListId = `${fieldIdPrefix}-language-suggestions`;
  const activeSuggestionId = model.activeSuggestionIndex >= 0 && model.activeSuggestionIndex < visibleSuggestionMatches.length
    ? `${fieldIdPrefix}-language-suggestion-${model.activeSuggestionIndex}`
    : undefined;

  const handleLanguageNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'nameChanged', value: event.target.value });
  };

  const handleLanguageCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'codeChanged', value: event.target.value });
  };

  const handleLanguageCodeBlur = () => {
    dispatch({ type: 'codeBlurred' });
  };

  return (
    <div className={`language-iso-input ${className}`.trim()}>
      <div className="language-iso-input-grid">
        <label className="dialog-field">
          <span>{nameLabel}{required ? ' *' : ''}</span>
          <input
            id={languageNameInputId}
            className="input panel-input"
            type="text"
            role="combobox"
            value={presentedValue.languageName}
            onChange={handleLanguageNameChange}
            onKeyDown={handleLanguageNameKeyDown}
            onFocus={() => setIsNameInputFocused(true)}
            onBlur={() => setIsNameInputFocused(false)}
            placeholder={namePlaceholder}
            autoComplete="off"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={visibleSuggestionMatches.length > 0}
            aria-controls={visibleSuggestionMatches.length > 0 ? suggestionListId : undefined}
            aria-activedescendant={activeSuggestionId}
            disabled={disabled}
          />
        </label>
        <label className="dialog-field">
          <span>{codeLabel}{required ? ' *' : ''}</span>
          <input
            id={`${fieldIdPrefix}-language-code`}
            className="input panel-input"
            type="text"
            value={presentedValue.languageCode}
            onChange={handleLanguageCodeChange}
            onBlur={handleLanguageCodeBlur}
            placeholder={codePlaceholder}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
        </label>
      </div>

      {visibleSuggestionMatches.length > 0 && (
        <div
          className="language-iso-input-suggestions"
          id={suggestionListId}
          role="listbox"
          aria-label={nameLabel}
          aria-labelledby={languageNameInputId}
        >
          {visibleSuggestionMatches.map((match, index) => (
            <div
              id={`${fieldIdPrefix}-language-suggestion-${index}`}
              key={`${match.entry.iso6393}-${index}`}
              role="option"
              aria-selected={model.activeSuggestionIndex === index}
              aria-disabled={disabled ? 'true' : undefined}
              className={`language-iso-input-suggestion${model.activeSuggestionIndex === index ? ' is-active' : ''}`}
              onMouseEnter={() => dispatch({ type: 'nameSuggestionHovered', index })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (disabled) {
                  return;
                }
                dispatch({ type: 'nameSuggestionCommitted', index, source: 'click' });
              }}
            >
              {formatLanguageCatalogMatch(match, locale)}
            </div>
          ))}
        </div>
      )}

      {assistState.detectedTagSummary && (
        <p className="dialog-hint">
          {locale === 'zh-CN' ? '\u8bc6\u522b\u5230\u6807\u7b7e\uff1a' : 'Detected tag: '}
          {assistState.detectedTagSummary}
        </p>
      )}

      {assistState.ambiguityHint && <p className="dialog-hint">{assistState.ambiguityHint}</p>}
      {assistState.warning && <p className="dialog-hint">{assistState.warning}</p>}
      {(error || (!suppressCodeError && assistState.codeError)) && <p className="error">{error || assistState.codeError}</p>}
    </div>
  );
}