import {
  formatLanguageDisplayName,
  getLanguageCatalogEntry,
  resolveLanguageCodeInput,
  resolveLanguageCodeInputChange,
  type LanguageCatalogMatch,
  type LanguageSearchLocale,
} from './langMapping';
import {
  resolveLanguageDisplayNameWithFallback,
  type ResolveLanguageDisplayName,
} from './languageDisplayNameResolver';
import type {
  LanguageInputDisplayMode,
  LanguageInputAssistState,
  LanguageInputAssistMessages,
  LanguageIsoInputValue,
} from './languageInputTypes';

type LanguageInputStatus =
  | 'idle'
  | 'editing-name'
  | 'editing-code'
  | 'suggesting'
  | 'selected'
  | 'invalid'
  | 'deferred-code';

type LanguageInputChangeSource =
  | 'user-name-input'
  | 'user-code-input'
  | 'suggestion-click'
  | 'suggestion-enter'
  | 'blur-commit'
  | 'external-sync'
  | 'reset';

type LanguageInputDraft = {
  nameInput: string;
  codeInput: string;
  activeField: 'name' | 'code' | null;
};

export type LanguageInputModel = {
  draft: LanguageInputDraft;
  committed: LanguageIsoInputValue | null;
  selectedOption: LanguageIsoInputValue | null;
  suggestions: LanguageCatalogMatch[];
  activeSuggestionIndex: number;
  status: LanguageInputStatus;
  lastChangeSource: LanguageInputChangeSource;
};

export type LanguageInputEvent =
  | { type: 'nameChanged'; value: string }
  | {
      type: 'nameSuggestionsResolved';
      query: string;
      suggestions: LanguageCatalogMatch[];
      autoFillMatch?: LanguageCatalogMatch;
    }
  | { type: 'codeFocused' }
  | { type: 'codeChanged'; value: string }
  | { type: 'nameSuggestionHovered'; index: number }
  | { type: 'highlightNextSuggestion'; visibleCount: number }
  | { type: 'highlightPreviousSuggestion'; visibleCount: number }
  | { type: 'clearSuggestionHighlight' }
  | { type: 'nameSuggestionCommitted'; index: number; source: 'click' | 'enter' }
  | { type: 'codeBlurred' }
  | { type: 'externalValueSynced'; value: LanguageIsoInputValue }
  | { type: 'resetToValue'; value: LanguageIsoInputValue }
  | { type: 'clear' };

export const MAX_LANGUAGE_INPUT_VISIBLE_SUGGESTIONS = 4;

export type LanguageInputResolverOptions = {
  resolveLanguageDisplayName?: ResolveLanguageDisplayName;
};

const EMPTY_LANGUAGE_INPUT_VALUE: LanguageIsoInputValue = {
  languageName: '',
  languageCode: '',
};

function resolveLanguageDisplayMode(value: LanguageIsoInputValue): LanguageInputDisplayMode {
  return value.displayMode ?? 'locale-first';
}

function optionalTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLanguageNameQuery(value: string | undefined): string {
  return value?.normalize('NFKC').trim().toLowerCase() ?? '';
}

function normalizeLanguageValue(
  value: LanguageIsoInputValue,
  locale: LanguageSearchLocale,
  options?: LanguageInputResolverOptions,
): LanguageIsoInputValue {
  const normalizedCode = value.languageCode.trim().toLowerCase();
  const trimmedAssetId = optionalTrimmedValue(value.languageAssetId);
  const normalizedAssetId =
    trimmedAssetId?.toLowerCase() ?? (normalizedCode.length > 0 ? normalizedCode : undefined);
  const displayMode = resolveLanguageDisplayMode(value);
  const preferredDisplayName = optionalTrimmedValue(value.preferredDisplayName);
  const preferredDisplayKind = value.preferredDisplayKind;
  const preservedPrimaryName = preferredDisplayName ?? value.languageName.trim();
  const normalizedLookupKey = normalizedAssetId ?? normalizedCode;
  const normalizedName =
    normalizedLookupKey.length > 0
      ? displayMode === 'input-first'
        ? preservedPrimaryName.length > 0
          ? preservedPrimaryName
          : resolveLanguageDisplayNameWithFallback(
              normalizedLookupKey,
              locale,
              options?.resolveLanguageDisplayName,
            )
        : resolveLanguageDisplayNameWithFallback(
            normalizedLookupKey,
            locale,
            options?.resolveLanguageDisplayName,
          )
      : value.languageName.trim();
  const localeTag = optionalTrimmedValue(value.localeTag);
  const scriptTag = optionalTrimmedValue(value.scriptTag);
  const regionTag = optionalTrimmedValue(value.regionTag);
  const variantTag = optionalTrimmedValue(value.variantTag);

  return {
    languageName: normalizedName,
    languageCode: normalizedCode,
    ...(normalizedAssetId !== undefined ? { languageAssetId: normalizedAssetId } : {}),
    ...(normalizedCode.length > 0 ? { displayMode } : {}),
    ...(preferredDisplayName !== undefined ? { preferredDisplayName } : {}),
    ...(preferredDisplayKind !== undefined ? { preferredDisplayKind } : {}),
    ...(localeTag !== undefined ? { localeTag } : {}),
    ...(scriptTag !== undefined ? { scriptTag } : {}),
    ...(regionTag !== undefined ? { regionTag } : {}),
    ...(variantTag !== undefined ? { variantTag } : {}),
  };
}

