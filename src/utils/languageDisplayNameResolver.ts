import { getLanguageDisplayName, type LanguageSearchLocale } from './langMapping';

export type ResolveLanguageDisplayName = (
  languageId: string | undefined,
  locale: LanguageSearchLocale,
) => string;

export function resolveLanguageDisplayNameWithFallback(
  languageId: string | undefined,
  locale: LanguageSearchLocale,
  resolveLanguageDisplayName?: ResolveLanguageDisplayName,
): string {
  return resolveLanguageDisplayName?.(languageId, locale) ?? getLanguageDisplayName(languageId, locale);
}