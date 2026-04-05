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

export function normalizeLanguageInputAssetId(value: LanguageIsoInputValue): string {
  return value.languageAssetId?.trim().toLowerCase() || normalizeLanguageInputCode(value);
}

export function getDisplayedLanguageInputLabel(value: LanguageIsoInputValue): string {
  const normalizedCode = normalizeLanguageInputCode(value);
  return value.languageName.trim() || normalizedCode.toUpperCase();
}

export function buildLanguageInputSeed(
  languageId: string | undefined,
  locale: LanguageSearchLocale = 'zh-CN',
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
  resolveLanguageCode?: (languageId: string | undefined) => string,
): LanguageIsoInputValue {
  const normalizedAssetId = languageId?.trim().toLowerCase() ?? '';
  if (!normalizedAssetId) {
    return { languageName: '', languageCode: '' };
  }
  const normalizedCode = resolveLanguageCode?.(normalizedAssetId)?.trim().toLowerCase() || normalizedAssetId;
  return {
    languageName: resolveLanguageDisplayNameWithFallback(normalizedAssetId, locale, resolveLanguageDisplayName),
    languageCode: normalizedCode,
    languageAssetId: normalizedAssetId,
  };
}

export function syncLanguageInputWithExternalCode(
  previousValue: LanguageIsoInputValue,
  resolvedLanguageCode: string,
  locale: LanguageSearchLocale = 'zh-CN',
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
  resolveLanguageCode?: (languageId: string | undefined) => string,
): LanguageIsoInputValue {
  const normalizedAssetId = resolvedLanguageCode.trim().toLowerCase();
  const normalizedCode = resolveLanguageCode?.(normalizedAssetId)?.trim().toLowerCase() || normalizedAssetId;
  return {
    languageName: normalizedAssetId
      ? (isDeferredLanguageCodeDraft(normalizedCode)
        ? previousValue.languageName
        : resolveLanguageDisplayNameWithFallback(normalizedAssetId, locale, resolveLanguageDisplayName))
      : '',
    languageCode: normalizedCode,
    ...(normalizedAssetId ? { languageAssetId: normalizedAssetId } : {}),
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
  if (normalizedCode.startsWith('user:')) {
    return { languageId: normalizedCode, customLanguageId: '' };
  }
  const knownLanguage = languageOptions.some((option) => option.code === normalizedCode);
  return knownLanguage
    ? { languageId: normalizedCode, customLanguageId: '' }
    : { languageId: '__custom__', customLanguageId: normalizedCode };
}