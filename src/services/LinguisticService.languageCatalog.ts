import { iso6393 } from 'iso-639-3';
import {
  getDb,
  type CustomFieldDefinitionDocType,
  type CustomFieldValueType,
  type LanguageAliasDocType,
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
  normalizeLanguageCatalogRuntimeLookupKey,
  writeLanguageCatalogRuntimeCache,
  type LanguageCatalogRuntimeEntry,
} from '../data/languageCatalogRuntimeCache';
import { GENERATED_LANGUAGE_ALIASES_BY_CODE, GENERATED_LANGUAGE_DISPLAY_NAME_CORE } from '../data/generated/languageNameCatalog.generated';
import { LANGUAGE_NAME_QUERY_LOCALES, type LanguageNameQueryLocale } from '../data/languageNameTypes';
import { t, tf, type Locale } from '../i18n';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { newId } from '../utils/transcriptionFormatters';

type Iso6393Record = (typeof iso6393)[number];

const ISO_639_3_BY_CODE = new Map<string, Iso6393Record>(
  iso6393
    .filter((entry) => entry.iso6393.trim().length > 0)
    .map((entry) => [entry.iso6393.toLowerCase(), entry] as const),
);

/**
 * ISO 639-3 种子数据（同步查询） | ISO 639-3 seed data (sync lookup)
 */
export type Iso639_3Seed = {
  name: string;
  iso6391?: string | undefined;
  iso6392B?: string | undefined;
  iso6392T?: string | undefined;
  scope: string;
  type: string;
};

/** 同步查询 ISO 639-3 种子记录 | Synchronously look up an ISO 639-3 seed record */
export function lookupIso639_3Seed(code: string): Iso639_3Seed | undefined {
  return ISO_639_3_BY_CODE.get(code.trim().toLowerCase());
}

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
  genus?: string;
  classificationPath?: string;
  macrolanguage?: string;
  languageType?: LanguageDocType['languageType'];
  modality?: LanguageDocType['modality'];
  endangermentLevel?: LanguageDocType['endangermentLevel'];
  aesStatus?: LanguageDocType['aesStatus'];
  endangermentSource?: string;
  endangermentAssessmentYear?: number;
  speakerCountL1?: number;
  speakerCountL2?: number;
  speakerCountSource?: string;
  speakerCountYear?: number;
  speakerTrend?: LanguageDocType['speakerTrend'];
  countries?: string[];
  macroarea?: LanguageDocType['macroarea'];
  administrativeDivisions?: LanguageDocType['administrativeDivisions'];
  intergenerationalTransmission?: LanguageDocType['intergenerationalTransmission'];
  domains?: LanguageDocType['domains'];
  officialStatus?: LanguageDocType['officialStatus'];
  egids?: string;
  documentationLevel?: LanguageDocType['documentationLevel'];
  dialects?: string[];
  writingSystems?: string[];
  literacyRate?: number;
  latitude?: number;
  longitude?: number;
  customFields?: LanguageDocType['customFields'];
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
  genus?: string;
  classificationPath?: string;
  macrolanguage?: string;
  languageType?: LanguageDocType['languageType'];
  modality?: LanguageDocType['modality'];
  endangermentLevel?: LanguageDocType['endangermentLevel'];
  aesStatus?: LanguageDocType['aesStatus'];
  endangermentSource?: string;
  endangermentAssessmentYear?: number;
  speakerCountL1?: number;
  speakerCountL2?: number;
  speakerCountSource?: string;
  speakerCountYear?: number;
  speakerTrend?: LanguageDocType['speakerTrend'];
  countries?: string[];
  macroarea?: LanguageDocType['macroarea'];
  administrativeDivisions?: LanguageDocType['administrativeDivisions'];
  intergenerationalTransmission?: LanguageDocType['intergenerationalTransmission'];
  domains?: LanguageDocType['domains'];
  officialStatus?: LanguageDocType['officialStatus'];
  egids?: string;
  documentationLevel?: LanguageDocType['documentationLevel'];
  dialects?: string[];
  writingSystems?: string[];
  literacyRate?: number;
  latitude?: number;
  longitude?: number;
  customFields?: LanguageDocType['customFields'];
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

function flattenCustomFieldSearchValues(customFields?: LanguageDocType['customFields']): string[] {
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

const HIGH_AMBIGUITY_LANGUAGE_ALIASES = new Set([
  'chinese',
  '中文',
]);

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

function normalizeIsoAlphaCode(value: string | undefined, length: 2 | 3, locale: Locale, dictKey: Parameters<typeof t>[1]): string | undefined {
  const trimmed = normalizeOptionalValue(value)?.toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (!new RegExp(`^[a-z]{${length}}$`).test(trimmed)) {
    throw new Error(t(locale, dictKey));
  }
  return trimmed;
}

function normalizeCanonicalTag(value: string | undefined, locale: Locale): string | undefined {
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

function normalizeValidatedDisplayLocale(value: string, locale: Locale): string {
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

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeComparableValue(nestedValue)]),
    );
  }
  return value ?? null;
}

function isMeaningfulPatchValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function buildComparableHistoryPatch(entry: LanguageCatalogEntry | null): Record<string, unknown> {
  if (!entry) {
    return {};
  }

  const normalizedDisplayNames = entry.displayNames
    .map((row) => ({
      locale: row.locale,
      role: row.role,
      value: row.value,
      isPreferred: Boolean(row.isPreferred),
      sourceType: row.sourceType,
      ...(row.reviewStatus ? { reviewStatus: row.reviewStatus } : {}),
      persisted: row.persisted,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const normalizedAliases = [...entry.aliases].sort((left, right) => left.localeCompare(right));
  const normalizedNotes = entry.notes
    ? Object.fromEntries(Object.entries(entry.notes).sort(([left], [right]) => left.localeCompare(right)))
    : undefined;

  return {
    languageCode: entry.languageCode,
    canonicalTag: entry.canonicalTag ?? null,
    iso6391: entry.iso6391 ?? null,
    iso6392B: entry.iso6392B ?? null,
    iso6392T: entry.iso6392T ?? null,
    iso6393: entry.iso6393 ?? null,
    glottocode: entry.glottocode ?? null,
    wikidataId: entry.wikidataId ?? null,
    englishName: entry.englishName,
    localName: entry.localName,
    nativeName: entry.nativeName ?? null,
    aliases: normalizedAliases,
    scope: entry.scope ?? null,
    genus: entry.genus ?? null,
    classificationPath: entry.classificationPath ?? null,
    macrolanguage: entry.macrolanguage ?? null,
    languageType: entry.languageType ?? null,
    modality: entry.modality ?? null,
    reviewStatus: entry.reviewStatus ?? null,
    visibility: entry.visibility,
    ...(normalizedNotes ? { notes: normalizedNotes } : {}),
    ...(normalizedDisplayNames.length > 0 ? { displayNames: normalizedDisplayNames } : {}),
  };
}

function computeHistoryDiff(beforeEntry: LanguageCatalogEntry | null, afterEntry: LanguageCatalogEntry | null): {
  changedFields: string[];
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
} {
  const beforePatchSource = buildComparableHistoryPatch(beforeEntry);
  const afterPatchSource = buildComparableHistoryPatch(afterEntry);
  const fieldNames = Array.from(new Set([...Object.keys(beforePatchSource), ...Object.keys(afterPatchSource)])).sort((left, right) => left.localeCompare(right));
  const changedFields: string[] = [];
  const beforePatch: Record<string, unknown> = {};
  const afterPatch: Record<string, unknown> = {};

  fieldNames.forEach((fieldName) => {
    const beforeValue = normalizeComparableValue(beforePatchSource[fieldName]);
    const afterValue = normalizeComparableValue(afterPatchSource[fieldName]);
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      return;
    }

    changedFields.push(fieldName);
    if (isMeaningfulPatchValue(beforeValue)) {
      beforePatch[fieldName] = beforeValue;
    }
    if (isMeaningfulPatchValue(afterValue)) {
      afterPatch[fieldName] = afterValue;
    }
  });

  return {
    changedFields,
    ...(Object.keys(beforePatch).length > 0 ? { beforePatch } : {}),
    ...(Object.keys(afterPatch).length > 0 ? { afterPatch } : {}),
  };
}

function shouldProjectBeforeEntry(languageId: string, existing: LanguageDocType | undefined, displayNames: readonly LanguageDisplayNameDocType[], aliases: readonly LanguageAliasDocType[]): boolean {
  if (existing || displayNames.length > 0 || aliases.length > 0) {
    return true;
  }
  return Boolean(GENERATED_LANGUAGE_DISPLAY_NAME_CORE[languageId]) || isKnownIso639_3Code(languageId);
}

function formatConflictEntryLabel(entry: LanguageCatalogEntry): string {
  return `${entry.localName} (${entry.id})`;
}

function entryMatchesAlias(entry: LanguageCatalogEntry, normalizedAlias: string): boolean {
  const candidates = dedupeStrings([
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
    ...entry.aliases,
    ...entry.displayNames.map((row) => row.value),
  ]);
  return candidates.some((candidate) => normalizeLanguageCatalogRuntimeLabelKey(candidate) === normalizedAlias);
}

async function assertNoAliasConflicts(input: {
  languageId: string;
  locale: Locale;
  aliases: readonly string[];
}): Promise<void> {
  if (input.aliases.length === 0) {
    return;
  }

  const entries = await readLanguageCatalogProjection(input.locale, true);
  const issues = input.aliases.flatMap((alias) => {
    const normalizedAlias = normalizeLanguageCatalogRuntimeLabelKey(alias);
    if (!normalizedAlias) {
      return [] as string[];
    }

    const conflictingEntries = entries.filter((entry) => entry.id !== input.languageId && entryMatchesAlias(entry, normalizedAlias));
    if (conflictingEntries.length === 0) {
      return [] as string[];
    }

    const targets = dedupeStrings(conflictingEntries.map(formatConflictEntryLabel)).join('、');
    const dictKey = HIGH_AMBIGUITY_LANGUAGE_ALIASES.has(normalizedAlias)
      ? 'service.languageCatalog.aliasHighAmbiguity'
      : 'service.languageCatalog.aliasConflict';
    return [tf(input.locale, dictKey, { alias, targets })];
  });

  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }
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

/** 4 位确定性短哈希，基于字符串内容 | 4-char deterministic short hash from string content */
function shortHash4(value: string): string {
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return (h >>> 0).toString(16).slice(-4).padStart(4, '0');
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

  // 留空时自动生成 user:{slug}-{4位hash}，human-readable 且有区别性 | Auto-generate user:{slug}-{4-char hash} when left empty
  const nameSeed = input.englishName?.trim() || input.localName?.trim() || input.nativeName?.trim() || input.languageCode?.trim() || '';
  if (nameSeed) {
    const slug = slugifyLanguageId(nameSeed);
    const hash = shortHash4(nameSeed.toLowerCase());
    return `user:${slug}-${hash}`;
  }

  return `user:${newId('lang').replace(/^lang_/, 'entry-')}`;
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

function normalizeRequestedLanguageIds(languageIds: readonly string[] | undefined): string[] | undefined {
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

function pickRuntimeSnapshotBaseEntry(
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

function buildRuntimeCacheEntry(
  entryByLocale: Partial<Record<LanguageNameQueryLocale, LanguageCatalogEntry>>,
): LanguageCatalogRuntimeEntry | null {
  const baseEntry = pickRuntimeSnapshotBaseEntry(entryByLocale);
  if (!baseEntry) {
    return null;
  }

  const byLocale = Object.fromEntries(
    LANGUAGE_NAME_QUERY_LOCALES
      .map((locale) => [locale, entryByLocale[locale]?.localName?.trim() ?? ''] as const)
      .filter(([, value]) => value.length > 0),
  );
  const aliases = dedupeStrings(baseEntry.aliases);

  return {
    ...(baseEntry.languageCode.trim() ? { languageCode: baseEntry.languageCode.trim().toLowerCase() } : {}),
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
    ...(baseEntry.macrolanguage?.trim() ? { macrolanguage: baseEntry.macrolanguage.trim().toLowerCase() } : {}),
    visibility: baseEntry.visibility,
  };
}

let rebuildLanguageCatalogRuntimeCachePromise: Promise<void> | null = null;

async function rebuildLanguageCatalogRuntimeCache(): Promise<void> {
  const projectedByLocale = await Promise.all(
    LANGUAGE_NAME_QUERY_LOCALES.map(async (locale) => [locale, await readLanguageCatalogProjection(locale, true)] as const),
  );

  const entriesByLanguageId = new Map<string, Partial<Record<LanguageNameQueryLocale, LanguageCatalogEntry>>>();
  projectedByLocale.forEach(([locale, entries]) => {
    entries.forEach((entry) => {
      const bucket = entriesByLanguageId.get(entry.id) ?? {};
      bucket[locale] = entry;
      entriesByLanguageId.set(entry.id, bucket);
    });
  });

  const entries = Object.fromEntries(
    Array.from(entriesByLanguageId.entries())
      .map(([languageId, entryByLocale]) => [languageId, buildRuntimeCacheEntry(entryByLocale)] as const)
      .filter((item): item is [string, LanguageCatalogRuntimeEntry] => Boolean(item[1])),
  );

  const aliasToId = Object.fromEntries(
    Object.entries(entries).flatMap(([languageId, entry]) => {
      if (entry.visibility === 'hidden') {
        return [] as Array<[string, string]>;
      }
      return (entry.aliases ?? [])
        .map((alias) => [normalizeLanguageCatalogRuntimeLabelKey(alias), languageId] as const)
        .filter(([alias]) => alias.length > 0);
    }),
  );
  const lookupToId = Object.fromEntries(
    Object.entries(entries).flatMap(([languageId, entry]) => {
      const lookupKeys = dedupeStrings([
        languageId,
        entry.languageCode,
        entry.canonicalTag,
        entry.iso6391,
        entry.iso6392B,
        entry.iso6392T,
        entry.iso6393,
      ]);
      return lookupKeys.map((lookupKey) => [normalizeLanguageCatalogRuntimeLookupKey(lookupKey), languageId] as const);
    }),
  );

  writeLanguageCatalogRuntimeCache({
    entries,
    aliasToId,
    lookupToId,
    updatedAt: new Date().toISOString(),
  });
}

export async function refreshLanguageCatalogReadModel(): Promise<void> {
  if (!rebuildLanguageCatalogRuntimeCachePromise) {
    rebuildLanguageCatalogRuntimeCachePromise = rebuildLanguageCatalogRuntimeCache()
      .catch((error) => {
        // H5: 记录日志后重新抛出，.finally 会清除引用使后续调用可重试 | Log then re-throw; .finally clears the ref so subsequent calls can retry
        console.error('Failed to rebuild language catalog runtime cache:', error);
        throw error;
      })
      .finally(() => {
        rebuildLanguageCatalogRuntimeCachePromise = null;
      });
  }
  await rebuildLanguageCatalogRuntimeCachePromise;
}

function buildHistoryRecord(input: {
  languageId: string;
  action: LanguageCatalogHistoryAction;
  summary: string;
  changedFields?: string[];
  reason?: string;
  reasonCode?: string;
  sourceType?: LanguageCatalogSourceType;
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
  sourceRef?: string;
  snapshot?: Record<string, unknown>;
}): LanguageCatalogHistoryDocType {
  return {
    id: newId('langhist'),
    languageId: input.languageId,
    action: input.action,
    summary: input.summary,
    ...(input.changedFields && input.changedFields.length > 0 ? { changedFields: input.changedFields } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.beforePatch ? { beforePatch: input.beforePatch } : {}),
    ...(input.afterPatch ? { afterPatch: input.afterPatch } : {}),
    ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
    actorType: 'human',
    createdAt: new Date().toISOString(),
  };
}

function projectLanguageCatalogEntry(input: {
  languageId: string;
  locale: string;
  languageDoc?: LanguageDocType;
  displayNames: readonly LanguageDisplayNameDocType[];
  aliases: readonly LanguageAliasDocType[];
}): LanguageCatalogEntry {
  const isoRecord = ISO_639_3_BY_CODE.get(input.languageId);
  const generated = GENERATED_LANGUAGE_DISPLAY_NAME_CORE[input.languageId];
  const builtInAliases = GENERATED_LANGUAGE_ALIASES_BY_CODE[input.languageId] ?? [];
  const languageDoc = input.languageDoc;
  const projectedDisplayNames = buildProjectedDisplayNames({
    ...(generated ? { generatedEntry: generated } : {}),
    ...(languageDoc ? { languageDoc } : {}),
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
  const generatedLocalName = generated?.byLocale?.[input.locale as LanguageNameQueryLocale];
  const localName = pickDisplayName(input.displayNames, input.locale, ['preferred', 'menu', 'exonym', 'academic'])
    ?? readMultiLangValue(languageDoc?.name, input.locale)
    ?? generatedLocalName
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

  // 提取复合可选值，避免 exactOptionalPropertyTypes 违规 | Extract compound optional values to satisfy exactOptionalPropertyTypes
  const resolvedCanonicalTag = languageDoc?.canonicalTag;
  const resolvedIso6391 = languageDoc?.iso6391 ?? isoRecord?.iso6391;
  const resolvedIso6392B = languageDoc?.iso6392B ?? isoRecord?.iso6392B;
  const resolvedIso6392T = languageDoc?.iso6392T ?? isoRecord?.iso6392T;
  const resolvedIso6393 = languageDoc?.iso6393 ?? isoRecord?.iso6393 ?? (isKnownIso639_3Code(input.languageId) ? input.languageId : undefined);
  const resolvedGlottocode = languageDoc?.glottocode;
  const resolvedWikidataId = languageDoc?.wikidataId;
  const resolvedScope = languageDoc?.scope ?? isoRecord?.scope;
  const resolvedGenus = languageDoc?.genus;
  const resolvedClassificationPath = languageDoc?.classificationPath;
  const resolvedMacrolanguage = languageDoc?.macrolanguage;
  const resolvedLanguageType = languageDoc?.languageType ?? isoRecord?.type;
  const resolvedModality = languageDoc?.modality;
  const resolvedReviewStatus = languageDoc?.reviewStatus;
  const resolvedNotes = languageDoc?.notes;
  const resolvedLatitude = languageDoc?.latitude ?? generated?.latitude;
  const resolvedLongitude = languageDoc?.longitude ?? generated?.longitude;
  const resolvedUpdatedAt = languageDoc?.updatedAt;

  return {
    id: input.languageId,
    entryKind,
    hasPersistedRecord,
    languageCode: languageDoc?.languageCode ?? languageDoc?.iso6393 ?? input.languageId,
    ...(resolvedCanonicalTag ? { canonicalTag: resolvedCanonicalTag } : {}),
    ...(resolvedIso6391 ? { iso6391: resolvedIso6391 } : {}),
    ...(resolvedIso6392B ? { iso6392B: resolvedIso6392B } : {}),
    ...(resolvedIso6392T ? { iso6392T: resolvedIso6392T } : {}),
    ...(resolvedIso6393 ? { iso6393: resolvedIso6393 } : {}),
    ...(resolvedGlottocode ? { glottocode: resolvedGlottocode } : {}),
    ...(resolvedWikidataId ? { wikidataId: resolvedWikidataId } : {}),
    englishName,
    localName,
    ...(nativeName ? { nativeName } : {}),
    aliases,
    ...(resolvedScope ? { scope: resolvedScope } : {}),
    ...(resolvedGenus ? { genus: resolvedGenus } : {}),
    ...(resolvedClassificationPath ? { classificationPath: resolvedClassificationPath } : {}),
    ...(resolvedMacrolanguage ? { macrolanguage: resolvedMacrolanguage } : {}),
    ...(resolvedLanguageType ? { languageType: resolvedLanguageType } : {}),
    ...(resolvedModality ? { modality: resolvedModality } : {}),
    ...(languageDoc?.endangermentLevel ? { endangermentLevel: languageDoc.endangermentLevel } : {}),
    ...(languageDoc?.aesStatus ? { aesStatus: languageDoc.aesStatus } : {}),
    ...(languageDoc?.endangermentSource ? { endangermentSource: languageDoc.endangermentSource } : {}),
    ...(languageDoc?.endangermentAssessmentYear !== undefined ? { endangermentAssessmentYear: languageDoc.endangermentAssessmentYear } : {}),
    ...(languageDoc?.speakerCountL1 !== undefined ? { speakerCountL1: languageDoc.speakerCountL1 } : {}),
    ...(languageDoc?.speakerCountL2 !== undefined ? { speakerCountL2: languageDoc.speakerCountL2 } : {}),
    ...(languageDoc?.speakerCountSource ? { speakerCountSource: languageDoc.speakerCountSource } : {}),
    ...(languageDoc?.speakerCountYear !== undefined ? { speakerCountYear: languageDoc.speakerCountYear } : {}),
    ...(languageDoc?.speakerTrend ? { speakerTrend: languageDoc.speakerTrend } : {}),
    ...(languageDoc?.countries?.length ? { countries: languageDoc.countries } : {}),
    ...(languageDoc?.macroarea ? { macroarea: languageDoc.macroarea } : {}),
    ...(languageDoc?.administrativeDivisions?.length ? { administrativeDivisions: languageDoc.administrativeDivisions } : {}),
    ...(languageDoc?.intergenerationalTransmission ? { intergenerationalTransmission: languageDoc.intergenerationalTransmission } : {}),
    ...(languageDoc?.domains?.length ? { domains: languageDoc.domains } : {}),
    ...(languageDoc?.officialStatus ? { officialStatus: languageDoc.officialStatus } : {}),
    ...(languageDoc?.egids ? { egids: languageDoc.egids } : {}),
    ...(languageDoc?.documentationLevel ? { documentationLevel: languageDoc.documentationLevel } : {}),
    ...(languageDoc?.dialects?.length ? { dialects: languageDoc.dialects } : {}),
    ...(languageDoc?.writingSystems?.length ? { writingSystems: languageDoc.writingSystems } : {}),
    ...(languageDoc?.literacyRate !== undefined ? { literacyRate: languageDoc.literacyRate } : {}),
    ...(resolvedLatitude !== undefined ? { latitude: resolvedLatitude } : {}),
    ...(resolvedLongitude !== undefined ? { longitude: resolvedLongitude } : {}),
    ...(languageDoc?.customFields && Object.keys(languageDoc.customFields).length > 0 ? { customFields: languageDoc.customFields } : {}),
    sourceType,
    ...(resolvedReviewStatus ? { reviewStatus: resolvedReviewStatus } : {}),
    visibility: languageDoc?.visibility ?? 'visible',
    ...(resolvedNotes ? { notes: resolvedNotes } : {}),
    displayNames: projectedDisplayNames,
    ...(resolvedUpdatedAt ? { updatedAt: resolvedUpdatedAt } : {}),
  };
}

async function readLanguageCatalogProjection(
  locale: string,
  includeHidden = false,
  requestedLanguageIds?: readonly string[],
): Promise<LanguageCatalogEntry[]> {
  const scopedLanguageIds = normalizeRequestedLanguageIds(requestedLanguageIds);
  if (scopedLanguageIds && scopedLanguageIds.length === 0) {
    return [];
  }

  const db = await getDb();
  // 三表读取包裹在读事务中，避免并发写入造成数据不对齐 | Wrap 3-table reads in a read transaction to prevent misalignment from concurrent writes
  const [languages, displayNames, aliases] = await db.dexie.transaction('r', db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases, async () => {
    if (scopedLanguageIds) {
      return Promise.all([
        db.dexie.languages.bulkGet(scopedLanguageIds),
        db.dexie.language_display_names.where('languageId').anyOf(scopedLanguageIds).toArray(),
        db.dexie.language_aliases.where('languageId').anyOf(scopedLanguageIds).toArray(),
      ]);
    }

    return Promise.all([
      db.dexie.languages.toArray(),
      db.dexie.language_display_names.toArray(),
      db.dexie.language_aliases.toArray(),
    ]);
  });

  const persistedLanguages = languages.filter((row): row is LanguageDocType => Boolean(row));

  const languageIds = new Set<string>(scopedLanguageIds ?? [
    ...buildBaselineCodes(),
    ...persistedLanguages.map((row) => row.id),
    ...displayNames.map((row) => row.languageId),
    ...aliases.map((row) => row.languageId),
  ]);

  const languageById = new Map(persistedLanguages.map((row) => [row.id, row] as const));
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
    .map((languageId) => {
      const doc = languageById.get(languageId);
      return projectLanguageCatalogEntry({
        languageId,
        locale,
        ...(doc ? { languageDoc: doc } : {}),
        displayNames: displayNamesByLanguageId.get(languageId) ?? [],
        aliases: aliasesByLanguageId.get(languageId) ?? [],
      });
    });

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
  languageIds?: readonly string[];
}): Promise<LanguageCatalogEntry[]> {
  const entries = await readLanguageCatalogProjection(input.locale, input.includeHidden, input.languageIds);

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
      entry.genus,
      entry.classificationPath,
      entry.glottocode,
      entry.wikidataId,
      ...entry.aliases,
      ...entry.displayNames.map((d) => d.value),
      ...Object.values(entry.notes ?? {}),
      ...flattenCustomFieldSearchValues(entry.customFields),
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
  const entries = await readLanguageCatalogProjection(input.locale, true, [input.languageId]);
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
  // H1: 安全验证 locale 而非强转（匹配 'en'/'en-GB' 等变体）| Validate locale safely, matching en-* variants
  const rawLocale = normalizeCanonicalTag(input.locale ?? 'zh-CN', 'zh-CN') ?? 'zh-CN';
  const locale: Locale = rawLocale.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';

  // 首次创建时从 iso-639-3 包自动回填缺失字段 | Auto-fill missing fields from iso-639-3 package on first creation
  const isoSeed = !existing ? ISO_639_3_BY_CODE.get(languageId) : undefined;

  const englishName = normalizeOptionalValue(input.englishName) ?? (!existing ? isoSeed?.name : undefined);
  const localName = normalizeOptionalValue(input.localName);
  const nativeName = normalizeOptionalValue(input.nativeName);
  const hasEnglishName = hasOwnField(input, 'englishName') || Boolean(!existing && isoSeed?.name);
  const hasLocalName = hasOwnField(input, 'localName');
  const hasNativeName = hasOwnField(input, 'nativeName');
  const hasCanonicalTag = hasOwnField(input, 'canonicalTag');
  const hasIso6391 = hasOwnField(input, 'iso6391') || Boolean(!existing && isoSeed?.iso6391);
  const hasIso6392B = hasOwnField(input, 'iso6392B') || Boolean(!existing && isoSeed?.iso6392B);
  const hasIso6392T = hasOwnField(input, 'iso6392T') || Boolean(!existing && isoSeed?.iso6392T);
  const hasIso6393 = hasOwnField(input, 'iso6393');
  const hasGlottocode = hasOwnField(input, 'glottocode');
  const hasWikidataId = hasOwnField(input, 'wikidataId');
  const hasScope = hasOwnField(input, 'scope') || Boolean(!existing && isoSeed?.scope);
  const hasMacrolanguage = hasOwnField(input, 'macrolanguage');
  const hasGenus = hasOwnField(input, 'genus');
  const hasClassificationPath = hasOwnField(input, 'classificationPath');
  const hasModality = hasOwnField(input, 'modality');
  const hasLatitude = hasOwnField(input, 'latitude');
  const hasLongitude = hasOwnField(input, 'longitude');
  const hasLanguageType = hasOwnField(input, 'languageType') || Boolean(!existing && isoSeed?.type);
  const mergedName: MultiLangString = {
    ...(existing?.name ?? {}),
  };
  if (hasEnglishName) {
    // 删除并统一写回所有英文 locale 键，避免 'en' 被静默丢弃 | Delete and re-set all English locale keys to avoid silently losing 'en'
    delete mergedName.eng;
    delete mergedName.en;
    delete mergedName['en-US'];
    if (englishName) {
      mergedName.eng = englishName;
      mergedName.en = englishName;
      mergedName['en-US'] = englishName;
    }
  }
  if (hasLocalName) {
    delete mergedName[locale];
    if (localName) {
      mergedName[locale] = localName;
    }
  }

  // 提取 normalizeOptionalValue 结果，避免双重调用无法被 TS 收窄 | Extract normalized values to allow TS narrowing
  const normCanonicalTag = normalizeCanonicalTag(input.canonicalTag, locale);
  const normIso6391 = normalizeIsoAlphaCode(input.iso6391, 2, locale, 'service.languageCatalog.invalidIso6391') ?? (!existing ? isoSeed?.iso6391 : undefined);
  const normIso6392B = normalizeIsoAlphaCode(input.iso6392B, 3, locale, 'service.languageCatalog.invalidIso6392B') ?? (!existing ? isoSeed?.iso6392B : undefined);
  const normIso6392T = normalizeIsoAlphaCode(input.iso6392T, 3, locale, 'service.languageCatalog.invalidIso6392T') ?? (!existing ? isoSeed?.iso6392T : undefined);
  const normIso6393 = normalizeIsoAlphaCode(input.iso6393, 3, locale, 'service.languageCatalog.invalidIso6393');
  const normGlottocode = normalizeOptionalValue(input.glottocode);
  const normWikidataId = normalizeOptionalValue(input.wikidataId);
  const normMacrolanguage = normalizeOptionalValue(input.macrolanguage);
  const normGenus = normalizeOptionalValue(input.genus);
  const normClassificationPath = normalizeOptionalValue(input.classificationPath);
  const normalizedDisplayNameInput = input.displayNames?.map((row) => ({
    locale: normalizeValidatedDisplayLocale(row.locale, locale),
    role: row.role,
    value: row.value.trim(),
    ...(row.isPreferred ? { isPreferred: true } : {}),
  })) ?? [];
  const normalizedAliases = dedupeStrings(input.aliases ?? []);

  // 别名冲突检查提前到事务外做只读查询（仍可能有 TOCTOU 窗口，但 Dexie IndexedDB 单线程已足够安全） | Alias conflict check as pre-validation before the write transaction
  await assertNoAliasConflicts({
    languageId,
    locale,
    aliases: normalizedAliases,
  });

  const nextLanguage: LanguageDocType = {
    id: languageId,
    name: mergedName,
    languageCode: normalizeOptionalValue(input.languageCode) ?? normIso6393 ?? languageId,
    ...(!hasCanonicalTag && existing?.canonicalTag ? { canonicalTag: existing.canonicalTag } : {}),
    ...(hasCanonicalTag && normCanonicalTag ? { canonicalTag: normCanonicalTag } : {}),
    ...(!hasIso6391 && existing?.iso6391 ? { iso6391: existing.iso6391 } : {}),
    ...(hasIso6391 && normIso6391 ? { iso6391: normIso6391 } : {}),
    ...(!hasIso6392B && existing?.iso6392B ? { iso6392B: existing.iso6392B } : {}),
    ...(hasIso6392B && normIso6392B ? { iso6392B: normIso6392B } : {}),
    ...(!hasIso6392T && existing?.iso6392T ? { iso6392T: existing.iso6392T } : {}),
    ...(hasIso6392T && normIso6392T ? { iso6392T: normIso6392T } : {}),
    ...(!hasIso6393 && existing?.iso6393 ? { iso6393: existing.iso6393 } : {}),
    ...(hasIso6393 && normIso6393 ? { iso6393: normIso6393 } : {}),
    ...(!hasNativeName && existing?.autonym ? { autonym: existing.autonym } : {}),
    ...(hasNativeName && nativeName ? { autonym: nativeName } : {}),
    ...(!hasGlottocode && existing?.glottocode ? { glottocode: existing.glottocode } : {}),
    ...(hasGlottocode && normGlottocode ? { glottocode: normGlottocode } : {}),
    ...(!hasWikidataId && existing?.wikidataId ? { wikidataId: existing.wikidataId } : {}),
    ...(hasWikidataId && normWikidataId ? { wikidataId: normWikidataId } : {}),
    ...(!hasScope && existing?.scope ? { scope: existing.scope } : {}),
    ...(hasScope && (input.scope ?? isoSeed?.scope) ? { scope: (input.scope ?? isoSeed!.scope) as NonNullable<LanguageDocType['scope']> } : {}),
    ...(!hasMacrolanguage && existing?.macrolanguage ? { macrolanguage: existing.macrolanguage } : {}),
    ...(hasMacrolanguage && normMacrolanguage ? { macrolanguage: normMacrolanguage } : {}),
    ...(!hasGenus && existing?.genus ? { genus: existing.genus } : {}),
    ...(hasGenus && normGenus ? { genus: normGenus } : {}),
    ...(!hasClassificationPath && existing?.classificationPath ? { classificationPath: existing.classificationPath } : {}),
    ...(hasClassificationPath && normClassificationPath ? { classificationPath: normClassificationPath } : {}),
    ...(!hasModality && existing?.modality ? { modality: existing.modality } : {}),
    ...(hasModality ? (input.modality ? { modality: input.modality } : {}) : {}),
    ...(!hasLatitude && existing?.latitude !== undefined ? { latitude: existing.latitude } : {}),
    ...(hasLatitude ? (input.latitude !== undefined ? { latitude: input.latitude } : {}) : {}),
    ...(!hasLongitude && existing?.longitude !== undefined ? { longitude: existing.longitude } : {}),
    ...(hasLongitude ? (input.longitude !== undefined ? { longitude: input.longitude } : {}) : {}),
    ...(!hasLanguageType && existing?.languageType ? { languageType: existing.languageType } : {}),
    ...(hasLanguageType ? ((input.languageType ?? isoSeed?.type) ? { languageType: (input.languageType ?? isoSeed!.type) as NonNullable<LanguageDocType['languageType']> } : {}) : {}),
    // 新增元数据字段：简单 merge 逻辑（输入优先，否则保留已有值）| New metadata fields: simple merge (input preferred, fallback to existing)
    ...(hasOwnField(input, 'endangermentLevel') ? (input.endangermentLevel ? { endangermentLevel: input.endangermentLevel } : {}) : existing?.endangermentLevel ? { endangermentLevel: existing.endangermentLevel } : {}),
    ...(hasOwnField(input, 'aesStatus') ? (input.aesStatus ? { aesStatus: input.aesStatus } : {}) : existing?.aesStatus ? { aesStatus: existing.aesStatus } : {}),
    ...(hasOwnField(input, 'endangermentSource') ? (input.endangermentSource ? { endangermentSource: input.endangermentSource } : {}) : existing?.endangermentSource ? { endangermentSource: existing.endangermentSource } : {}),
    ...(hasOwnField(input, 'endangermentAssessmentYear') ? (input.endangermentAssessmentYear !== undefined ? { endangermentAssessmentYear: input.endangermentAssessmentYear } : {}) : existing?.endangermentAssessmentYear !== undefined ? { endangermentAssessmentYear: existing.endangermentAssessmentYear } : {}),
    ...(hasOwnField(input, 'speakerCountL1') ? (input.speakerCountL1 !== undefined ? { speakerCountL1: input.speakerCountL1 } : {}) : existing?.speakerCountL1 !== undefined ? { speakerCountL1: existing.speakerCountL1 } : {}),
    ...(hasOwnField(input, 'speakerCountL2') ? (input.speakerCountL2 !== undefined ? { speakerCountL2: input.speakerCountL2 } : {}) : existing?.speakerCountL2 !== undefined ? { speakerCountL2: existing.speakerCountL2 } : {}),
    ...(hasOwnField(input, 'speakerCountSource') ? (input.speakerCountSource ? { speakerCountSource: input.speakerCountSource } : {}) : existing?.speakerCountSource ? { speakerCountSource: existing.speakerCountSource } : {}),
    ...(hasOwnField(input, 'speakerCountYear') ? (input.speakerCountYear !== undefined ? { speakerCountYear: input.speakerCountYear } : {}) : existing?.speakerCountYear !== undefined ? { speakerCountYear: existing.speakerCountYear } : {}),
    ...(hasOwnField(input, 'speakerTrend') ? (input.speakerTrend ? { speakerTrend: input.speakerTrend } : {}) : existing?.speakerTrend ? { speakerTrend: existing.speakerTrend } : {}),
    ...(hasOwnField(input, 'countries') ? (input.countries?.length ? { countries: input.countries } : {}) : existing?.countries?.length ? { countries: existing.countries } : {}),
    ...(hasOwnField(input, 'macroarea') ? (input.macroarea ? { macroarea: input.macroarea } : {}) : existing?.macroarea ? { macroarea: existing.macroarea } : {}),
    ...(hasOwnField(input, 'administrativeDivisions') ? (input.administrativeDivisions?.length ? { administrativeDivisions: input.administrativeDivisions } : {}) : existing?.administrativeDivisions?.length ? { administrativeDivisions: existing.administrativeDivisions } : {}),
    ...(hasOwnField(input, 'intergenerationalTransmission') ? (input.intergenerationalTransmission ? { intergenerationalTransmission: input.intergenerationalTransmission } : {}) : existing?.intergenerationalTransmission ? { intergenerationalTransmission: existing.intergenerationalTransmission } : {}),
    ...(hasOwnField(input, 'domains') ? (input.domains?.length ? { domains: input.domains } : {}) : existing?.domains?.length ? { domains: existing.domains } : {}),
    ...(hasOwnField(input, 'officialStatus') ? (input.officialStatus ? { officialStatus: input.officialStatus } : {}) : existing?.officialStatus ? { officialStatus: existing.officialStatus } : {}),
    ...(hasOwnField(input, 'egids') ? (input.egids ? { egids: input.egids } : {}) : existing?.egids ? { egids: existing.egids } : {}),
    ...(hasOwnField(input, 'documentationLevel') ? (input.documentationLevel ? { documentationLevel: input.documentationLevel } : {}) : existing?.documentationLevel ? { documentationLevel: existing.documentationLevel } : {}),
    ...(hasOwnField(input, 'dialects') ? (input.dialects?.length ? { dialects: input.dialects } : {}) : existing?.dialects?.length ? { dialects: existing.dialects } : {}),
    ...(hasOwnField(input, 'writingSystems') ? (input.writingSystems?.length ? { writingSystems: input.writingSystems } : {}) : existing?.writingSystems?.length ? { writingSystems: existing.writingSystems } : {}),
    ...(hasOwnField(input, 'literacyRate') ? (input.literacyRate !== undefined ? { literacyRate: input.literacyRate } : {}) : existing?.literacyRate !== undefined ? { literacyRate: existing.literacyRate } : {}),
    ...(hasOwnField(input, 'customFields')
      ? (input.customFields && Object.keys(input.customFields).length > 0
        ? { customFields: input.customFields }
        : {}) // 显式传空对象 → 清除 | Explicit empty → clear
      : existing?.customFields && Object.keys(existing.customFields).length > 0
        ? { customFields: existing.customFields }
        : {}),
    sourceType: nextSourceType,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : existing?.reviewStatus ? { reviewStatus: existing.reviewStatus } : {}),
    visibility: input.visibility ?? existing?.visibility ?? 'visible',
    ...(input.notes ? { notes: input.notes } : existing?.notes ? { notes: existing.notes } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const aliasRows: LanguageAliasDocType[] = normalizedAliases.map((alias) => ({
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
    ...(normalizedDisplayNameInput.length > 0 ? { displayNames: normalizedDisplayNameInput } : {}),
    sourceType: nextSourceType,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
    createdAt: now,
  });

  const reason = normalizeOptionalValue(input.reason)
    ?? t(locale, existing ? 'service.languageCatalog.historyReasonUpdateDefault' : 'service.languageCatalog.historyReasonCreateDefault');

  // 将当前行读取和历史 diff 计算移入事务内，避免 before 快照过时 | Move current row reads and history diff inside transaction to prevent stale before-snapshot
  await db.dexie.transaction('rw', db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases, db.dexie.language_catalog_history, async () => {
    const [currentDisplayRows, currentAliasRows] = await Promise.all([
      db.dexie.language_display_names.where('languageId').equals(languageId).toArray(),
      db.dexie.language_aliases.where('languageId').equals(languageId).toArray(),
    ]);
    const beforeEntry = shouldProjectBeforeEntry(languageId, existing, currentDisplayRows, currentAliasRows)
      ? projectLanguageCatalogEntry({
        languageId,
        locale,
        ...(existing ? { languageDoc: existing } : {}),
        displayNames: currentDisplayRows,
        aliases: currentAliasRows,
      })
      : null;
    const afterEntry = projectLanguageCatalogEntry({
      languageId,
      locale,
      languageDoc: nextLanguage,
      displayNames: displayRows,
      aliases: aliasRows,
    });
    const historyDiff = computeHistoryDiff(beforeEntry, afterEntry);

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
      summary: t(locale, existing ? 'service.languageCatalog.historyUpdate' : 'service.languageCatalog.historyCreate'),
      changedFields: historyDiff.changedFields,
      reason,
      reasonCode: normalizeOptionalValue(input.reason) ? 'user-provided' : 'workspace-save',
      sourceType: nextSourceType,
      ...(historyDiff.beforePatch ? { beforePatch: historyDiff.beforePatch } : {}),
      ...(historyDiff.afterPatch ? { afterPatch: historyDiff.afterPatch } : {}),
      sourceRef: 'workspace.language-metadata',
      snapshot: {
        language: nextLanguage,
        displayNames: displayRows,
        aliases: aliasRows,
      },
    }));
  });

  // C4: 添加错误处理，避免 rebuild 失败导致缓存/DB 永久脱节 | Add error handling to prevent permanent cache/DB desync on rebuild failure
  await refreshLanguageCatalogReadModel().catch((refreshError) => {
    console.error('Failed to refresh language catalog read model after upsert:', refreshError);
  });

  return (await getLanguageCatalogEntry({ languageId, locale })) as LanguageCatalogEntry;
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
  const reason = normalizeOptionalValue(input.reason)
    ?? t(input.locale, existing.sourceType === 'user-custom'
      ? 'service.languageCatalog.historyReasonDeleteCustomDefault'
      : 'service.languageCatalog.historyReasonDeleteOverrideDefault');

  // 将 beforeEntry 投影和 historyDiff 移入事务内，避免并发写入导致快照过时 | Move beforeEntry projection and historyDiff inside transaction to prevent stale snapshot from concurrent writes
  await db.dexie.transaction('rw', db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases, db.dexie.language_catalog_history, async () => {
    const [currentDisplayRows, currentAliasRows] = await Promise.all([
      db.dexie.language_display_names.where('languageId').equals(input.languageId).toArray(),
      db.dexie.language_aliases.where('languageId').equals(input.languageId).toArray(),
    ]);
    const beforeEntry = projectLanguageCatalogEntry({
      languageId: input.languageId,
      locale: input.locale,
      languageDoc: existing,
      displayNames: currentDisplayRows,
      aliases: currentAliasRows,
    });
    const historyDiff = computeHistoryDiff(beforeEntry, null);

    await db.dexie.languages.delete(input.languageId);
    await db.dexie.language_display_names.where('languageId').equals(input.languageId).delete();
    await db.dexie.language_aliases.where('languageId').equals(input.languageId).delete();
    await db.dexie.language_catalog_history.put(buildHistoryRecord({
      languageId: input.languageId,
      action: 'delete',
      summary: t(input.locale, existing.sourceType === 'user-custom' ? 'service.languageCatalog.historyDeleteCustom' : 'service.languageCatalog.historyDeleteOverride'),
      changedFields: historyDiff.changedFields,
      reason,
      reasonCode: normalizeOptionalValue(input.reason) ? 'user-provided' : 'workspace-delete',
      ...(existing.sourceType ? { sourceType: existing.sourceType } : {}),
      ...(historyDiff.beforePatch ? { beforePatch: historyDiff.beforePatch } : {}),
      sourceRef: 'workspace.language-metadata',
      snapshot: { language: existing },
    }));
  });

  await refreshLanguageCatalogReadModel().catch((refreshError) => {
    console.error('Failed to refresh language catalog read model after delete:', refreshError);
  });
}

export async function listLanguageCatalogHistory(languageId: string): Promise<LanguageCatalogHistoryDocType[]> {
  const db = await getDb();
  return db.dexie.language_catalog_history
    .where('languageId')
    .equals(languageId)
    .reverse()
    .sortBy('createdAt');
}

// ── 自定义字段定义 CRUD | Custom field definition CRUD ──

export async function listCustomFieldDefinitions(): Promise<CustomFieldDefinitionDocType[]> {
  const db = await getDb();
  const all = await db.dexie.custom_field_definitions.toArray();
  return all.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function upsertCustomFieldDefinition(input: {
  id?: string;
  name: MultiLangString;
  fieldType: CustomFieldValueType;
  options?: string[];
  description?: MultiLangString;
}): Promise<CustomFieldDefinitionDocType> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = input.id ? await db.dexie.custom_field_definitions.get(input.id) : undefined;
  const maxSort = existing
    ? existing.sortOrder
    : (await db.dexie.custom_field_definitions.toArray()).reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;

  const doc: CustomFieldDefinitionDocType = {
    id: input.id ?? newId('cfd'),
    name: input.name,
    fieldType: input.fieldType,
    ...(input.options?.length ? { options: input.options } : {}),
    ...(input.description && Object.values(input.description).some((v) => v.trim()) ? { description: input.description } : {}),
    sortOrder: maxSort,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.dexie.custom_field_definitions.put(doc);
  return doc;
}

export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  const db = await getDb();
  await db.dexie.transaction('rw', db.dexie.custom_field_definitions, db.dexie.languages, async () => {
    await db.dexie.custom_field_definitions.delete(id);

    const languages = await db.dexie.languages.toArray();
    const updates = languages.flatMap((language) => {
      const customFields = language.customFields;
      if (!customFields || !(id in customFields)) {
        return [];
      }

      const { [id]: _removed, ...restCustomFields } = customFields;
      return [{
        ...language,
        ...(Object.keys(restCustomFields).length > 0 ? { customFields: restCustomFields } : {}),
        updatedAt: new Date().toISOString(),
      } satisfies LanguageDocType];
    });

    if (updates.length > 0) {
      await db.dexie.languages.bulkPut(updates);
    }
  });

  await refreshLanguageCatalogReadModel().catch((refreshError) => {
    console.error('Failed to refresh language catalog read model after custom field definition delete:', refreshError);
  });
}