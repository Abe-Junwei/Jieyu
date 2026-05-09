import type { LanguageSearchLocale } from './langMapping';
import { isDeferredLanguageCodeDraft } from './langMapping';
import {
  resolveLanguageDisplayNameWithFallback,
  type ResolveLanguageDisplayName,
} from './languageDisplayNameResolver';
import type { LanguageIsoInputValue } from './languageInputTypes';

type LanguageOptionLike = {
  code: string;
};

export function normalizeLanguageInputCode(value: LanguageIsoInputValue): string {
  return value.languageCode.trim().toLowerCase();
}

export function normalizeLanguageInputAssetId(value: LanguageIsoInputValue): string {
  const normalizedAssetId = value.languageAssetId?.trim().toLowerCase();
  return normalizedAssetId !== undefined && normalizedAssetId.length > 0
    ? normalizedAssetId
    : normalizeLanguageInputCode(value);
}

export function getDisplayedLanguageInputLabel(value: LanguageIsoInputValue): string {
  const normalizedCode = normalizeLanguageInputCode(value);
  const normalizedName = value.languageName.trim();
  return normalizedName.length > 0 ? normalizedName : normalizedCode.toUpperCase();
}

export function buildLanguageInputSeed(
  languageId: string | undefined,
  locale: LanguageSearchLocale = 'zh-CN',
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
  resolveLanguageCode?: (languageId: string | undefined) => string,
): LanguageIsoInputValue {
  const normalizedAssetId = languageId?.trim().toLowerCase() ?? '';
  if (normalizedAssetId.length === 0) {
    return { languageName: '', languageCode: '' };
  }
  const resolvedCode = resolveLanguageCode?.(normalizedAssetId)?.trim().toLowerCase();
  const normalizedCode =
    resolvedCode !== undefined && resolvedCode.length > 0 ? resolvedCode : normalizedAssetId;
  return {
    languageName: resolveLanguageDisplayNameWithFallback(
      normalizedAssetId,
      locale,
      resolveLanguageDisplayName,
    ),
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
  const resolvedCode = resolveLanguageCode?.(normalizedAssetId)?.trim().toLowerCase();
  const normalizedCode =
    resolvedCode !== undefined && resolvedCode.length > 0 ? resolvedCode : normalizedAssetId;
  return {
    languageName:
      normalizedAssetId.length > 0
        ? isDeferredLanguageCodeDraft(normalizedCode)
          ? previousValue.languageName
          : resolveLanguageDisplayNameWithFallback(
              normalizedAssetId,
              locale,
              resolveLanguageDisplayName,
            )
        : '',
    languageCode: normalizedCode,
    ...(normalizedAssetId.length > 0 ? { languageAssetId: normalizedAssetId } : {}),
  };
}

export function resolveLanguageHostSelection(
  languageCode: string,
  languageOptions: readonly LanguageOptionLike[],
): { languageId: string; customLanguageId: string } {
  const normalizedCode = languageCode.trim().toLowerCase();
  if (normalizedCode.length === 0) {
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
