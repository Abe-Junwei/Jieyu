export const LANGUAGE_NAME_QUERY_LOCALES = ['zh-CN', 'en-US', 'fr-FR', 'es-ES', 'de-DE'] as const;

export type LanguageNameQueryLocale = (typeof LANGUAGE_NAME_QUERY_LOCALES)[number];

export type LanguageQueryLabelKind = 'local' | 'native' | 'english' | 'alias';

export type LanguageQueryLabelEntry = {
  label: string;
  kind: LanguageQueryLabelKind;
};

export type LanguageDisplayCoreEntry = {
  english: string;
  native?: string;
  byLocale?: Partial<Record<LanguageNameQueryLocale, string>>;
  /** Glottolog 纬度 | Glottolog latitude */
  latitude?: number;
  /** Glottolog 经度 | Glottolog longitude */
  longitude?: number;
};

export type LanguageQueryIndexLocaleRecord = Readonly<Record<string, readonly LanguageQueryLabelEntry[]>>;

export type LanguageAliasToCodeRecord = Readonly<Record<string, string>>;

export type LanguageAliasesByCodeRecord = Readonly<Record<string, readonly string[]>>;