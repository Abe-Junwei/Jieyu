import type {
  LanguageCatalogReviewStatus,
  LanguageCatalogSourceType,
  LanguageCatalogVisibility,
  LanguageDisplayNameRole,
  LanguageDocType,
  MultiLangString,
} from '../../db';

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
  subfamily?: string;
  branch?: string;
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
  /** Persisted override for official-status countries (replaces CLDR baseline in UI/search when set). */
  countriesOfficial?: string[];
  /** Glottolog CLDF baseline (read-only) */
  baselineDistributionCountryCodes?: readonly string[];
  /** CLDR official-status baseline (read-only) */
  baselineOfficialCountryCodes?: readonly string[];
  macroarea?: LanguageDocType['macroarea'];
  administrativeDivisions?: LanguageDocType['administrativeDivisions'];
  intergenerationalTransmission?: LanguageDocType['intergenerationalTransmission'];
  domains?: LanguageDocType['domains'];
  officialStatus?: LanguageDocType['officialStatus'];
  egids?: string;
  documentationLevel?: LanguageDocType['documentationLevel'];
  dialects?: string[];
  vernaculars?: string[];
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
  subfamily?: string;
  branch?: string;
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
  countriesOfficial?: string[];
  macroarea?: LanguageDocType['macroarea'];
  administrativeDivisions?: LanguageDocType['administrativeDivisions'];
  intergenerationalTransmission?: LanguageDocType['intergenerationalTransmission'];
  domains?: LanguageDocType['domains'];
  officialStatus?: LanguageDocType['officialStatus'];
  egids?: string;
  documentationLevel?: LanguageDocType['documentationLevel'];
  dialects?: string[];
  vernaculars?: string[];
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
