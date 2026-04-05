import { iso6393 } from 'iso-639-3';
import {
  getDb,
  type LanguageAliasDocType,
  type LanguageAliasType,
  type LanguageCatalogHistoryAction,
  type LanguageCatalogHistoryDocType,
  type LanguageCatalogReviewStatus,
  type LanguageCatalogSourceType,
  type LanguageCatalogVisibility,
  type LanguageDisplayNameDocType,
  type LanguageDisplayNameRole,
  type LanguageDocType,
  type MultiLangString,
} from '../db';
import {
  normalizeLanguageCatalogRuntimeLabelKey,
  writeLanguageCatalogRuntimeCache,
  type LanguageCatalogRuntimeEntry,
} from '../data/languageCatalogRuntimeCache';
import { GENERATED_LANGUAGE_ALIASES_BY_CODE, GENERATED_LANGUAGE_DISPLAY_NAME_CORE } from '../data/generated/languageNameCatalog.generated';
import { t, type Locale } from '../i18n';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { newId } from '../utils/transcriptionFormatters';

type Iso6393Record = (typeof iso6393)[number];

const ISO_639_3_BY_CODE = new Map<string, Iso6393Record>(
  iso6393
    .filter((entry) => entry.iso6393.trim().length > 0)
    .map((entry) => [entry.iso6393.toLowerCase(), entry] as const),
);

export type LanguageCatalogEntryKind = 'built-in' | 'override' | 'custom';

export type LanguageCatalogDisplayNameEntry = {
  id?: string;
  locale: string;
  role: LanguageDisplayNameRole;
  value: string;
  isPreferred?: boolean;
  sourceType: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  persisted: boolean;
};

export type LanguageCatalogEntry = {
  id: string;
  entryKind: LanguageCatalogEntryKind;
  hasPersistedRecord: boolean;
  languageCode: string;
  canonicalTag?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6393?: string;
  glottocode?: string;
  wikidataId?: string;
  englishName: string;
  localName: string;
  nativeName?: string;
  aliases: string[];
  scope?: LanguageDocType['scope'];
  family?: string;
  subfamily?: string;
  macrolanguage?: string;
  languageType?: LanguageDocType['languageType'];
  modality?: LanguageDocType['modality'];
  sourceType: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  visibility: LanguageCatalogVisibility;
  notes?: MultiLangString;
  displayNames: LanguageCatalogDisplayNameEntry[];
  updatedAt?: string;
};

export type UpsertLanguageCatalogEntryInput = {
  id?: string;
  languageCode?: string;
  canonicalTag?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6393?: string;
  glottocode?: string;
  wikidataId?: string;
  localName?: string;
  englishName?: string;
  nativeName?: string;
  locale?: string;
  aliases?: string[];
  scope?: LanguageDocType['scope'];
  family?: string;
  subfamily?: string;
  macrolanguage?: string;
  languageType?: LanguageDocType['languageType'];
  modality?: LanguageDocType['modality'];
  visibility?: LanguageCatalogVisibility;
  notes?: MultiLangString;
  reviewStatus?: LanguageCatalogReviewStatus;
  displayNames?: Array<{
    locale: string;
    role: LanguageDisplayNameRole;
    value: string;
    isPreferred?: boolean;
  }>;
  reason?: string;
};

