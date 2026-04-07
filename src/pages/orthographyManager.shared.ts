import type { OrthographyDocType } from '../db';
import { t, useLocale } from '../i18n';
import {
  listAdditionalMultiLangLabelEntries,
  type MultiLangLabelEntry,
  readAnyMultiLangLabel,
  readEnglishFallbackMultiLangLabel,
  readPrimaryMultiLangLabel,
} from '../utils/multiLangLabels';

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
export type OrthographyCatalogReviewStatus = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['reviewStatus']>;
export type OrthographyCatalogPriority = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['priority']>;
export type OrthographyCatalogSource = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['catalogSource']>;

export type OrthographyDraft = {
  languageId: string;
  namePrimary: string;
  nameEnglishFallback: string;
  localizedNameEntries: MultiLangLabelEntry[];
  abbreviation: string;
  scriptTag: string;
  type: NonNullable<OrthographyDocType['type']>;
  direction: NonNullable<OrthographyDocType['direction']>;
  localeTag: string;
  regionTag: string;
  variantTag: string;
  catalogReviewStatus: '' | OrthographyCatalogReviewStatus;
  catalogPriority: '' | OrthographyCatalogPriority;
  exemplarMain: string;
  exemplarAuxiliary: string;
  exemplarNumbers: string;
  exemplarPunctuation: string;
  exemplarIndex: string;
  primaryFonts: string;
  fallbackFonts: string;
  monoFonts: string;
  lineHeightScale: string;
  sizeAdjust: string;
  keyboardLayout: string;
  imeId: string;
  deadKeys: string;
  normalizationForm: '' | NormalizationForm;
  normalizationCaseSensitive: boolean;
  normalizationStripDefaultIgnorables: boolean;
  collationBase: string;
  collationRules: string;
  conversionRulesJson: string;
  notesZh: string;
  notesEn: string;
  bidiIsolate: boolean;
  preferDirAttribute: boolean;
};

export function readOrthographyName(orthography: OrthographyDocType): string {
  return readAnyMultiLangLabel(orthography.name)
    ?? orthography.abbreviation
    ?? orthography.id;
}

export function buildSearchText(orthography: OrthographyDocType, languageLabel: string): string {
  return [
    readOrthographyName(orthography),
    orthography.languageId ?? '',
    languageLabel,
    orthography.scriptTag,
    orthography.type,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function buildOrthographyDraft(orthography: OrthographyDocType): OrthographyDraft {
  return {
    languageId: orthography.languageId ?? '',
    namePrimary: readPrimaryMultiLangLabel(orthography.name) ?? '',
    nameEnglishFallback: readEnglishFallbackMultiLangLabel(orthography.name) ?? '',
    localizedNameEntries: listAdditionalMultiLangLabelEntries(orthography.name),
    abbreviation: orthography.abbreviation ?? '',
    scriptTag: orthography.scriptTag ?? '',
    type: orthography.type ?? 'practical',
    direction: orthography.direction ?? 'ltr',
    localeTag: orthography.localeTag ?? '',
    regionTag: orthography.regionTag ?? '',
    variantTag: orthography.variantTag ?? '',
    catalogReviewStatus: orthography.catalogMetadata?.reviewStatus ?? '',
    catalogPriority: orthography.catalogMetadata?.priority ?? '',
    exemplarMain: (orthography.exemplarCharacters?.main ?? []).join(', '),
    exemplarAuxiliary: (orthography.exemplarCharacters?.auxiliary ?? []).join(', '),
    exemplarNumbers: (orthography.exemplarCharacters?.numbers ?? []).join(', '),
    exemplarPunctuation: (orthography.exemplarCharacters?.punctuation ?? []).join(', '),
    exemplarIndex: (orthography.exemplarCharacters?.index ?? []).join(', '),
    primaryFonts: (orthography.fontPreferences?.primary ?? []).join(', '),
    fallbackFonts: (orthography.fontPreferences?.fallback ?? []).join(', '),
    monoFonts: (orthography.fontPreferences?.mono ?? []).join(', '),
    lineHeightScale: orthography.fontPreferences?.lineHeightScale?.toString() ?? '',
    sizeAdjust: orthography.fontPreferences?.sizeAdjust?.toString() ?? '',
    keyboardLayout: orthography.inputHints?.keyboardLayout ?? '',
    imeId: orthography.inputHints?.imeId ?? '',
    deadKeys: (orthography.inputHints?.deadKeys ?? []).join(', '),
    normalizationForm: (orthography.normalization?.form ?? '') as '' | NormalizationForm,
    normalizationCaseSensitive: orthography.normalization?.caseSensitive ?? false,
    normalizationStripDefaultIgnorables: orthography.normalization?.stripDefaultIgnorables ?? false,
    collationBase: orthography.collation?.base ?? '',
    collationRules: orthography.collation?.customRules ?? '',
    conversionRulesJson: orthography.conversionRules ? JSON.stringify(orthography.conversionRules, null, 2) : '',
    notesZh: orthography.notes?.['zh-CN'] ?? orthography.notes?.zho ?? orthography.notes?.zh ?? '',
    notesEn: orthography.notes?.['en-US'] ?? orthography.notes?.eng ?? orthography.notes?.en ?? '',
    bidiIsolate: orthography.bidiPolicy?.isolateInlineRuns ?? false,
    preferDirAttribute: orthography.bidiPolicy?.preferDirAttribute ?? true,
  };
}

export function resolveCatalogReviewStatusLabel(
  locale: ReturnType<typeof useLocale>,
  status: OrthographyCatalogReviewStatus,
): string {
  switch (status) {
    case 'verified-primary':
      return t(locale, 'workspace.orthography.catalogReviewStatusVerifiedPrimary');
    case 'verified-secondary':
      return t(locale, 'workspace.orthography.catalogReviewStatusVerifiedSecondary');
    case 'historical':
      return t(locale, 'workspace.orthography.catalogReviewStatusHistorical');
    case 'legacy':
      return t(locale, 'workspace.orthography.catalogReviewStatusLegacy');
    case 'experimental':
      return t(locale, 'workspace.orthography.catalogReviewStatusExperimental');
    default:
      return t(locale, 'workspace.orthography.catalogReviewStatusNeedsReview');
  }
}

export function resolveCatalogPriorityLabel(
  locale: ReturnType<typeof useLocale>,
  priority: OrthographyCatalogPriority,
): string {
  return priority === 'secondary'
    ? t(locale, 'workspace.orthography.catalogPrioritySecondary')
    : t(locale, 'workspace.orthography.catalogPriorityPrimary');
}

export function resolveCatalogSourceLabel(
  locale: ReturnType<typeof useLocale>,
  source: OrthographyCatalogSource | undefined,
): string {
  switch (source) {
    case 'built-in-reviewed':
      return t(locale, 'workspace.orthography.catalogSourceBuiltInReviewed');
    case 'built-in-generated':
      return t(locale, 'workspace.orthography.catalogSourceBuiltInGenerated');
    case 'user':
      return t(locale, 'workspace.orthography.catalogSourceUser');
    default:
      return t(locale, 'workspace.orthography.notSet');
  }
}

export function parseDraftList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseOptionalNumber(value: string): { valid: boolean; value?: number } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { valid: false };
  }
  return { valid: true, value: parsed };
}

export function parseConversionRulesJson(value: string): { valid: boolean; value?: Record<string, unknown> } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false };
    }
    return { valid: true, value: parsed as Record<string, unknown> };
  } catch {
    return { valid: false };
  }
}

export function areDraftsEqual(left: OrthographyDraft | null, right: OrthographyDraft | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}