function hasCommittedLanguageValue(value: LanguageIsoInputValue): boolean {
  return value.languageCode.trim().length > 0;
}

function buildCommittedValueFromMatch(
  match: LanguageCatalogMatch,
  locale: LanguageSearchLocale,
  options?: LanguageInputResolverOptions,
): LanguageIsoInputValue {
  const displayMode: LanguageInputDisplayMode =
    match.matchedLabelKind === 'code' ? 'locale-first' : 'input-first';
  const preferredDisplayName = displayMode === 'input-first' ? match.matchedLabel : undefined;
  return {
    languageName:
      preferredDisplayName ??
      resolveLanguageDisplayNameWithFallback(
        match.entry.languageId,
        locale,
        options?.resolveLanguageDisplayName,
      ),
    languageCode: match.entry.iso6393,
    languageAssetId: match.entry.languageId,
    ...(displayMode === 'input-first' ? { displayMode } : {}),
    ...(preferredDisplayName !== undefined ? { preferredDisplayName } : {}),
    ...(preferredDisplayName !== undefined ? { preferredDisplayKind: match.matchedLabelKind } : {}),
  };
}

function buildCommittedValueFromResolvedCode(
  fallbackCode: string,
  resolved: ReturnType<typeof resolveLanguageCodeInput>,
  locale: LanguageSearchLocale,
  options?: LanguageInputResolverOptions,
): LanguageIsoInputValue | null {
  if (resolved.status !== 'resolved') {
    return null;
  }

  const localeTag = optionalTrimmedValue(resolved.localeTag);
  const scriptTag = optionalTrimmedValue(resolved.scriptTag);
  const regionTag = optionalTrimmedValue(resolved.regionTag);
  const variantTag = optionalTrimmedValue(resolved.variantTag);
  const normalizedFallbackCode = fallbackCode.trim().toLowerCase();
  const normalizedAssetId = (resolved.languageId ?? normalizedFallbackCode).trim().toLowerCase();
  const catalogCode = getLanguageCatalogEntry(normalizedAssetId)?.iso6393?.trim().toLowerCase();
  const normalizedCode =
    catalogCode !== undefined && catalogCode.length > 0
      ? catalogCode
      : normalizedFallbackCode.length > 0
        ? normalizedFallbackCode
        : normalizedAssetId;
  const resolvedDisplayName = resolveLanguageDisplayNameWithFallback(
    normalizedAssetId,
    locale,
    options?.resolveLanguageDisplayName,
  );

  return {
    languageName: resolvedDisplayName,
    languageCode: normalizedCode.length > 0 ? normalizedCode : normalizedAssetId,
    languageAssetId: normalizedAssetId,
    displayMode: 'locale-first',
    ...(localeTag !== undefined ? { localeTag } : {}),
    ...(scriptTag !== undefined ? { scriptTag } : {}),
    ...(regionTag !== undefined ? { regionTag } : {}),
    ...(variantTag !== undefined ? { variantTag } : {}),
  };
}

function withChangeSource(
  model: LanguageInputModel,
  lastChangeSource: LanguageInputChangeSource,
): LanguageInputModel {
  return {
    ...model,
    lastChangeSource,
  };
}