function normalizeLanguageId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeStrings(values: Array<string | undefined>): string[] {
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

function hasOwnField<K extends PropertyKey>(value: object, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function canonicalizeDisplayLocale(locale: string | undefined): string {
  const trimmed = locale?.trim() ?? '';
  const normalized = trimmed.toLowerCase();
  if (!normalized) return '';
  if (normalized === 'eng' || normalized === 'en') return 'en-US';
  if (normalized === 'zho' || normalized === 'zh') return 'zh-CN';
  return trimmed;
}

function sortLanguageCatalogDisplayNames(rows: readonly LanguageCatalogDisplayNameEntry[]): LanguageCatalogDisplayNameEntry[] {
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

function buildProjectedDisplayNames(input: {
  generatedEntry?: typeof GENERATED_LANGUAGE_DISPLAY_NAME_CORE[string];
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
      isPreferred: canonicalizeDisplayLocale(locale) === 'en-US' || canonicalizeDisplayLocale(locale) === 'zh-CN',
      sourceType: input.languageDoc?.sourceType ?? 'user-override',
      reviewStatus: input.languageDoc?.reviewStatus,
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
      reviewStatus: input.languageDoc.reviewStatus,
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

function buildPersistedDisplayNameRows(input: {
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

function slugifyLanguageId(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || newId('lang').replace(/^lang_/, 'entry-');
}

function resolveStoredLanguageId(input: UpsertLanguageCatalogEntryInput): string {
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

  const fallback = input.languageCode ?? input.englishName ?? input.localName ?? input.nativeName ?? newId('lang');
  return `user:${slugifyLanguageId(fallback)}`;
}

function readMultiLangValue(record: MultiLangString | undefined, locale: string): string | undefined {
  if (!record) {
    return undefined;
  }

  const normalizedLocale = locale.toLowerCase();
  const direct = record[locale] ?? record[normalizedLocale];
  if (direct?.trim()) {
    return direct.trim();
  }

  const languagePrefix = normalizedLocale.split('-')[0] ?? normalizedLocale;
  const prefixed = Object.entries(record)
    .find(([key, value]) => key.toLowerCase() === languagePrefix || key.toLowerCase().startsWith(`${languagePrefix}-`))?.[1];
  if (prefixed?.trim()) {
    return prefixed.trim();
  }

  const englishFallback = record.eng ?? record.en ?? record['en-US'];
  if (englishFallback?.trim()) {
    return englishFallback.trim();
  }

  return Object.values(record).find((value) => value.trim().length > 0)?.trim();
}

function pickDisplayName(
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
      else if (rowLocale === localePrefix || rowLocale.startsWith(`${localePrefix}-`)) localeScore = 1;
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

function buildBaselineCodes(): string[] {
  return Object.keys(GENERATED_LANGUAGE_DISPLAY_NAME_CORE).sort();
}

function buildRuntimeCacheEntry(input: {
  language: LanguageDocType;
  displayNames: readonly LanguageDisplayNameDocType[];
  aliases: readonly LanguageAliasDocType[];
}): LanguageCatalogRuntimeEntry {
  const byLocale: Record<string, string> = {};
  Object.entries(input.language.name).forEach(([locale, value]) => {
    if (value.trim().length > 0) {
      byLocale[locale] = value.trim();
    }
  });
  input.displayNames.forEach((row) => {
    if (row.locale !== 'native' && row.value.trim().length > 0) {
      byLocale[row.locale] = row.value.trim();
    }
  });

  const english = pickDisplayName(input.displayNames, 'en-US', ['preferred', 'menu', 'exonym', 'academic'])
    ?? readMultiLangValue(input.language.name, 'en-US');
  const native = pickDisplayName(input.displayNames, 'native', ['autonym'])
    ?? normalizeOptionalValue(input.language.autonym);
  const aliases = dedupeStrings([
    ...input.aliases.map((row) => row.alias),
  ]);

  return {
    ...(input.language.languageCode?.trim() ? { languageCode: input.language.languageCode.trim().toLowerCase() } : {}),
    ...(input.language.canonicalTag?.trim() ? { canonicalTag: input.language.canonicalTag.trim() } : {}),
    ...(input.language.iso6391?.trim() ? { iso6391: input.language.iso6391.trim().toLowerCase() } : {}),
    ...(input.language.iso6392B?.trim() ? { iso6392B: input.language.iso6392B.trim().toLowerCase() } : {}),
    ...(input.language.iso6392T?.trim() ? { iso6392T: input.language.iso6392T.trim().toLowerCase() } : {}),
    ...(input.language.iso6393?.trim() ? { iso6393: input.language.iso6393.trim().toLowerCase() } : {}),
    ...(english ? { english } : {}),
    ...(native ? { native } : {}),
    ...(Object.keys(byLocale).length > 0 ? { byLocale } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    visibility: input.language.visibility ?? 'visible',
  };
}

async function rebuildLanguageCatalogRuntimeCache(): Promise<void> {
  const db = await getDb();
  const [languages, displayNames, aliases] = await Promise.all([
    db.dexie.languages.toArray(),
    db.dexie.language_display_names.toArray(),
    db.dexie.language_aliases.toArray(),
  ]);

  const displayNamesByLanguageId = new Map<string, LanguageDisplayNameDocType[]>();
  const aliasesByLanguageId = new Map<string, LanguageAliasDocType[]>();

  displayNames.forEach((row) => {
    const bucket = displayNamesByLanguageId.get(row.languageId) ?? [];
    bucket.push(row);
    displayNamesByLanguageId.set(row.languageId, bucket);
  });
  aliases.forEach((row) => {
    const bucket = aliasesByLanguageId.get(row.languageId) ?? [];
    bucket.push(row);
    aliasesByLanguageId.set(row.languageId, bucket);
  });

  const entries = Object.fromEntries(languages.map((language) => {
    const entry = buildRuntimeCacheEntry({
      language,
      displayNames: displayNamesByLanguageId.get(language.id) ?? [],
      aliases: aliasesByLanguageId.get(language.id) ?? [],
    });
    return [language.id, entry] as const;
  }));

  const aliasToId = Object.fromEntries(
    languages.flatMap((language) => {
      if ((language.visibility ?? 'visible') === 'hidden') {
        return [] as Array<[string, string]>;
      }

      return (aliasesByLanguageId.get(language.id) ?? [])
        .map((row) => [normalizeLanguageCatalogRuntimeLabelKey(row.alias), language.id] as [string, string])
        .filter(([alias]) => alias.length > 0);
    }),
  );
  const lookupToId = Object.fromEntries(
    languages.flatMap((language) => {
      const lookupKeys = dedupeStrings([
        language.id,
        language.languageCode,
        language.canonicalTag,
        language.iso6391,
        language.iso6392B,
        language.iso6392T,
        language.iso6393,
      ]);
      return lookupKeys.map((lookupKey) => [normalizeLanguageCatalogRuntimeLabelKey(lookupKey), language.id] as const);
    }),
  );

  writeLanguageCatalogRuntimeCache({
    entries,
    aliasToId,
    lookupToId,
    updatedAt: new Date().toISOString(),
  });
}

function buildHistoryRecord(input: {
  languageId: string;
  action: LanguageCatalogHistoryAction;
  summary: string;
  changedFields?: string[];
  reason?: string;
  sourceType?: LanguageCatalogSourceType;
  snapshot?: Record<string, unknown>;
}): LanguageCatalogHistoryDocType {
  return {
    id: newId('langhist'),
    languageId: input.languageId,
    action: input.action,
    summary: input.summary,
    ...(input.changedFields && input.changedFields.length > 0 ? { changedFields: input.changedFields } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    sourceType: input.sourceType,
    snapshot: input.snapshot,
    actorType: 'human',
    createdAt: new Date().toISOString(),
  };
}

function projectLanguageCatalogEntry(input: {
  languageId: string;
  locale: Locale;
  languageDoc?: LanguageDocType;
  displayNames: readonly LanguageDisplayNameDocType[];
  aliases: readonly LanguageAliasDocType[];
}): LanguageCatalogEntry {
  const isoRecord = ISO_639_3_BY_CODE.get(input.languageId);
  const generated = GENERATED_LANGUAGE_DISPLAY_NAME_CORE[input.languageId];
  const builtInAliases = GENERATED_LANGUAGE_ALIASES_BY_CODE[input.languageId] ?? [];
  const languageDoc = input.languageDoc;
  const projectedDisplayNames = buildProjectedDisplayNames({
    generatedEntry: generated,
    languageDoc,
    displayNames: input.displayNames,
  });
  const entryKind: LanguageCatalogEntryKind = input.languageId.startsWith('user:') || languageDoc?.sourceType === 'user-custom'
    ? 'custom'
    : (languageDoc ? 'override' : 'built-in');
  const hasPersistedRecord = Boolean(languageDoc) || input.displayNames.length > 0 || input.aliases.length > 0;
  const englishName = pickDisplayName(input.displayNames, 'en-US', ['preferred', 'menu', 'exonym', 'academic'])
    ?? readMultiLangValue(languageDoc?.name, 'en-US')
    ?? generated?.english
    ?? isoRecord?.name
    ?? input.languageId;
  const localName = pickDisplayName(input.displayNames, input.locale, ['preferred', 'menu', 'exonym', 'academic'])
    ?? readMultiLangValue(languageDoc?.name, input.locale)
    ?? generated?.byLocale?.[input.locale]
    ?? englishName;
  const nativeName = pickDisplayName(input.displayNames, 'native', ['autonym'])
    ?? normalizeOptionalValue(languageDoc?.autonym)
    ?? normalizeOptionalValue(generated?.native);
  const aliases = dedupeStrings([
    ...builtInAliases,
    ...input.aliases.map((row) => row.alias),
  ]);
  const sourceType = languageDoc?.sourceType
    ?? (generated ? 'built-in-generated' : 'user-custom');

  return {
    id: input.languageId,
    entryKind,
    hasPersistedRecord,
    languageCode: languageDoc?.languageCode ?? languageDoc?.iso6393 ?? input.languageId,
    canonicalTag: languageDoc?.canonicalTag,
    iso6391: languageDoc?.iso6391 ?? isoRecord?.iso6391,
    iso6392B: languageDoc?.iso6392B ?? isoRecord?.iso6392B,
    iso6392T: languageDoc?.iso6392T ?? isoRecord?.iso6392T,
    iso6393: languageDoc?.iso6393 ?? isoRecord?.iso6393 ?? (isKnownIso639_3Code(input.languageId) ? input.languageId : undefined),
    glottocode: languageDoc?.glottocode,
    wikidataId: languageDoc?.wikidataId,
    englishName,
    localName,
    ...(nativeName ? { nativeName } : {}),
    aliases,
    scope: languageDoc?.scope ?? isoRecord?.scope,
    family: languageDoc?.family,
    subfamily: languageDoc?.subfamily,
    macrolanguage: languageDoc?.macrolanguage ?? isoRecord?.macrolanguage,
    languageType: languageDoc?.languageType ?? isoRecord?.type,
    modality: languageDoc?.modality,
    sourceType,
    reviewStatus: languageDoc?.reviewStatus,
    visibility: languageDoc?.visibility ?? 'visible',
    notes: languageDoc?.notes,
    displayNames: projectedDisplayNames,
    updatedAt: languageDoc?.updatedAt,
  };
}

async function readLanguageCatalogProjection(locale: Locale, includeHidden = false): Promise<LanguageCatalogEntry[]> {
  const db = await getDb();
  const [languages, displayNames, aliases] = await Promise.all([
    db.dexie.languages.toArray(),
    db.dexie.language_display_names.toArray(),
    db.dexie.language_aliases.toArray(),
  ]);

  const languageIds = new Set<string>([
    ...buildBaselineCodes(),
    ...languages.map((row) => row.id),
    ...displayNames.map((row) => row.languageId),
    ...aliases.map((row) => row.languageId),
  ]);

  const languageById = new Map(languages.map((row) => [row.id, row] as const));
  const displayNamesByLanguageId = new Map<string, LanguageDisplayNameDocType[]>();
  const aliasesByLanguageId = new Map<string, LanguageAliasDocType[]>();

  displayNames.forEach((row) => {
    const bucket = displayNamesByLanguageId.get(row.languageId) ?? [];
    bucket.push(row);
    displayNamesByLanguageId.set(row.languageId, bucket);
  });

  aliases.forEach((row) => {
    const bucket = aliasesByLanguageId.get(row.languageId) ?? [];
    bucket.push(row);
    aliasesByLanguageId.set(row.languageId, bucket);
  });

  const projected = Array.from(languageIds)
    .map((languageId) => projectLanguageCatalogEntry({
      languageId,
      locale,
      languageDoc: languageById.get(languageId),
      displayNames: displayNamesByLanguageId.get(languageId) ?? [],
      aliases: aliasesByLanguageId.get(languageId) ?? [],
    }));

  // 管理视图需要包含隐藏条目 | Management views need hidden entries
  const filtered = includeHidden ? projected : projected.filter((entry) => entry.visibility !== 'hidden');

  return filtered
    .sort((left, right) => {
      const labelDiff = left.localName.localeCompare(right.localName, locale);
      if (labelDiff !== 0) return labelDiff;
      return left.id.localeCompare(right.id);
    });
}

export async function listLanguageCatalogEntries(input: {
  locale: Locale;
  searchText?: string;
  includeHidden?: boolean;
}): Promise<LanguageCatalogEntry[]> {
  const entries = await readLanguageCatalogProjection(input.locale, input.includeHidden);
  await rebuildLanguageCatalogRuntimeCache();

  const normalizedSearch = input.searchText?.trim().toLowerCase();
  if (!normalizedSearch) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.id,
      entry.languageCode,
      entry.canonicalTag,
      entry.iso6391,
      entry.iso6392B,
      entry.iso6392T,
      entry.iso6393,
      entry.englishName,
      entry.localName,
      entry.nativeName,
      entry.family,
      entry.subfamily,
      entry.glottocode,
      entry.wikidataId,
      ...entry.aliases,
      ...entry.displayNames.map((d) => d.value),
      ...Object.values(entry.notes ?? {}),
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export async function getLanguageCatalogEntry(input: {
  languageId: string;
  locale: Locale;
}): Promise<LanguageCatalogEntry | null> {
  // 包含隐藏条目，否则刚设为 hidden 的条目无法读取 | Include hidden entries so freshly hidden ones are still accessible
  const entries = await readLanguageCatalogProjection(input.locale, true);
  return entries.find((entry) => entry.id === input.languageId) ?? null;
}

export async function upsertLanguageCatalogEntry(input: UpsertLanguageCatalogEntryInput): Promise<LanguageCatalogEntry> {
  const db = await getDb();
  const languageId = resolveStoredLanguageId(input);
  const now = new Date().toISOString();
  const existing = await db.dexie.languages.get(languageId);
  const nextSourceType: LanguageCatalogSourceType = languageId.startsWith('user:')
    ? 'user-custom'
    : existing?.sourceType ?? 'user-override';
  const locale = input.locale ?? 'zh-CN';
  const englishName = normalizeOptionalValue(input.englishName);
  const localName = normalizeOptionalValue(input.localName);
  const nativeName = normalizeOptionalValue(input.nativeName);
  const hasEnglishName = hasOwnField(input, 'englishName');
  const hasLocalName = hasOwnField(input, 'localName');
  const hasNativeName = hasOwnField(input, 'nativeName');
  const hasCanonicalTag = hasOwnField(input, 'canonicalTag');
  const hasIso6391 = hasOwnField(input, 'iso6391');
  const hasIso6392B = hasOwnField(input, 'iso6392B');
  const hasIso6392T = hasOwnField(input, 'iso6392T');
  const hasIso6393 = hasOwnField(input, 'iso6393');
  const hasGlottocode = hasOwnField(input, 'glottocode');
  const hasWikidataId = hasOwnField(input, 'wikidataId');
  const hasScope = hasOwnField(input, 'scope');
  const hasMacrolanguage = hasOwnField(input, 'macrolanguage');
  const hasFamily = hasOwnField(input, 'family');
  const hasSubfamily = hasOwnField(input, 'subfamily');
  const hasModality = hasOwnField(input, 'modality');
  const hasLanguageType = hasOwnField(input, 'languageType');

  const mergedName: MultiLangString = {
    ...(existing?.name ?? {}),
  };
  if (hasEnglishName) {
    delete mergedName.eng;
    delete mergedName.en;
    delete mergedName['en-US'];
    if (englishName) {
      mergedName.eng = englishName;
      mergedName['en-US'] = englishName;
    }
  }
  if (hasLocalName) {
    delete mergedName[locale];
    if (localName) {
      mergedName[locale] = localName;
    }
  }

  const nextLanguage: LanguageDocType = {
    id: languageId,
    name: mergedName,
    languageCode: normalizeOptionalValue(input.languageCode) ?? normalizeOptionalValue(input.iso6393) ?? languageId,
    ...(!hasCanonicalTag && existing?.canonicalTag ? { canonicalTag: existing.canonicalTag } : {}),
    ...(hasCanonicalTag ? (normalizeOptionalValue(input.canonicalTag) ? { canonicalTag: normalizeOptionalValue(input.canonicalTag) } : {}) : {}),
    ...(!hasIso6391 && existing?.iso6391 ? { iso6391: existing.iso6391 } : {}),
    ...(hasIso6391 ? (normalizeOptionalValue(input.iso6391) ? { iso6391: normalizeOptionalValue(input.iso6391) } : {}) : {}),
    ...(!hasIso6392B && existing?.iso6392B ? { iso6392B: existing.iso6392B } : {}),
    ...(hasIso6392B ? (normalizeOptionalValue(input.iso6392B) ? { iso6392B: normalizeOptionalValue(input.iso6392B) } : {}) : {}),
    ...(!hasIso6392T && existing?.iso6392T ? { iso6392T: existing.iso6392T } : {}),
    ...(hasIso6392T ? (normalizeOptionalValue(input.iso6392T) ? { iso6392T: normalizeOptionalValue(input.iso6392T) } : {}) : {}),
    ...(!hasIso6393 && existing?.iso6393 ? { iso6393: existing.iso6393 } : {}),
    ...(hasIso6393 ? (normalizeOptionalValue(input.iso6393) ? { iso6393: normalizeOptionalValue(input.iso6393) } : {}) : {}),
    ...(!hasNativeName && existing?.autonym ? { autonym: existing.autonym } : {}),
    ...(hasNativeName ? (nativeName ? { autonym: nativeName } : {}) : {}),
    ...(!hasGlottocode && existing?.glottocode ? { glottocode: existing.glottocode } : {}),
    ...(hasGlottocode ? (normalizeOptionalValue(input.glottocode) ? { glottocode: normalizeOptionalValue(input.glottocode) } : {}) : {}),
    ...(!hasWikidataId && existing?.wikidataId ? { wikidataId: existing.wikidataId } : {}),
    ...(hasWikidataId ? (normalizeOptionalValue(input.wikidataId) ? { wikidataId: normalizeOptionalValue(input.wikidataId) } : {}) : {}),
    ...(!hasScope && existing?.scope ? { scope: existing.scope } : {}),
    ...(hasScope ? (input.scope ? { scope: input.scope } : {}) : {}),
    ...(!hasMacrolanguage && existing?.macrolanguage ? { macrolanguage: existing.macrolanguage } : {}),
    ...(hasMacrolanguage ? (normalizeOptionalValue(input.macrolanguage) ? { macrolanguage: normalizeOptionalValue(input.macrolanguage) } : {}) : {}),
    ...(!hasFamily && existing?.family ? { family: existing.family } : {}),
    ...(hasFamily ? (normalizeOptionalValue(input.family) ? { family: normalizeOptionalValue(input.family) } : {}) : {}),
    ...(!hasSubfamily && existing?.subfamily ? { subfamily: existing.subfamily } : {}),
    ...(hasSubfamily ? (normalizeOptionalValue(input.subfamily) ? { subfamily: normalizeOptionalValue(input.subfamily) } : {}) : {}),
    ...(!hasModality && existing?.modality ? { modality: existing.modality } : {}),
    ...(hasModality ? (input.modality ? { modality: input.modality } : {}) : {}),
    ...(!hasLanguageType && existing?.languageType ? { languageType: existing.languageType } : {}),
    ...(hasLanguageType ? (input.languageType ? { languageType: input.languageType } : {}) : {}),
    sourceType: nextSourceType,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : existing?.reviewStatus ? { reviewStatus: existing.reviewStatus } : {}),
    visibility: input.visibility ?? existing?.visibility ?? 'visible',
    ...(input.notes ? { notes: input.notes } : existing?.notes ? { notes: existing.notes } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const aliasRows: LanguageAliasDocType[] = dedupeStrings(input.aliases ?? []).map((alias) => ({
    id: newId('langalias'),
    languageId,
    alias,
    normalizedAlias: normalizeLanguageCatalogRuntimeLabelKey(alias),
    aliasType: 'search',
    sourceType: nextSourceType,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
    createdAt: now,
    updatedAt: now,
  }));

  const displayRows = buildPersistedDisplayNameRows({
    languageId,
    locale,
    ...(englishName ? { englishName } : {}),
    ...(localName ? { localName } : {}),
    ...(nativeName ? { nativeName } : {}),
    ...(input.displayNames ? { displayNames: input.displayNames } : {}),
    sourceType: nextSourceType,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
    createdAt: now,
  });

  await db.dexie.transaction('rw', db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases, db.dexie.language_catalog_history, async () => {
    await db.dexie.languages.put(nextLanguage);
    await db.dexie.language_display_names.where('languageId').equals(languageId).delete();
    await db.dexie.language_aliases.where('languageId').equals(languageId).delete();
    if (displayRows.length > 0) {
      await db.dexie.language_display_names.bulkPut(displayRows);
    }
    if (aliasRows.length > 0) {
      await db.dexie.language_aliases.bulkPut(aliasRows);
    }
    await db.dexie.language_catalog_history.put(buildHistoryRecord({
      languageId,
      action: existing ? 'update' : 'create',
      summary: t(locale as Locale, existing ? 'service.languageCatalog.historyUpdate' : 'service.languageCatalog.historyCreate'),
      changedFields: ['languages', 'language_display_names', 'language_aliases'],
      reason: input.reason,
      sourceType: nextSourceType,
      snapshot: {
        language: nextLanguage,
        displayNames: displayRows,
        aliases: aliasRows,
      },
    }));
  });

  await rebuildLanguageCatalogRuntimeCache();

  return (await getLanguageCatalogEntry({ languageId, locale: locale as Locale })) as LanguageCatalogEntry;
}

export async function deleteLanguageCatalogEntry(input: {
  languageId: string;
  reason?: string;
  locale: Locale;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.dexie.languages.get(input.languageId);
  if (!existing) {
    throw new Error(t(input.locale, 'service.languageCatalog.deleteMissingPersisted'));
  }

  await db.dexie.transaction('rw', db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases, db.dexie.language_catalog_history, async () => {
    await db.dexie.languages.delete(input.languageId);
    await db.dexie.language_display_names.where('languageId').equals(input.languageId).delete();
    await db.dexie.language_aliases.where('languageId').equals(input.languageId).delete();
    await db.dexie.language_catalog_history.put(buildHistoryRecord({
      languageId: input.languageId,
      action: 'delete',
      summary: t(input.locale, existing.sourceType === 'user-custom' ? 'service.languageCatalog.historyDeleteCustom' : 'service.languageCatalog.historyDeleteOverride'),
      reason: input.reason,
      sourceType: existing.sourceType,
      snapshot: { language: existing },
    }));
  });

  await rebuildLanguageCatalogRuntimeCache();
}

export async function listLanguageCatalogHistory(languageId: string): Promise<LanguageCatalogHistoryDocType[]> {
  const db = await getDb();
  return db.dexie.language_catalog_history
    .where('languageId')
    .equals(languageId)
    .reverse()
    .sortBy('createdAt');
}