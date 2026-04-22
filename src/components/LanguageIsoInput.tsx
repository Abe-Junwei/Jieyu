import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { formatLanguageCatalogMatch, getLanguageCatalogEntry, type LanguageCatalogMatch, type LanguageCatalogMatchSource, type LanguageSearchLocale } from '../utils/langMapping';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import type { LanguageIsoInputValue } from '../utils/languageInputTypes';
import { createLanguageInputModel, MAX_LANGUAGE_INPUT_VISIBLE_SUGGESTIONS, reduceLanguageInput, selectCommittedLanguageInputValue, selectLanguageInputAssistState, selectPresentedLanguageInputValue, serializeLanguageInputValue } from '../utils/languageInputReducer';
import { getLanguageInputMessages } from '../i18n/languageInputMessages';
import type { Locale } from '../i18n/index';
import { PanelFeedback } from './ui';
import { type LanguageCatalogSearchScope, searchLanguageCatalogSuggestions, type LanguageCatalogSearchSuggestion } from '../services/LanguageCatalogSearchService';

export type { LanguageIsoInputValue } from '../utils/languageInputTypes';

const LANGUAGE_SUGGESTION_LIMIT = 5;
const LANGUAGE_SUGGESTION_DEBOUNCE_MS = 120;

function mapSearchSuggestionSource(matchSource: string): LanguageCatalogMatchSource {
  if (matchSource === 'code-exact') {
    return 'iso6393-exact';
  }
  if (matchSource === 'code-prefix') {
    return 'prefix';
  }
  if (matchSource === 'code-contains') {
    return 'contains';
  }
  if (matchSource === 'alias-exact') {
    return 'alias-exact';
  }
  if (matchSource.endsWith('-exact')) {
    return 'name-exact';
  }
  if (matchSource.endsWith('-prefix')) {
    return 'prefix';
  }
  return 'contains';
}

