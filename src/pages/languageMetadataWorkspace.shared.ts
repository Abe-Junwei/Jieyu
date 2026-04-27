import type { LanguageCatalogHistoryDocType } from '../types/jieyuDbDocTypes';
import { t } from '../i18n';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../types/linguisticCatalogSurface.types';
import { formatIso3166Alpha2ListEndonyms, formatIso3166Alpha2ListUi } from '../utils/iso3166CountryLabels';
import { buildCustomFieldDraftValues, formatCustomFieldOptionsEditorValue, parseCustomFieldDraftMultiselectValue, parseCustomFieldOptionsEditorValue, serializeCustomFieldDraftValue } from '../utils/pageLanguageMetadataCustomFields';

export const LANGUAGE_ID_PARAM = 'languageId';
export const NEW_LANGUAGE_ID = '__new__';

export type WorkspaceLocale = 'zh-CN' | 'en-US';

export const LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS = ['preferred', 'menu', 'autonym', 'exonym', 'academic', 'historical', 'search'] as const satisfies readonly LanguageCatalogDisplayNameEntry['role'][];

export type LanguageDisplayNameDraftRow = {
  key: string;
  locale: string;
  role: LanguageCatalogDisplayNameEntry['role'];
  value: string;
  isPreferred: boolean;
  persisted: boolean;
  sourceType: string;
};

export type LanguageMetadataDraft = {
  idInput: string;
  languageCode: string;
  canonicalTag: string;
  iso6391: string;
  iso6392B: string;
  iso6392T: string;
  iso6393: string;
  localName: string;
  englishName: string;
  nativeName: string;
  aliasesText: string;
  genus: string;
  subfamily: string;
  branch: string;
  classificationPath: string;
  macrolanguage: string;
  scope: string;
  languageType: string;
  endangermentLevel: string;
  aesStatus: string;
  endangermentSource: string;
  endangermentAssessmentYear: string;
  speakerCountL1: string;
  speakerCountL2: string;
  speakerCountSource: string;
  speakerCountYear: string;
  speakerTrend: string;
  countriesText: string;
  /** User override for official-status countries (comma-separated; overrides CLDR baseline when non-empty) */
  countriesOfficialText: string;
  /** Read-only CLDR official baseline (formatted) */
  baselineOfficialCountriesUi: string;
  baselineOfficialCountriesEndonym: string;
  macroarea: string;
  administrativeDivisionsText: string;
  intergenerationalTransmission: string;
  domainsText: string;
  officialStatus: string;
  egids: string;
  documentationLevel: string;
  dialectsText: string;
  vernacularsText: string;
  writingSystemsText: string;
  literacyRate: string;
  glottocode: string;
  wikidataId: string;
  visibility: LanguageCatalogVisibility;
  notesZh: string;
  notesEn: string;
  latitude: string;
  longitude: string;
  changeReason: string;
  displayNameRows: LanguageDisplayNameDraftRow[];
  displayNameHiddenRows: LanguageDisplayNameDraftRow[];
  customFieldValues: Record<string, string>;
};

export type HistoryItem = LanguageCatalogHistoryDocType;

export type LanguageMetadataDraftChangeHandler = <K extends keyof LanguageMetadataDraft>(
  key: K,
  value: LanguageMetadataDraft[K],
) => void;

export type LanguageDisplayNameRowChangeHandler = <K extends keyof Omit<LanguageDisplayNameDraftRow, 'key'>>(
  rowKey: string,
  key: K,
  value: LanguageDisplayNameDraftRow[K],
) => void;

