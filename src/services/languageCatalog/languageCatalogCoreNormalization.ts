import {
  getBaselineGeneratedLanguageIds,
  normalizeLanguageCatalogRuntimeLabelKey,
  type LanguageCatalogRuntimeEntry,
} from '../../data/languageCatalogRuntimeCache';
import {
  LANGUAGE_NAME_QUERY_LOCALES,
  type LanguageDisplayCoreEntry,
  type LanguageNameQueryLocale,
} from '../../data/languageNameTypes';
import { t, type Locale } from '../../i18n';
import { isKnownIso639_3Code } from '../../utils/langMapping';
import { newId } from '../../utils/transcriptionFormatters';
import type {
  LanguageCatalogDisplayNameEntry,
  LanguageCatalogEntry,
  UpsertLanguageCatalogEntryInput,
} from './languageCatalogTypes';
import type {
  LanguageCatalogReviewStatus,
  LanguageCatalogSourceType,
  LanguageDisplayNameDocType,
  LanguageDisplayNameRole,
  LanguageDocType,
  MultiLangString,
} from '../../db';

export function flattenCustomFieldSearchValues(
  customFields?: LanguageDocType['customFields'],
): string[] {
  if (!customFields) {
    return [];
  }

  return Object.values(customFields).flatMap((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return [String(value)];
    }
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    return [];
  });
}

export const HIGH_AMBIGUITY_LANGUAGE_ALIASES = new Set(['chinese', '中文']);

