import type { LanguageCatalogMatch, LanguageCatalogMatchedLabelKind } from './langMapping';

export type LanguageInputDisplayMode = 'locale-first' | 'input-first';

export type LanguageIsoInputValue = {
  languageName: string;
  languageCode: string;
  languageAssetId?: string;
  displayMode?: LanguageInputDisplayMode;
  preferredDisplayName?: string;
  preferredDisplayKind?: LanguageCatalogMatchedLabelKind;
  localeTag?: string;
  scriptTag?: string;
  regionTag?: string;
  variantTag?: string;
};

export type LanguageInputAssistState = {
  suggestionMatches: LanguageCatalogMatch[];
  ambiguityHint: string;
  warning: string;
  codeError: string;
  detectedTagSummary: string;
}

/** 可注入的 i18n 文案，用于替换 reducer 内部的硬编码文案 | Injectable i18n messages to replace hardcoded text in reducer */
export interface LanguageInputAssistMessages {
  ambiguityHint: string;
  invalidLanguageCode: string;
};

export type LanguageCodeEditResult = {
  nextValue: LanguageIsoInputValue;
  nextCodeDraft: string | null;
  committedLanguageCode: string;
};