export function parseAliasText(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseLineSeparatedText(value: string): string[] {
  return value
    .split(/[\n,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type ClassificationPathKey = 'genus' | 'subfamily' | 'branch' | 'dialects' | 'vernaculars';

const CLASSIFICATION_PATH_LABEL_KEYS: Record<ClassificationPathKey, Parameters<typeof t>[1]> = {
  genus: 'workspace.languageMetadata.genusLabel',
  subfamily: 'workspace.languageMetadata.subfamilyLabel',
  branch: 'workspace.languageMetadata.branchLabel',
  dialects: 'workspace.languageMetadata.dialectsLabel',
  vernaculars: 'workspace.languageMetadata.vernacularsLabel',
};

function normalizeClassificationPathList(values?: string[]): string[] {
  return values?.map((item) => item.trim()).filter(Boolean) ?? [];
}

export function buildClassificationPathValue(value: {
  genus?: string;
  subfamily?: string;
  branch?: string;
  dialects?: string[];
  vernaculars?: string[];
}): string {
  const dialects = normalizeClassificationPathList(value.dialects).join('、');
  const vernaculars = normalizeClassificationPathList(value.vernaculars).join('、');

  return [
    value.genus?.trim(),
    value.subfamily?.trim(),
    value.branch?.trim(),
    dialects,
    vernaculars,
  ]
    .filter(Boolean)
    .join(' / ');
}

export function buildClassificationPathDisplayLine(
  locale: WorkspaceLocale,
  value: {
    genus?: string;
    subfamily?: string;
    branch?: string;
    dialects?: string[];
    vernaculars?: string[];
  },
): string {
  const dialects = normalizeClassificationPathList(value.dialects);
  const vernaculars = normalizeClassificationPathList(value.vernaculars);
  const displayValues: Record<ClassificationPathKey, string> = {
    genus: value.genus?.trim() ?? '',
    subfamily: value.subfamily?.trim() ?? '',
    branch: value.branch?.trim() ?? '',
    dialects: dialects.join(locale === 'zh-CN' ? '、' : ', '),
    vernaculars: vernaculars.join(locale === 'zh-CN' ? '、' : ', '),
  };

  return (Object.keys(CLASSIFICATION_PATH_LABEL_KEYS) as ClassificationPathKey[])
    .flatMap((key) => (displayValues[key] ? [`${t(locale, CLASSIFICATION_PATH_LABEL_KEYS[key])}: ${displayValues[key]}`] : []))
    .join(' / ');
}

type AdministrativeDivisionKey = 'country' | 'province' | 'city' | 'county' | 'township' | 'village';

const ADMINISTRATIVE_DIVISION_LABEL_KEYS: Record<AdministrativeDivisionKey, Parameters<typeof t>[1]> = {
  country: 'workspace.languageMetadata.administrativeDivisionCountryLabel',
  province: 'workspace.languageMetadata.administrativeDivisionProvinceLabel',
  city: 'workspace.languageMetadata.administrativeDivisionCityLabel',
  county: 'workspace.languageMetadata.administrativeDivisionCountyLabel',
  township: 'workspace.languageMetadata.administrativeDivisionTownshipLabel',
  village: 'workspace.languageMetadata.administrativeDivisionVillageLabel',
};

const ADMINISTRATIVE_DIVISION_LABEL_ALIASES: Record<AdministrativeDivisionKey, string[]> = {
  country: ['country', '国家'],
  province: ['province', 'state', 'stateprovince', 'provincestate', '省', '州', '省州'],
  city: ['city', '城市', '市'],
  county: ['county', 'district', 'countydistrict', '县', '区', '县区'],
  township: ['township', 'town', 'townshiptown', '乡', '镇', '乡镇'],
  village: ['village', 'hamlet', '村', '村级'],
};

function normalizeAdministrativeDivisionLabel(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s/]/g, '');
}

function parseAdministrativeDivisionSegment(segment: string): { key: AdministrativeDivisionKey; value: string } | null {
  const matched = segment.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
  if (!matched) {
    return null;
  }
  const normalizedLabel = normalizeAdministrativeDivisionLabel(matched[1] ?? '');
  const value = matched[2]?.trim() ?? '';
  if (!normalizedLabel || !value) {
    return null;
  }
  const key = (Object.entries(ADMINISTRATIVE_DIVISION_LABEL_ALIASES).find(([, aliases]) => aliases.some((alias) => normalizeAdministrativeDivisionLabel(alias) === normalizedLabel))?.[0] ?? null) as AdministrativeDivisionKey | null;
  return key ? { key, value } : null;
}

function readAdministrativeDivisionDisplayLabel(locale: WorkspaceLocale, key: AdministrativeDivisionKey): string {
  return t(locale, ADMINISTRATIVE_DIVISION_LABEL_KEYS[key]).replace(/\s*\/\s*/g, '');
}

function splitAdministrativeDivisionLine(line: string): { segments: string[]; hasAmbiguousSeparator: boolean } {
  const separator = ' / ';
  const segments: string[] = [];
  let segmentStart = 0;
  let cursor = 0;
  let hasAmbiguousSeparator = false;

  while (cursor < line.length) {
    const separatorIndex = line.indexOf(separator, cursor);
    if (separatorIndex < 0) {
      break;
    }

    const left = line.slice(segmentStart, separatorIndex).trim();
    const rightRemainder = line.slice(separatorIndex + separator.length);
    const nextSeparatorIndex = rightRemainder.indexOf(separator);
    const rightHead = (nextSeparatorIndex >= 0 ? rightRemainder.slice(0, nextSeparatorIndex) : rightRemainder).trim();
    const leftHasLabel = /[:：]/.test(left);
    const rightLooksLikeLabel = /^[^:：]+[:：]/.test(rightHead);

    if (leftHasLabel && rightLooksLikeLabel) {
      if (left) {
        segments.push(left);
      }
      segmentStart = separatorIndex + separator.length;
    } else if (leftHasLabel && !rightLooksLikeLabel) {
      hasAmbiguousSeparator = true;
    }

    cursor = separatorIndex + separator.length;
  }

  const tail = line.slice(segmentStart).trim();
  if (tail) {
    segments.push(tail);
  }

  return {
    segments: segments.length > 0 ? segments : [line.trim()],
    hasAmbiguousSeparator,
  };
}

export function buildAdministrativeDivisionDisplayLine(
  locale: WorkspaceLocale,
  value: {
    country?: string;
    province?: string;
    city?: string;
    county?: string;
    township?: string;
    village?: string;
  },
): string {
  return (Object.keys(ADMINISTRATIVE_DIVISION_LABEL_KEYS) as AdministrativeDivisionKey[])
    .flatMap((key) => {
      const segmentValue = value[key]?.trim();
      return segmentValue ? [`${readAdministrativeDivisionDisplayLabel(locale, key)}: ${segmentValue}`] : [];
    })
    .join(' / ');
}

export function parseAdministrativeDivisionText(value: string): Array<{
  country?: string;
  province?: string;
  city?: string;
  county?: string;
  township?: string;
  village?: string;
  freeText?: string;
}> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const { segments: parts, hasAmbiguousSeparator } = splitAdministrativeDivisionLine(line);
      if (hasAmbiguousSeparator) {
        return { freeText: line };
      }
      const labeledParts = parts.map((segment) => parseAdministrativeDivisionSegment(segment));
      if (labeledParts.length > 0 && labeledParts.every(Boolean)) {
        return labeledParts.reduce<{
          country?: string;
          province?: string;
          city?: string;
          county?: string;
          township?: string;
          village?: string;
        }>((result, segment) => ({
          ...result,
          ...(segment ? { [segment.key]: segment.value } : {}),
        }), {});
      }
      if (labeledParts.some(Boolean)) {
        return { freeText: line };
      }
      return { freeText: line };
    });
}