function buildModelFromExternalValue(
  value: LanguageIsoInputValue,
  locale: LanguageSearchLocale,
  changeSource: 'external-sync' | 'reset',
  options?: LanguageInputResolverOptions,
): LanguageInputModel {
  const normalizedValue = normalizeLanguageValue(value, locale, options);

  if (hasCommittedLanguageValue(normalizedValue)) {
    return {
      draft: {
        nameInput: normalizedValue.languageName,
        codeInput: normalizedValue.languageCode,
        activeField: null,
      },
      committed: normalizedValue,
      selectedOption: normalizedValue,
      suggestions: [],
      activeSuggestionIndex: -1,
      status: 'selected',
      lastChangeSource: changeSource,
    };
  }

  const trimmedName = normalizedValue.languageName.trim();

  return {
    draft: {
      nameInput: normalizedValue.languageName,
      codeInput: '',
      activeField: null,
    },
    committed: null,
    selectedOption: null,
    suggestions: [],
    activeSuggestionIndex: -1,
    status: trimmedName.length > 0 ? 'editing-name' : 'idle',
    lastChangeSource: changeSource,
  };
}

export function createLanguageInputModel(
  value: LanguageIsoInputValue,
  locale: LanguageSearchLocale,
  options?: LanguageInputResolverOptions,
): LanguageInputModel {
  return buildModelFromExternalValue(value, locale, 'reset', options);
}

export function serializeLanguageInputValue(value: LanguageIsoInputValue): string {
  const normalizedLanguageAssetId = optionalTrimmedValue(value.languageAssetId)?.toLowerCase();
  const normalizedPreferredDisplayName = optionalTrimmedValue(value.preferredDisplayName);
  const normalizedLocaleTag = optionalTrimmedValue(value.localeTag);
  const normalizedScriptTag = optionalTrimmedValue(value.scriptTag);
  const normalizedRegionTag = optionalTrimmedValue(value.regionTag);
  const normalizedVariantTag = optionalTrimmedValue(value.variantTag);

  return JSON.stringify({
    languageName: value.languageName.trim(),
    languageCode: value.languageCode.trim().toLowerCase(),
    ...(normalizedLanguageAssetId !== undefined
      ? { languageAssetId: normalizedLanguageAssetId }
      : {}),
    ...(value.displayMode !== undefined ? { displayMode: value.displayMode } : {}),
    ...(normalizedPreferredDisplayName !== undefined
      ? { preferredDisplayName: normalizedPreferredDisplayName }
      : {}),
    ...(value.preferredDisplayKind !== undefined
      ? { preferredDisplayKind: value.preferredDisplayKind }
      : {}),
    ...(normalizedLocaleTag !== undefined ? { localeTag: normalizedLocaleTag } : {}),
    ...(normalizedScriptTag !== undefined ? { scriptTag: normalizedScriptTag } : {}),
    ...(normalizedRegionTag !== undefined ? { regionTag: normalizedRegionTag } : {}),
    ...(normalizedVariantTag !== undefined ? { variantTag: normalizedVariantTag } : {}),
  });
}

export function selectDisplayedLanguageInputValue(
  model: LanguageInputModel,
): LanguageIsoInputValue {
  const selected = model.selectedOption ?? model.committed;
  return {
    languageName: model.draft.nameInput,
    languageCode: model.draft.codeInput,
    ...(selected?.languageAssetId !== undefined
      ? { languageAssetId: selected.languageAssetId }
      : {}),
    ...(selected?.displayMode !== undefined ? { displayMode: selected.displayMode } : {}),
    ...(selected?.preferredDisplayName !== undefined
      ? { preferredDisplayName: selected.preferredDisplayName }
      : {}),
    ...(selected?.preferredDisplayKind !== undefined
      ? { preferredDisplayKind: selected.preferredDisplayKind }
      : {}),
    ...(selected?.localeTag !== undefined ? { localeTag: selected.localeTag } : {}),
    ...(selected?.scriptTag !== undefined ? { scriptTag: selected.scriptTag } : {}),
    ...(selected?.regionTag !== undefined ? { regionTag: selected.regionTag } : {}),
    ...(selected?.variantTag !== undefined ? { variantTag: selected.variantTag } : {}),
  };
}