export function normalizeLanguageId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.normalize('NFKC').toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(trimmed);
  });

  return result;
}
export function hasOwnField<K extends PropertyKey>(value: object, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizeIsoAlphaCode(
  value: string | undefined,
  length: 2 | 3,
  locale: Locale,
  dictKey: Parameters<typeof t>[1],
): string | undefined {
  const trimmed = normalizeOptionalValue(value)?.toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (!new RegExp(`^[a-z]{${length}}$`).test(trimmed)) {
    throw new Error(t(locale, dictKey));
  }
  return trimmed;
}
export function normalizeCanonicalTag(
  value: string | undefined,
  locale: Locale,
): string | undefined {
  const trimmed = normalizeOptionalValue(value)?.replace(/_/g, '-');
  if (!trimmed) {
    return undefined;
  }

  try {
    return Intl.getCanonicalLocales(trimmed)[0];
  } catch {
    throw new Error(t(locale, 'service.languageCatalog.invalidCanonicalTag'));
  }
}
export function canonicalizeDisplayLocale(locale: string | undefined): string {
  const trimmed = locale?.trim() ?? '';
  const normalized = trimmed.toLowerCase();
  if (!normalized) return '';
  if (normalized === 'eng' || normalized === 'en') return 'en-US';
  if (normalized === 'zho' || normalized === 'zh') return 'zh-CN';
  return trimmed;
}
export function normalizeValidatedDisplayLocale(value: string, locale: Locale): string {
  const normalized = canonicalizeDisplayLocale(value);
  if (!normalized) {
    throw new Error(t(locale, 'service.languageCatalog.invalidDisplayLocale'));
  }
  if (normalized === 'native' || normalized === 'global' || normalized === 'und') {
    return normalized;
  }

  try {
    return Intl.getCanonicalLocales(normalized)[0] ?? normalized;
  } catch {
    throw new Error(t(locale, 'service.languageCatalog.invalidDisplayLocale'));
  }
}
export function sortLanguageCatalogDisplayNames(
  rows: readonly LanguageCatalogDisplayNameEntry[],
): LanguageCatalogDisplayNameEntry[] {
  const roleOrder: Record<LanguageDisplayNameRole, number> = {
    preferred: 0,
    autonym: 1,
    menu: 2,
    exonym: 3,
    academic: 4,
    historical: 5,
    search: 6,
  };

  const localeWeight = (locale: string): number => {
    if (locale === 'native') return 0;
    if (locale === 'zh-CN') return 1;
    if (locale === 'en-US') return 2;
    return 3;
  };

  return [...rows].sort((left, right) => {
    const localeDiff = localeWeight(left.locale) - localeWeight(right.locale);
    if (localeDiff !== 0) return localeDiff;

    const localeLabelDiff = left.locale.localeCompare(right.locale);
    if (localeLabelDiff !== 0) return localeLabelDiff;

    const roleDiff = roleOrder[left.role] - roleOrder[right.role];
    if (roleDiff !== 0) return roleDiff;

    if (Boolean(left.isPreferred) !== Boolean(right.isPreferred)) {
      return left.isPreferred ? -1 : 1;
    }

    return left.value.localeCompare(right.value);
  });
}

export function buildProjectedDisplayNames(input: {
  generatedEntry?: LanguageDisplayCoreEntry;
  languageDoc?: LanguageDocType;
  displayNames: readonly LanguageDisplayNameDocType[];
}): LanguageCatalogDisplayNameEntry[] {
  const rows = new Map<string, LanguageCatalogDisplayNameEntry>();

  const insert = (row: LanguageCatalogDisplayNameEntry) => {
    const locale = canonicalizeDisplayLocale(row.locale);
    const value = row.value.trim();
    if (!locale || !value) {
      return;
    }
    const key = `${locale.toLowerCase()}::${row.role}::${normalizeLanguageCatalogRuntimeLabelKey(value)}`;
    rows.set(key, {
      ...row,
      locale,
      value,
    });
  };

  Object.entries(input.generatedEntry?.byLocale ?? {}).forEach(([locale, value]) => {
    insert({
      locale,
      role: 'preferred',
      value,
      isPreferred: locale === 'en-US' || locale === 'zh-CN',
      sourceType: 'built-in-generated',
      persisted: false,
    });
  });

  if (input.generatedEntry?.native) {
    insert({
      locale: 'native',
      role: 'autonym',
      value: input.generatedEntry.native,
      isPreferred: true,
      sourceType: 'built-in-generated',
      persisted: false,
    });
  }

  Object.entries(input.languageDoc?.name ?? {}).forEach(([locale, value]) => {
    insert({
      locale,
      role: 'preferred',
      value,
      isPreferred:
        canonicalizeDisplayLocale(locale) === 'en-US' ||
        canonicalizeDisplayLocale(locale) === 'zh-CN',
      sourceType: input.languageDoc?.sourceType ?? 'user-override',
      ...(input.languageDoc?.reviewStatus ? { reviewStatus: input.languageDoc.reviewStatus } : {}),
      persisted: Boolean(input.languageDoc),
    });
  });

  if (input.languageDoc?.autonym) {
    insert({
      locale: 'native',
      role: 'autonym',
      value: input.languageDoc.autonym,
      isPreferred: true,
      sourceType: input.languageDoc.sourceType ?? 'user-override',
      ...(input.languageDoc.reviewStatus ? { reviewStatus: input.languageDoc.reviewStatus } : {}),
      persisted: true,
    });
  }

  input.displayNames.forEach((row) => {
    insert({
      id: row.id,
      locale: row.locale,
      role: row.role,
      value: row.value,
      ...(row.isPreferred ? { isPreferred: row.isPreferred } : {}),
      sourceType: row.sourceType,
      ...(row.reviewStatus ? { reviewStatus: row.reviewStatus } : {}),
      persisted: true,
    });
  });

  return sortLanguageCatalogDisplayNames(Array.from(rows.values()));
}

export function buildPersistedDisplayNameRows(input: {
  languageId: string;
  locale: string;
  englishName?: string;
  localName?: string;
  nativeName?: string;
  displayNames?: UpsertLanguageCatalogEntryInput['displayNames'];
  sourceType: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  createdAt: string;
}): LanguageDisplayNameDocType[] {
  const seen = new Set<string>();
  const rows: LanguageDisplayNameDocType[] = [];
  const push = (row: {
    locale: string;
    role: LanguageDisplayNameRole;
    value: string;
    isPreferred?: boolean;
  }) => {
    const locale = canonicalizeDisplayLocale(row.locale);
    const value = row.value.trim();
    if (!locale || !value) {
      return;
    }
    const key = `${locale.toLowerCase()}::${row.role}::${normalizeLanguageCatalogRuntimeLabelKey(value)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rows.push({
      id: newId('langname'),
      languageId: input.languageId,
      locale,
      role: row.role,
      value,
      ...(row.isPreferred ? { isPreferred: row.isPreferred } : {}),
      sourceType: input.sourceType,
      ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  };

  if (input.localName) {
    push({ locale: input.locale, role: 'preferred', value: input.localName, isPreferred: true });
  }
  if (input.englishName) {
    push({ locale: 'en-US', role: 'preferred', value: input.englishName, isPreferred: true });
  }
  if (input.nativeName) {
    push({ locale: 'native', role: 'autonym', value: input.nativeName, isPreferred: true });
  }
  input.displayNames?.forEach((row) => {
    push({
      locale: row.locale,
      role: row.role,
      value: row.value,
      ...(row.isPreferred ? { isPreferred: row.isPreferred } : {}),
    });
  });

  return rows;
}
export function slugifyLanguageId(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || newId('lang').replace(/^lang_/, 'entry-');
}

/** 4 位确定性短哈希，基于字符串内容 | 4-char deterministic short hash from string content */
export function shortHash4(value: string): string {
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return (h >>> 0).toString(16).slice(-4).padStart(4, '0');
}

export function resolveStoredLanguageId(input: UpsertLanguageCatalogEntryInput): string {
  const explicitId = normalizeLanguageId(input.id);
  const normalizedLanguageCode = normalizeLanguageId(input.languageCode ?? input.iso6393);

  if (explicitId.startsWith('user:')) {
    return explicitId;
  }
  // 显式 ID 优先，编辑现有条目时不会因 languageCode 变更而改写目标 | Explicit ID first so editing an entry won't silently save to a different entry when languageCode changes
  if (explicitId && isKnownIso639_3Code(explicitId)) {
    return explicitId;
  }
  if (normalizedLanguageCode && isKnownIso639_3Code(normalizedLanguageCode)) {
    return normalizedLanguageCode;
  }
  if (explicitId) {
    return `user:${slugifyLanguageId(explicitId)}`;
  }

  // 留空时自动生成 user:{slug}-{4位hash}，human-readable 且有区别性 | Auto-generate user:{slug}-{4-char hash} when left empty
  const nameSeed =
    input.englishName?.trim() ||
    input.localName?.trim() ||
    input.nativeName?.trim() ||
    input.languageCode?.trim() ||
    '';
  if (nameSeed) {
    const slug = slugifyLanguageId(nameSeed);
    const hash = shortHash4(nameSeed.toLowerCase());
    return `user:${slug}-${hash}`;
  }

  return `user:${newId('lang').replace(/^lang_/, 'entry-')}`;
}
export function readMultiLangValue(
  record: MultiLangString | undefined,
  locale: string,
): string | undefined {
  if (!record) {
    return undefined;
  }

  const normalizedLocale = locale.toLowerCase();
  const direct = record[locale] ?? record[normalizedLocale];
  if (direct?.trim()) {
    return direct.trim();
  }

  const languagePrefix = normalizedLocale.split('-')[0] ?? normalizedLocale;
  const prefixed = Object.entries(record).find(
    ([key, _value]) =>
      key.toLowerCase() === languagePrefix || key.toLowerCase().startsWith(`${languagePrefix}-`),
  )?.[1];
  if (prefixed?.trim()) {
    return prefixed.trim();
  }

  const englishFallback = record.eng ?? record.en ?? record['en-US'];
  if (englishFallback?.trim()) {
    return englishFallback.trim();
  }

  return Object.values(record)
    .find((value) => value.trim().length > 0)
    ?.trim();
}

export function pickDisplayName(
  rows: readonly LanguageDisplayNameDocType[],
  locale: string,
  roles: readonly LanguageDisplayNameRole[],
): string | undefined {
  const normalizedLocale = locale.toLowerCase();
  const localePrefix = normalizedLocale.split('-')[0] ?? normalizedLocale;
  const roleRank = new Map(roles.map((role, index) => [role, index]));

  const ranked = rows
    .filter((row) => roles.includes(row.role))
    .map((row) => {
      const rowLocale = row.locale.toLowerCase();
      let localeScore = 3;
      if (rowLocale === normalizedLocale) localeScore = 0;
      else if (rowLocale === localePrefix || rowLocale.startsWith(`${localePrefix}-`))
        localeScore = 1;
      else if (rowLocale === 'und' || rowLocale === 'global') localeScore = 2;

      return {
        row,
        roleScore: roleRank.get(row.role) ?? roles.length,
        localeScore,
      };
    })
    .sort((left, right) => {
      const localeDiff = left.localeScore - right.localeScore;
      if (localeDiff !== 0) return localeDiff;

      if (Boolean(left.row.isPreferred) !== Boolean(right.row.isPreferred)) {
        return left.row.isPreferred ? -1 : 1;
      }

      const roleDiff = left.roleScore - right.roleScore;
      if (roleDiff !== 0) return roleDiff;

      return left.row.updatedAt.localeCompare(right.row.updatedAt);
    });

  return ranked[0]?.row.value.trim();
}

export function buildBaselineCodes(): string[] {
  return [...getBaselineGeneratedLanguageIds()];
}

export function normalizeRequestedLanguageIds(
  languageIds: readonly string[] | undefined,
): string[] | undefined {
  if (!languageIds) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalizedIds: string[] = [];
  languageIds.forEach((languageId) => {
    const normalizedId = normalizeLanguageId(languageId);
    if (!normalizedId || seen.has(normalizedId)) {
      return;
    }
    seen.add(normalizedId);
    normalizedIds.push(normalizedId);
  });

  return normalizedIds;
}

export function pickRuntimeSnapshotBaseEntry(
  entryByLocale: Partial<Record<LanguageNameQueryLocale, LanguageCatalogEntry>>,
): LanguageCatalogEntry | undefined {
  for (const locale of LANGUAGE_NAME_QUERY_LOCALES) {
    const entry = entryByLocale[locale];
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

export function buildRuntimeCacheEntry(
  entryByLocale: Partial<Record<LanguageNameQueryLocale, LanguageCatalogEntry>>,
): LanguageCatalogRuntimeEntry | null {
  const baseEntry = pickRuntimeSnapshotBaseEntry(entryByLocale);
  if (!baseEntry) {
    return null;
  }

  const byLocale = Object.fromEntries(
    LANGUAGE_NAME_QUERY_LOCALES.map(
      (locale) => [locale, entryByLocale[locale]?.localName?.trim() ?? ''] as const,
    ).filter(([, value]) => value.length > 0),
  );
  const aliases = dedupeStrings(baseEntry.aliases);

  return {
    ...(baseEntry.languageCode.trim()
      ? { languageCode: baseEntry.languageCode.trim().toLowerCase() }
      : {}),
    ...(baseEntry.canonicalTag?.trim() ? { canonicalTag: baseEntry.canonicalTag.trim() } : {}),
    ...(baseEntry.iso6391?.trim() ? { iso6391: baseEntry.iso6391.trim().toLowerCase() } : {}),
    ...(baseEntry.iso6392B?.trim() ? { iso6392B: baseEntry.iso6392B.trim().toLowerCase() } : {}),
    ...(baseEntry.iso6392T?.trim() ? { iso6392T: baseEntry.iso6392T.trim().toLowerCase() } : {}),
    ...(baseEntry.iso6393?.trim() ? { iso6393: baseEntry.iso6393.trim().toLowerCase() } : {}),
    ...(baseEntry.englishName.trim() ? { english: baseEntry.englishName.trim() } : {}),
    ...(baseEntry.nativeName?.trim() ? { native: baseEntry.nativeName.trim() } : {}),
    ...(Object.keys(byLocale).length > 0 ? { byLocale } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(baseEntry.scope ? { scope: baseEntry.scope } : {}),
    ...(baseEntry.languageType ? { languageType: baseEntry.languageType } : {}),
    ...(baseEntry.macrolanguage?.trim()
      ? { macrolanguage: baseEntry.macrolanguage.trim().toLowerCase() }
      : {}),
    visibility: baseEntry.visibility,
    ...(baseEntry.baselineDistributionCountryCodes?.length
      ? { baselineDistributionCountryCodes: [...baseEntry.baselineDistributionCountryCodes] }
      : {}),
    ...(baseEntry.baselineOfficialCountryCodes?.length
      ? { baselineOfficialCountryCodes: [...baseEntry.baselineOfficialCountryCodes] }
      : {}),
    ...(baseEntry.countriesOfficial?.length
      ? { countriesOfficial: [...baseEntry.countriesOfficial] }
      : {}),
  };
}