export function createDisplayNameDraftRow(row?: Partial<Omit<LanguageDisplayNameDraftRow, 'key'>>): LanguageDisplayNameDraftRow {
  return {
    key: `display-name-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    locale: row?.locale ?? '',
    role: row?.role ?? 'preferred',
    value: row?.value ?? '',
    isPreferred: row?.isPreferred ?? false,
    persisted: row?.persisted ?? false,
    sourceType: row?.sourceType ?? 'user-override',
  };
}

export {
  serializeCustomFieldDraftValue,
  parseCustomFieldDraftMultiselectValue,
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldOptionsEditorValue,
};

function buildDisplayNameRows(
  entry: LanguageCatalogEntry | null,
  locale: WorkspaceLocale,
  visibility: 'current-locale' | 'other-locales',
): LanguageDisplayNameDraftRow[] {
  if (!entry) {
    return [];
  }

  const currentLocaleKey = locale.toLowerCase();
  const englishLocaleKey = 'en-us';
  const nativeLocaleKey = 'native';

  return (entry.displayNames ?? [])
    .filter((row) => {
      const normalizedLocale = row.locale.trim().toLowerCase();
      const normalizedValue = row.value.trim();
      if (!normalizedValue) {
        return false;
      }
      if (normalizedLocale === currentLocaleKey && row.role === 'preferred' && normalizedValue === entry.localName.trim()) {
        return false;
      }
      if (normalizedLocale === englishLocaleKey && row.role === 'preferred' && normalizedValue === entry.englishName.trim()) {
        return false;
      }
      if (normalizedLocale === nativeLocaleKey && row.role === 'autonym' && normalizedValue === (entry.nativeName ?? '').trim()) {
        return false;
      }
      const isCurrentLocale = normalizedLocale === currentLocaleKey;
      return visibility === 'current-locale' ? isCurrentLocale : !isCurrentLocale;
    })
    .map((row) => createDisplayNameDraftRow({
      locale: row.locale,
      role: row.role,
      value: row.value,
      isPreferred: Boolean(row.isPreferred),
      persisted: row.persisted,
      sourceType: row.sourceType,
    }));
}

export function normalizeDisplayNameRows(rows: readonly LanguageDisplayNameDraftRow[]): Array<{
  locale: string;
  role: LanguageCatalogDisplayNameEntry['role'];
  value: string;
  isPreferred?: boolean;
}> {
  const seen = new Set<string>();
  const normalizedRows: Array<{
    locale: string;
    role: LanguageCatalogDisplayNameEntry['role'];
    value: string;
    isPreferred?: boolean;
  }> = [];

  rows.forEach((row) => {
    const locale = row.locale.trim();
    const value = row.value.trim();
    if (!locale || !value) {
      return;
    }
    const key = `${locale.toLowerCase()}::${row.role}::${value.normalize('NFKC').toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalizedRows.push({
      locale,
      role: row.role,
      value,
      ...(row.isPreferred ? { isPreferred: true } : {}),
    });
  });

  return normalizedRows;
}