function toLanguageCatalogMatch(suggestion: LanguageCatalogSearchSuggestion): LanguageCatalogMatch | null {
  const entry = getLanguageCatalogEntry(suggestion.id) ?? getLanguageCatalogEntry(suggestion.languageCode);
  if (!entry) {
    return null;
  }

  return {
    entry,
    score: suggestion.rank,
    matchSource: mapSearchSuggestionSource(suggestion.matchSource),
    matchedLabel: suggestion.matchedLabel,
    matchedLabelKind: suggestion.matchedLabelKind,
    warnings: [],
  };
}

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
  searchScope?: LanguageCatalogSearchScope;
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
  searchScope = 'orthography',
  resolveLanguageDisplayName,
}: LanguageIsoInputProps) {
  const fieldIdPrefix = useId();
  const serializedIncomingValue = serializeLanguageInputValue(value);
  const resolverOptions = resolveLanguageDisplayName ? { resolveLanguageDisplayName } : {};
  const [model, dispatch] = useReducer(
    (state: ReturnType<typeof createLanguageInputModel>, action: Parameters<typeof reduceLanguageInput>[1]) => reduceLanguageInput(state, action, locale, resolverOptions),
    value,
    (initialValue) => createLanguageInputModel(initialValue, locale, resolverOptions),
  );
  const lastSeenValueKeyRef = useRef(serializedIncomingValue);
  const lastSeenLocaleRef = useRef(locale);
  const lastSeenResolverRef = useRef(resolveLanguageDisplayName);
  const lastNotifiedCommittedKeyRef = useRef(serializedIncomingValue);
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const languageCodeInputRef = useRef<HTMLInputElement | null>(null);
  const previousVisibleErrorRef = useRef('');
  const presentedValue = useMemo(
    () => selectPresentedLanguageInputValue(model, locale, isNameInputFocused),
    [isNameInputFocused, locale, model],
  );
  const committedValue = useMemo(() => selectCommittedLanguageInputValue(model), [model]);
  const i18nMessages = useMemo(() => getLanguageInputMessages(locale as Locale), [locale]);
  const assistState = useMemo(
    () => selectLanguageInputAssistState(model, locale, i18nMessages),
    [locale, model, i18nMessages],
  );
  const visibleSuggestionMatches = useMemo(
    () => assistState.suggestionMatches.slice(0, MAX_LANGUAGE_INPUT_VISIBLE_SUGGESTIONS),
    [assistState.suggestionMatches],
  );
  const hasVisibleSuggestions = visibleSuggestionMatches.length > 0;
  const hasExternalError = Boolean(error);
  const visibleCodeError = error || (!suppressCodeError ? assistState.codeError : '');
  const codeErrorId = `${fieldIdPrefix}-language-code-error`;
  const committedValueKey = serializeLanguageInputValue(committedValue);

  useEffect(() => {
    const activeNameQuery = model.draft.activeField === 'name' ? model.draft.nameInput.trim() : '';
    if (!activeNameQuery || disabled || model.status === 'selected' || model.draft.codeInput.trim().length > 0) {
      return;
    }

    let cancelled = false;
    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          const suggestions = await searchLanguageCatalogSuggestions({
            query: activeNameQuery,
            locale,
            limit: LANGUAGE_SUGGESTION_LIMIT,
            catalogScope: searchScope,
          });
          if (cancelled) {
            return;
          }

          const nextMatches = suggestions
            .map((suggestion) => toLanguageCatalogMatch(suggestion))
            .filter((match): match is LanguageCatalogMatch => Boolean(match));

          // 始终展示下拉列表，由用户手动选择，不自动填充 | Always show dropdown for manual selection, no auto-fill
          dispatch({
            type: 'nameSuggestionsResolved',
            query: activeNameQuery,
            suggestions: nextMatches,
          });
        } catch {
          if (cancelled) {
            return;
          }
          dispatch({
            type: 'nameSuggestionsResolved',
            query: activeNameQuery,
            suggestions: [],
          });
        }
      })();
    }, LANGUAGE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [disabled, locale, model.draft.activeField, model.draft.codeInput, model.draft.nameInput, model.status, searchScope]);

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

  useEffect(() => {
    const previousVisibleError = previousVisibleErrorRef.current;
    previousVisibleErrorRef.current = visibleCodeError;
    if (!visibleCodeError || visibleCodeError === previousVisibleError) {
      return;
    }

    const inputNode = languageCodeInputRef.current;
    if (!inputNode) {
      return;
    }

    inputNode.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    if (hasExternalError && document.activeElement !== inputNode) {
      inputNode.focus({ preventScroll: true });
    }
  }, [hasExternalError, visibleCodeError]);

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

  // 代码字段也支持候选项键盘导航 | Code field also supports suggestion keyboard navigation
  const handleLanguageCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

    if (event.key === 'Enter') {
      // 有高亮项 → 提交高亮项 | Has highlight → commit highlighted item
      if (model.activeSuggestionIndex >= 0 && model.activeSuggestionIndex < suggestionCount) {
        event.preventDefault();
        dispatch({ type: 'nameSuggestionCommitted', index: model.activeSuggestionIndex, source: 'enter' });
        return;
      }
      // 仅一个候选项 → 直接提交 | Single suggestion → commit directly
      if (suggestionCount === 1) {
        event.preventDefault();
        dispatch({ type: 'nameSuggestionCommitted', index: 0, source: 'enter' });
      }
    }
  };

  const handleLanguageCodeFocus = () => {
    dispatch({ type: 'codeFocused' });
  };

  const handleLanguageCodeBlur = () => {
    dispatch({ type: 'codeBlurred' });
  };

  const commitSuggestionByClick = (index: number) => {
    if (disabled) {
      return;
    }
    dispatch({ type: 'nameSuggestionCommitted', index, source: 'click' });
  };

  return (
    <div className={`language-iso-input ${className}`.trim()}>
      <div className="language-iso-input-anchor">
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
              ref={languageCodeInputRef}
              className="input panel-input"
              type="text"
              value={presentedValue.languageCode}
              onChange={handleLanguageCodeChange}
              onKeyDown={handleLanguageCodeKeyDown}
              onFocus={handleLanguageCodeFocus}
              onBlur={handleLanguageCodeBlur}
              placeholder={codePlaceholder}
              autoComplete="off"
              spellCheck={false}
              data-language-iso-code-input="true"
              aria-invalid={visibleCodeError ? 'true' : undefined}
              aria-describedby={visibleCodeError ? codeErrorId : undefined}
              disabled={disabled}
            />
          </label>
        </div>

        <div
          className={`language-iso-input-suggestions${hasVisibleSuggestions ? '' : ' is-empty'}`}
          {...(hasVisibleSuggestions
            ? {
              id: suggestionListId,
              role: 'listbox' as const,
              'aria-label': nameLabel,
              'aria-labelledby': languageNameInputId,
            }
            : { 'aria-hidden': 'true' as const })}
        >
          {hasVisibleSuggestions
            ? visibleSuggestionMatches.map((match, index) => (
              <div
                id={`${fieldIdPrefix}-language-suggestion-${index}`}
                key={`${match.entry.iso6393}-${index}`}
                role="option"
                aria-selected={model.activeSuggestionIndex === index}
                aria-disabled={disabled ? 'true' : undefined}
                className={`language-iso-input-suggestion${model.activeSuggestionIndex === index ? ' is-active' : ''}`}
                onMouseEnter={() => dispatch({ type: 'nameSuggestionHovered', index })}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitSuggestionByClick(index);
                }}
                onClick={() => commitSuggestionByClick(index)}
              >
                {formatLanguageCatalogMatch(match, locale)}
              </div>
            ))
            : null}
        </div>
      </div>

      <div className="language-iso-input-feedback-slot" aria-live="polite">
        {assistState.detectedTagSummary && (
          <p className="dialog-hint">
            {locale === 'zh-CN' ? '\u8bc6\u522b\u5230\u6807\u7b7e\uff1a' : 'Detected tag: '}
            {assistState.detectedTagSummary}
          </p>
        )}

        {assistState.ambiguityHint && <p className="dialog-hint">{assistState.ambiguityHint}</p>}
        {assistState.warning && <p className="dialog-hint">{assistState.warning}</p>}
        {visibleCodeError && <PanelFeedback id={codeErrorId} level="error">{visibleCodeError}</PanelFeedback>}
      </div>
    </div>
  );
}