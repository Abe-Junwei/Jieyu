import type { LanguageSearchLocale } from './langMapping';
import { isDeferredLanguageCodeDraft } from './langMapping';
import { resolveLanguageDisplayNameWithFallback, type ResolveLanguageDisplayName } from './languageDisplayNameResolver';
import type { LanguageIsoInputValue } from './languageInputTypes';

type LanguageOptionLike = {
  code: string;
};

export function normalizeLanguageInputCode(value: LanguageIsoInputValue): string {
  return value.languageCode.trim().toLowerCase();
}

export function getDisplayedLanguageInputLabel(value: LanguageIsoInputValue): string {
  const normalizedCode = normalizeLanguageInputCode(value);
  return value.languageName.trim() || normalizedCode.toUpperCase();
}

export function buildLanguageInputSeed(
  languageId: string | undefined,
  locale: LanguageSearchLocale = 'zh-CN',
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
): LanguageIsoInputValue {
  const normalizedCode = languageId?.trim().toLowerCase() ?? '';
  if (!normalizedCode) {
    return { languageName: '', languageCode: '' };
  }
  return {
    languageName: resolveLanguageDisplayNameWithFallback(normalizedCode, locale, resolveLanguageDisplayName),
    languageCode: normalizedCode,
  };
}

export function syncLanguageInputWithExternalCode(
  previousValue: LanguageIsoInputValue,
  resolvedLanguageCode: string,
  locale: LanguageSearchLocale = 'zh-CN',
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
): LanguageIsoInputValue {
  const normalizedCode = resolvedLanguageCode.trim().toLowerCase();
  return {
    languageName: normalizedCode
      ? (isDeferredLanguageCodeDraft(normalizedCode)
        ? previousValue.languageName
        : resolveLanguageDisplayNameWithFallback(normalizedCode, locale, resolveLanguageDisplayName))
      : '',
    languageCode: normalizedCode,
  };
}

export function resolveLanguageHostSelection(
  languageCode: string,
  languageOptions: readonly LanguageOptionLike[],
): { languageId: string; customLanguageId: string } {
  const normalizedCode = languageCode.trim().toLowerCase();
  if (!normalizedCode) {
    return { languageId: '', customLanguageId: '' };
  }
  const knownLanguage = languageOptions.some((option) => option.code === normalizedCode);
  return knownLanguage
    ? { languageId: normalizedCode, customLanguageId: '' }
    : { languageId: '__custom__', customLanguageId: normalizedCode };
}