export function readDisplayNameMatrixFallback(
  rows: readonly {
    locale: string;
    role: LanguageCatalogDisplayNameEntry['role'];
    value: string;
  }[],
  locale: WorkspaceLocale,
): { localName?: string; englishName?: string; nativeName?: string } {
  const normalizedLocale = locale.toLowerCase();
  const localRow = rows.find((row) => row.locale.trim().toLowerCase() === normalizedLocale);
  const englishRow = rows.find((row) => row.locale.trim().toLowerCase() === 'en-us');
  const nativeRow = rows.find((row) => row.locale.trim().toLowerCase() === 'native' || row.role === 'autonym');

  return {
    ...(localRow ? { localName: localRow.value.trim() } : {}),
    ...(englishRow ? { englishName: englishRow.value.trim() } : {}),
    ...(nativeRow ? { nativeName: nativeRow.value.trim() } : {}),
  };
}

export function buildDraft(entry: LanguageCatalogEntry | null, locale: WorkspaceLocale): LanguageMetadataDraft {
  if (!entry) {
    return {
      idInput: '',
      languageCode: '',
      canonicalTag: '',
      iso6391: '',
      iso6392B: '',
      iso6392T: '',
      iso6393: '',
      localName: '',
      englishName: '',
      nativeName: '',
      aliasesText: '',
      genus: '',
      subfamily: '',
      branch: '',
      classificationPath: '',
      macrolanguage: '',
      scope: '',
      languageType: '',
      endangermentLevel: '',
      aesStatus: '',
      endangermentSource: '',
      endangermentAssessmentYear: '',
      speakerCountL1: '',
      speakerCountL2: '',
      speakerCountSource: '',
      speakerCountYear: '',
      speakerTrend: '',
      countriesText: '',
      countriesOfficialText: '',
      baselineOfficialCountriesUi: '',
      baselineOfficialCountriesEndonym: '',
      macroarea: '',
      administrativeDivisionsText: '',
      intergenerationalTransmission: '',
      domainsText: '',
      officialStatus: '',
      egids: '',
      documentationLevel: '',
      dialectsText: '',
      vernacularsText: '',
      writingSystemsText: '',
      literacyRate: '',
      glottocode: '',
      wikidataId: '',
      visibility: 'visible',
      notesZh: '',
      notesEn: '',
      latitude: '',
      longitude: '',
      changeReason: '',
      displayNameRows: [],
      displayNameHiddenRows: [],
      customFieldValues: {},
    };
  }

  return {
    idInput: entry.id.startsWith('user:') ? entry.id : '',
    languageCode: entry.languageCode,
    canonicalTag: entry.canonicalTag ?? '',
    iso6391: entry.iso6391 ?? '',
    iso6392B: entry.iso6392B ?? '',
    iso6392T: entry.iso6392T ?? '',
    iso6393: entry.iso6393 ?? '',
    localName: entry.localName,
    englishName: entry.englishName,
    nativeName: entry.nativeName ?? '',
    aliasesText: entry.aliases.join('\n'),
    genus: entry.genus ?? '',
    subfamily: entry.subfamily ?? '',
    branch: entry.branch ?? '',
    classificationPath: entry.classificationPath ?? '',
    macrolanguage: entry.macrolanguage ?? '',
    scope: entry.scope ?? '',
    languageType: entry.languageType ?? '',
    endangermentLevel: entry.endangermentLevel ?? '',
    aesStatus: entry.aesStatus ?? '',
    endangermentSource: entry.endangermentSource ?? '',
    endangermentAssessmentYear: entry.endangermentAssessmentYear !== undefined ? String(entry.endangermentAssessmentYear) : '',
    speakerCountL1: entry.speakerCountL1 !== undefined ? String(entry.speakerCountL1) : '',
    speakerCountL2: entry.speakerCountL2 !== undefined ? String(entry.speakerCountL2) : '',
    speakerCountSource: entry.speakerCountSource ?? '',
    speakerCountYear: entry.speakerCountYear !== undefined ? String(entry.speakerCountYear) : '',
    speakerTrend: entry.speakerTrend ?? '',
    countriesText: entry.countries?.join(', ')
      ?? (entry.baselineDistributionCountryCodes?.length
        ? entry.baselineDistributionCountryCodes.join(', ')
        : ''),
    countriesOfficialText: entry.countriesOfficial?.join(', ') ?? '',
    baselineOfficialCountriesUi: entry.baselineOfficialCountryCodes?.length
      ? formatIso3166Alpha2ListUi(entry.baselineOfficialCountryCodes, locale)
      : '',
    baselineOfficialCountriesEndonym: entry.baselineOfficialCountryCodes?.length
      ? formatIso3166Alpha2ListEndonyms(entry.baselineOfficialCountryCodes)
      : '',
    macroarea: entry.macroarea ?? '',
    administrativeDivisionsText: entry.administrativeDivisions?.map((d) => d.freeText ?? buildAdministrativeDivisionDisplayLine(locale, d)).join('\n') ?? '',
    intergenerationalTransmission: entry.intergenerationalTransmission ?? '',
    domainsText: entry.domains?.join(', ') ?? '',
    officialStatus: entry.officialStatus ?? '',
    egids: entry.egids ?? '',
    documentationLevel: entry.documentationLevel ?? '',
    dialectsText: entry.dialects?.join('\n') ?? '',
    vernacularsText: entry.vernaculars?.join('\n') ?? '',
    writingSystemsText: entry.writingSystems?.join(', ') ?? '',
    literacyRate: entry.literacyRate !== undefined ? String(entry.literacyRate) : '',
    glottocode: entry.glottocode ?? '',
    wikidataId: entry.wikidataId ?? '',
    visibility: entry.visibility,
    notesZh: entry.notes?.['zh-CN'] ?? entry.notes?.zho ?? '',
    notesEn: entry.notes?.['en-US'] ?? entry.notes?.eng ?? '',
    latitude: entry.latitude !== undefined ? String(entry.latitude) : '',
    longitude: entry.longitude !== undefined ? String(entry.longitude) : '',
    // 自定义字段值映射（全部转为 string 供表单绑定） | Custom field values (all stringified for form binding)
    customFieldValues: buildCustomFieldDraftValues(entry.customFields),
    changeReason: '',
    displayNameRows: buildDisplayNameRows(entry, locale, 'current-locale'),
    displayNameHiddenRows: buildDisplayNameRows(entry, locale, 'other-locales'),
  };
}