export function selectPresentedLanguageInputValue(
  model: LanguageInputModel,
  locale: LanguageSearchLocale,
  preserveEditableName: boolean,
): LanguageIsoInputValue {
  const displayed = selectDisplayedLanguageInputValue(model);
  const selected = model.selectedOption ?? model.committed;
  if (selected === null || preserveEditableName || model.status !== 'selected') {
    return displayed;
  }

  const displayMode = resolveLanguageDisplayMode(selected);
  const formattedLanguageName = formatLanguageDisplayName(
    selected.languageCode,
    locale,
    displayMode,
    selected.preferredDisplayName ?? selected.languageName,
    selected.preferredDisplayKind,
  );

  const primaryCommittedName = selected.languageName.trim();
  const resolvedLanguageName =
    displayMode === 'locale-first' && primaryCommittedName.length > 0
      ? [primaryCommittedName, ...formattedLanguageName.split(' · ').slice(1)]
          .filter((part, index, all) => part.length > 0 && all.indexOf(part) === index)
          .join(' · ')
      : formattedLanguageName;

  return {
    ...displayed,
    languageName: resolvedLanguageName,
  };
}

export function selectCommittedLanguageInputValue(
  model: LanguageInputModel,
): LanguageIsoInputValue {
  return model.committed ?? EMPTY_LANGUAGE_INPUT_VALUE;
}

export function selectLanguageInputAssistState(
  model: LanguageInputModel,
  locale: LanguageSearchLocale,
  messages?: LanguageInputAssistMessages,
): LanguageInputAssistState {
  const ambiguityHint =
    model.suggestions.length > 1
      ? (messages?.ambiguityHint ??
        (locale === 'zh-CN'
          ? '\u5b58\u5728\u591a\u4e2a\u53ef\u80fd\u8bed\u8a00\uff0c\u8bf7\u9009\u62e9\u66f4\u5177\u4f53\u9879\u3002'
          : 'Multiple languages matched. Please choose a more specific option.'))
      : '';

  const displayedCode = model.draft.codeInput;
  const resolvedCode =
    displayedCode.length > 0
      ? resolveLanguageCodeInput(displayedCode, locale)
      : { status: 'empty' as const, warnings: [] };
  const shouldShowCodeError =
    displayedCode.length > 0 &&
    resolvedCode.status === 'invalid' &&
    model.draft.activeField !== 'code';
  const codeError = shouldShowCodeError
    ? (messages?.invalidLanguageCode ??
      (locale === 'zh-CN'
        ? '\u8bf7\u8f93\u5165\u6709\u6548\u7684 ISO 639 / BCP 47 \u8bed\u8a00\u4ee3\u7801\u3002'
        : 'Enter a valid ISO 639 / BCP 47 language code.'))
    : '';
  const warnings = [
    ...(model.status === 'deferred-code' ? [] : resolvedCode.warnings),
    ...(model.suggestions[0]?.warnings ?? []),
  ].filter((warning, index, all) => warning.length > 0 && all.indexOf(warning) === index);
  const selected = model.selectedOption ?? model.committed;
  const detectedTagSummary = [
    selected?.localeTag,
    selected?.scriptTag,
    selected?.regionTag,
    selected?.variantTag,
  ]
    .filter((tag): tag is string => tag !== undefined && tag.length > 0)
    .join(' · ');

  return {
    suggestionMatches: model.suggestions,
    ambiguityHint,
    warning: warnings[0] ?? '',
    codeError,
    detectedTagSummary,
  };
}

function clearModelForNameDraft(nextNameInput: string): LanguageInputModel {
  return {
    draft: {
      nameInput: nextNameInput,
      codeInput: '',
      activeField: 'name',
    },
    committed: null,
    selectedOption: null,
    suggestions: [],
    activeSuggestionIndex: -1,
    status: nextNameInput.trim().length === 0 ? 'idle' : 'suggesting',
    lastChangeSource: 'user-name-input',
  };
}

function hasUncommittedLocalDraft(model: LanguageInputModel): boolean {
  return (
    model.status === 'editing-name' ||
    model.status === 'editing-code' ||
    model.status === 'suggesting' ||
    model.status === 'invalid' ||
    model.status === 'deferred-code'
  );
}

