import type { LanguageCatalogMatch, LanguageCatalogMatchedLabelKind } from './langMapping';

export type LanguageInputDisplayMode = 'locale-first' | 'input-first';

export type LanguageIsoInputValue = {
  languageName: string;
  languageCode: string;
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
};

export type LanguageCodeEditResult = {
  nextValue: LanguageIsoInputValue;
  nextCodeDraft: string | null;
  committedLanguageCode: string;
};