export function readHistoryFieldLabel(locale: WorkspaceLocale, field: string): string {
  const keyByField: Partial<Record<string, Parameters<typeof t>[1]>> = {
    languageCode: 'workspace.languageMetadata.languageCodeLabel',
    canonicalTag: 'workspace.languageMetadata.canonicalTagLabel',
    iso6391: 'workspace.languageMetadata.iso6391Label',
    iso6392B: 'workspace.languageMetadata.iso6392BLabel',
    iso6392T: 'workspace.languageMetadata.iso6392TLabel',
    iso6393: 'workspace.languageMetadata.iso6393Label',
    glottocode: 'workspace.languageMetadata.glottocodeLabel',
    wikidataId: 'workspace.languageMetadata.wikidataIdLabel',
    englishName: 'workspace.languageMetadata.englishNameLabel',
    localName: 'workspace.languageMetadata.localNameLabel',
    nativeName: 'workspace.languageMetadata.nativeNameLabel',
    aliases: 'workspace.languageMetadata.aliasesLabel',
    scope: 'workspace.languageMetadata.scopeLabel',
    genus: 'workspace.languageMetadata.genusLabel',
    subfamily: 'workspace.languageMetadata.subfamilyLabel',
    branch: 'workspace.languageMetadata.branchLabel',
    classificationPath: 'workspace.languageMetadata.classificationPathLabel',
    macrolanguage: 'workspace.languageMetadata.macrolanguageLabel',
    languageType: 'workspace.languageMetadata.languageTypeLabel',
    countries: 'workspace.languageMetadata.countriesLabel',
    countriesOfficial: 'workspace.languageMetadata.countriesOfficialLabel',
    dialects: 'workspace.languageMetadata.dialectsLabel',
    vernaculars: 'workspace.languageMetadata.vernacularsLabel',
    visibility: 'workspace.languageMetadata.visibilityLabel',
    latitude: 'workspace.languageMetadata.latitudeLabel',
    longitude: 'workspace.languageMetadata.longitudeLabel',
    displayNames: 'workspace.languageMetadata.matrixTitle',
    customFields: 'workspace.languageMetadata.sectionCustomFields',
  };

  const dictKey = keyByField[field];
  return dictKey ? t(locale, dictKey) : field;
}

export function readEntryKindLabel(locale: WorkspaceLocale, entry: LanguageCatalogEntry | null): string {
  if (!entry) {
    return t(locale, 'workspace.languageMetadata.kindCustom');
  }
  if (entry.entryKind === 'custom') {
    return t(locale, 'workspace.languageMetadata.kindCustom');
  }
  if (entry.entryKind === 'override') {
    return t(locale, 'workspace.languageMetadata.kindOverride');
  }
  return t(locale, 'workspace.languageMetadata.kindBuiltIn');
}