export function reduceLanguageInput(
  model: LanguageInputModel,
  event: LanguageInputEvent,
  locale: LanguageSearchLocale,
  options?: LanguageInputResolverOptions,
): LanguageInputModel {
  switch (event.type) {
    case 'codeFocused': {
      if (model.draft.activeField === 'code') {
        return model;
      }
      return {
        ...model,
        draft: {
          ...model.draft,
          activeField: 'code',
        },
      };
    }

    case 'nameChanged': {
      return clearModelForNameDraft(event.value);
    }

    case 'nameSuggestionsResolved': {
      const normalizedCurrentQuery = normalizeLanguageNameQuery(model.draft.nameInput);
      const normalizedResolvedQuery = normalizeLanguageNameQuery(event.query);
      if (
        normalizedCurrentQuery.length === 0 ||
        normalizedCurrentQuery !== normalizedResolvedQuery
      ) {
        return model;
      }
      if (model.draft.codeInput.trim().length > 0) {
        return model;
      }

      if (event.autoFillMatch !== undefined) {
        const committed = buildCommittedValueFromMatch(event.autoFillMatch, locale, options);
        const resolvedCommitted =
          committed.displayMode === 'input-first'
            ? {
                ...committed,
                languageName: model.draft.nameInput.trim(),
                preferredDisplayName: model.draft.nameInput.trim(),
              }
            : committed;
        return {
          draft: {
            nameInput: model.draft.nameInput,
            codeInput: resolvedCommitted.languageCode,
            activeField: 'name',
          },
          committed: resolvedCommitted,
          selectedOption: resolvedCommitted,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'selected',
          lastChangeSource: 'user-name-input',
        };
      }

      return {
        draft: {
          nameInput: model.draft.nameInput,
          codeInput: '',
          activeField: 'name',
        },
        committed: null,
        selectedOption: null,
        suggestions: event.suggestions,
        activeSuggestionIndex: -1,
        status: event.suggestions.length > 0 ? 'suggesting' : 'invalid',
        lastChangeSource: 'user-name-input',
      };
    }

    case 'codeChanged': {
      const nextInputState = resolveLanguageCodeInputChange(
        event.value,
        model.draft.codeInput,
        locale,
      );
      const sanitizedInput = nextInputState.sanitizedInput;

      if (sanitizedInput.length === 0) {
        return {
          draft: {
            nameInput: '',
            codeInput: '',
            activeField: 'code',
          },
          committed: null,
          selectedOption: null,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'idle',
          lastChangeSource: 'user-code-input',
        };
      }

      if (nextInputState.status === 'deferred') {
        return {
          draft: {
            nameInput: '',
            codeInput: sanitizedInput,
            activeField: 'code',
          },
          committed: null,
          selectedOption: null,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'deferred-code',
          lastChangeSource: 'user-code-input',
        };
      }

      if (nextInputState.status !== 'resolved') {
        return {
          draft: {
            nameInput: '',
            codeInput: sanitizedInput,
            activeField: 'code',
          },
          committed: null,
          selectedOption: null,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'invalid',
          lastChangeSource: 'user-code-input',
        };
      }

      const committed = buildCommittedValueFromResolvedCode(
        sanitizedInput,
        nextInputState.resolution,
        locale,
        options,
      );
      if (committed === null) {
        return withChangeSource(model, 'user-code-input');
      }

      // 尝试构造候选项让用户确认，而非直接自动填充 | Try to show candidate for user confirmation instead of auto-filling
      const resolvedEntry = getLanguageCatalogEntry(
        committed.languageAssetId ?? committed.languageCode,
      );
      if (resolvedEntry !== undefined) {
        const suggestion: LanguageCatalogMatch = {
          entry: resolvedEntry,
          score: 100,
          matchSource: 'iso6393-exact',
          matchedLabel:
            resolvedEntry.iso6393 === sanitizedInput.toLowerCase()
              ? resolvedEntry.iso6393
              : sanitizedInput,
          matchedLabelKind: 'code',
          warnings: [],
        };
        return {
          draft: {
            nameInput: '',
            codeInput: sanitizedInput,
            activeField: 'code',
          },
          committed: null,
          selectedOption: committed, // 预存完整提交值（含 BCP 47 标签）| Pre-store full committed value (incl. BCP 47 tags)
          suggestions: [suggestion],
          activeSuggestionIndex: -1,
          status: 'suggesting',
          lastChangeSource: 'user-code-input',
        };
      }

      // 无目录条目（自定义语言等），回退到自动提交 | No catalog entry (custom language etc.), fall back to auto-commit
      return {
        draft: {
          nameInput: committed.languageName,
          codeInput: committed.languageCode,
          activeField: 'code',
        },
        committed,
        selectedOption: committed,
        suggestions: [],
        activeSuggestionIndex: -1,
        status: 'selected',
        lastChangeSource: 'user-code-input',
      };
    }

    case 'nameSuggestionHovered': {
      if (event.index < 0 || event.index >= model.suggestions.length) {
        return model;
      }
      return {
        ...model,
        activeSuggestionIndex: event.index,
      };
    }

    case 'highlightNextSuggestion': {
      const visibleSuggestionCount = Math.min(
        model.suggestions.length,
        Math.max(0, event.visibleCount),
      );
      if (visibleSuggestionCount === 0) {
        return model;
      }
      return {
        ...model,
        activeSuggestionIndex:
          (model.activeSuggestionIndex + 1 + visibleSuggestionCount) % visibleSuggestionCount,
      };
    }

    case 'highlightPreviousSuggestion': {
      const visibleSuggestionCount = Math.min(
        model.suggestions.length,
        Math.max(0, event.visibleCount),
      );
      if (visibleSuggestionCount === 0) {
        return model;
      }
      return {
        ...model,
        activeSuggestionIndex:
          model.activeSuggestionIndex <= 0
            ? visibleSuggestionCount - 1
            : model.activeSuggestionIndex - 1,
      };
    }

    case 'clearSuggestionHighlight': {
      if (model.activeSuggestionIndex === -1) {
        return model;
      }
      return {
        ...model,
        activeSuggestionIndex: -1,
      };
    }

    case 'nameSuggestionCommitted': {
      const match = model.suggestions[event.index];
      if (match === undefined) {
        return model;
      }
      // 如果 selectedOption 已由代码输入预构建（含 BCP 47 标签），直接使用 | If selectedOption was pre-built by code input (with BCP 47 tags), use it directly
      const committed =
        model.selectedOption ?? buildCommittedValueFromMatch(match, locale, options);
      return {
        draft: {
          nameInput: committed.languageName,
          codeInput: committed.languageCode,
          activeField: model.draft.activeField ?? 'name',
        },
        committed,
        selectedOption: committed,
        suggestions: [],
        activeSuggestionIndex: -1,
        status: 'selected',
        lastChangeSource: event.source === 'click' ? 'suggestion-click' : 'suggestion-enter',
      };
    }

    case 'codeBlurred': {
      if (model.status === 'deferred-code') {
        const resolved = resolveLanguageCodeInput(model.draft.codeInput, locale);
        const committed = buildCommittedValueFromResolvedCode(
          model.draft.codeInput,
          resolved,
          locale,
          options,
        );
        if (committed === null) {
          return {
            ...model,
            status: model.draft.codeInput.length > 0 ? 'invalid' : 'idle',
            lastChangeSource: 'blur-commit',
            draft: {
              ...model.draft,
              activeField: null,
            },
          };
        }
        return {
          draft: {
            nameInput: committed.languageName,
            codeInput: committed.languageCode,
            activeField: null,
          },
          committed,
          selectedOption: committed,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'selected',
          lastChangeSource: 'blur-commit',
        };
      }

      // 代码输入产生的候选项在 blur 时自动提交 | Auto-commit code-derived suggestions on blur
      if (
        model.status === 'suggesting' &&
        model.suggestions.length > 0 &&
        model.lastChangeSource === 'user-code-input'
      ) {
        const committed =
          model.selectedOption ??
          buildCommittedValueFromMatch(model.suggestions[0]!, locale, options);
        return {
          draft: {
            nameInput: committed.languageName,
            codeInput: committed.languageCode,
            activeField: null,
          },
          committed,
          selectedOption: committed,
          suggestions: [],
          activeSuggestionIndex: -1,
          status: 'selected',
          lastChangeSource: 'blur-commit',
        };
      }

      if (model.draft.activeField !== 'code') {
        return model;
      }

      // 输入结束后统一退出编辑态，让无效值在 blur 后可见 | Exit editing mode on blur so invalid values become visible after typing
      return {
        ...model,
        draft: {
          ...model.draft,
          activeField: null,
        },
        lastChangeSource: 'blur-commit',
      };
    }

    case 'externalValueSynced': {
      if (hasUncommittedLocalDraft(model)) {
        return withChangeSource(model, 'external-sync');
      }
      return buildModelFromExternalValue(event.value, locale, 'external-sync', options);
    }

    case 'resetToValue':
      return buildModelFromExternalValue(event.value, locale, 'reset', options);

    case 'clear':
      return buildModelFromExternalValue(EMPTY_LANGUAGE_INPUT_VALUE, locale, 'reset', options);

    default:
      return model;
  }
}
