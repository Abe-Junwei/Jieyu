import type { LanguageCatalogHistoryDocType } from '../db';
import { t } from '../i18n';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../services/LinguisticService';

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
  family: string;
  subfamily: string;
  macrolanguage: string;
  scope: string;
  languageType: string;
  glottocode: string;
  wikidataId: string;
  visibility: LanguageCatalogVisibility;
  notesZh: string;
  notesEn: string;
  changeReason: string;
  displayNameRows: LanguageDisplayNameDraftRow[];
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

function buildDisplayNameRows(entry: LanguageCatalogEntry | null, locale: WorkspaceLocale): LanguageDisplayNameDraftRow[] {
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
      return true;
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
      family: '',
      subfamily: '',
      macrolanguage: '',
      scope: '',
      languageType: '',
      glottocode: '',
      wikidataId: '',
      visibility: 'visible',
      notesZh: '',
      notesEn: '',
      changeReason: '',
      displayNameRows: [],
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
    family: entry.family ?? '',
    subfamily: entry.subfamily ?? '',
    macrolanguage: entry.macrolanguage ?? '',
    scope: entry.scope ?? '',
    languageType: entry.languageType ?? '',
    glottocode: entry.glottocode ?? '',
    wikidataId: entry.wikidataId ?? '',
    visibility: entry.visibility,
    notesZh: entry.notes?.['zh-CN'] ?? entry.notes?.zho ?? '',
    notesEn: entry.notes?.['en-US'] ?? entry.notes?.eng ?? '',
    changeReason: '',
    displayNameRows: buildDisplayNameRows(entry, locale),
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
    family: 'workspace.languageMetadata.familyLabel',
    subfamily: 'workspace.languageMetadata.subfamilyLabel',
    macrolanguage: 'workspace.languageMetadata.macrolanguageLabel',
    languageType: 'workspace.languageMetadata.languageTypeLabel',
    visibility: 'workspace.languageMetadata.visibilityLabel',
    displayNames: 'workspace.languageMetadata.matrixTitle',
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