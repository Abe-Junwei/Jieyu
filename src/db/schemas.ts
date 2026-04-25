/**
 * Zod 验证 Schema 与 validate 函数 | Zod validation schemas and validate functions
 */
import { z } from 'zod';
import { structuralRuleProfileSchema } from '../annotation/structuralRuleProfile';
import { UNIT_SELF_CERTAINTY_VALUES } from '../utils/unitSelfCertainty';
import type { TextDocType, MediaItemDocType, LayerUnitDocType, UnitTokenDocType, UnitMorphemeDocType, AnchorDocType, LexemeDocType, TokenLexemeLinkDocType, AiTaskDoc, EmbeddingDoc, AiConversationDoc, AiMessageDoc, LanguageDocType, LanguageDisplayNameDocType, LanguageAliasDocType, LanguageCatalogHistoryDocType, CustomFieldDefinitionDocType, SpeakerDocType, OrthographyDocType, OrthographyBridgeDocType, LocationDocType, BibliographicSourceDocType, GrammarDocDocType, AbbreviationDocType, StructuralRuleProfileAssetDocType, PhonemeDocType, TagDefinitionDocType, LayerDocType, LayerUnitContentDocType, UnitRelationDocType, LayerLinkDocType, TierDefinitionDocType, TierAnnotationDocType, AuditLogDocType, UserNoteDocType, SegmentMetaDocType, SegmentQualitySnapshotDocType, ScopeStatsSnapshotDocType, SpeakerProfileSnapshotDocType, TranslationStatusSnapshotDocType, LanguageAssetOverviewDocType, AiTaskSnapshotDocType, TrackEntityDocType } from './types';


export const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected ISO date-time string',
});
export const accessRightsSchema = z.enum(['open', 'restricted', 'confidential']);
export const multiLangStringSchema = z.record(z.string(), z.string());
export const transcriptionSchema = z.record(z.string(), z.string());
const aiMetadataSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    model: z.string().optional(),
    generatedAt: isoDateSchema.optional(),
  })
  .passthrough();

const reviewStatusSchema = z.enum(['draft', 'suggested', 'confirmed', 'rejected']);
const actorTypeSchema = z.enum(['human', 'ai', 'system', 'importer']);
const creationMethodSchema = z.enum([
  'manual',
  'import',
  'auto-segmentation',
  'auto-transcription',
  'auto-gloss',
  'alignment',
  'projection',
  'merge',
  'split',
  'migration',
]);
export const provenanceSchema = z.object({
  actorType: actorTypeSchema,
  actorId: z.string().optional(),
  method: creationMethodSchema,
  taskId: z.string().optional(),
  model: z.string().optional(),
  modelVersion: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
  reviewStatus: reviewStatusSchema.optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: isoDateSchema.optional(),
});

const textDocSchema = z.object({
  id: z.string().min(1),
  title: multiLangStringSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  languageCode: z.string().optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const mediaItemDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  filename: z.string().min(1),
  url: z.string().optional(),
  duration: z.number().finite().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  isOfflineCached: z.boolean(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
});

const anchorDocSchema = z.object({
  id: z.string().min(1),
  mediaId: z.string().min(1),
  time: z.number().finite(),
  createdAt: isoDateSchema,
});

const unitTokenDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  unitId: z.string().min(1),
  form: transcriptionSchema,
  gloss: multiLangStringSchema.optional(),
  pos: z.string().optional(),
  lexemeId: z.string().min(1).optional(),
  tokenIndex: z.number().int().min(0),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const unitMorphemeDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  unitId: z.string().min(1),
  tokenId: z.string().min(1),
  form: transcriptionSchema,
  gloss: multiLangStringSchema.optional(),
  pos: z.string().optional(),
  lexemeId: z.string().min(1).optional(),
  morphemeIndex: z.number().int().min(0),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const lexemeDocSchema = z.object({
  id: z.string().min(1),
  lemma: transcriptionSchema,
  lexemeType: z.string().optional(),
  morphemeType: z.string().optional(),
  citationForm: z.string().optional(),
  senses: z
    .array(
      z
        .object({
          gloss: multiLangStringSchema,
          definition: multiLangStringSchema.optional(),
          category: z.string().optional(),
        })
        .passthrough(),
    )
    .min(1),
  forms: z.array(z.object({ transcription: transcriptionSchema }).passthrough()).optional(),
  language: z.string().optional(),
  notes: multiLangStringSchema.optional(),
  tags: z.record(z.string(), z.boolean()).optional(),
  ai_metadata: aiMetadataSchema.optional(),
  provenance: provenanceSchema.optional(),
  examples: z.array(z.string()).optional(),
  usageCount: z.number().int().min(0).optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const tokenLexemeLinkTargetTypeSchema = z.enum(['token', 'morpheme']);
const tokenLexemeLinkRoleSchema = z.enum(['exact', 'stem', 'gloss_candidate', 'manual']);

const tokenLexemeLinkDocSchema = z.object({
  id: z.string().min(1),
  targetType: tokenLexemeLinkTargetTypeSchema,
  targetId: z.string().min(1),
  lexemeId: z.string().min(1),
  role: tokenLexemeLinkRoleSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const aiTaskStatusSchema = z.enum(['pending', 'running', 'done', 'failed']);
const aiTaskTypeSchema = z.enum(['transcribe', 'gloss', 'translate', 'embed', 'detect_language']);

const aiTaskDocSchema = z.object({
  id: z.string().min(1),
  taskType: aiTaskTypeSchema,
  status: aiTaskStatusSchema,
  targetId: z.string().min(1),
  targetType: z.string().optional(),
  modelId: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const embeddingSourceTypeSchema = z.enum(['unit', 'token', 'morpheme', 'lexeme', 'note', 'pdf', 'schema']);

const embeddingDocSchema = z.object({
  id: z.string().min(1),
  sourceType: embeddingSourceTypeSchema,
  sourceId: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().min(1).optional(),
  contentHash: z.string().min(1),
  vector: z.array(z.number().finite()),
  createdAt: isoDateSchema,
});

const aiConversationModeSchema = z.enum(['assistant', 'analysis', 'review']);

const aiConversationDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1).optional(),
  title: z.string().min(1),
  mode: aiConversationModeSchema,
  providerId: z.string().min(1),
  model: z.string().min(1),
  archived: z.boolean().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const aiMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
const aiMessageStatusSchema = z.enum(['streaming', 'done', 'error', 'aborted']);

const aiMessageCitationSchema = z.object({
  type: z.enum(['unit', 'note', 'pdf', 'schema']),
  refId: z.string().min(1),
  label: z.string().optional(),
  snippet: z.string().optional(),
});

const aiMessageDocSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: aiMessageRoleSchema,
  content: z.string(),
  status: aiMessageStatusSchema,
  generationSource: z.enum(['llm', 'local']).optional(),
  generationModel: z.string().optional(),
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
  citations: z.array(aiMessageCitationSchema).optional(),
  errorMessage: z.string().optional(),
  reasoningContent: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageCatalogSourceTypeSchema = z.enum(['built-in-generated', 'built-in-reviewed', 'user-override', 'user-custom']);
const languageCatalogReviewStatusSchema = z.enum(['needs-review', 'verified']);
const languageCatalogVisibilitySchema = z.enum(['visible', 'hidden']);
const languageDisplayNameRoleSchema = z.enum(['preferred', 'autonym', 'exonym', 'historical', 'menu', 'academic', 'search']);
const languageAliasTypeSchema = z.enum(['search', 'display', 'legacy', 'short', 'variant']);
const languageCatalogHistoryActionSchema = z.enum(['create', 'update', 'delete']);

const languageDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  languageCode: z.string().min(1).optional(),
  canonicalTag: z.string().min(1).optional(),
  iso6391: z.string().min(1).optional(),
  iso6392B: z.string().min(1).optional(),
  iso6392T: z.string().min(1).optional(),
  iso6393: z.string().min(1).optional(),
  autonym: z.string().optional(),
  glottocode: z.string().optional(),
  wikidataId: z.string().optional(),
  scope: z.enum(['individual', 'macrolanguage', 'collection', 'special', 'private-use']).optional(),
  macrolanguage: z.string().optional(),
  genus: z.string().optional(),
  classificationPath: z.string().optional(),
  modality: z.enum(['spoken', 'signed', 'written', 'mixed']).optional(),
  languageType: z.enum(['living', 'historical', 'extinct', 'ancient', 'constructed', 'special']).optional(),
  endangermentLevel: z
    .enum([
      'safe',
      'vulnerable',
      'definitely_endangered',
      'severely_endangered',
      'critically_endangered',
      'extinct',
    ])
    .optional(),
  aesStatus: z.enum(['not_endangered', 'threatened', 'shifting', 'moribund', 'nearly_extinct', 'extinct']).optional(),
  endangermentSource: z.string().optional(),
  endangermentAssessmentYear: z.number().int().optional(),
  speakerCountL1: z.number().int().nonnegative().optional(),
  speakerCountL2: z.number().int().nonnegative().optional(),
  speakerCountSource: z.string().optional(),
  speakerCountYear: z.number().int().optional(),
  speakerTrend: z.enum(['growing', 'stable', 'shrinking', 'unknown']).optional(),
  countries: z.array(z.string().min(1)).optional(),
  countriesOfficial: z.array(z.string().min(1)).optional(),
  macroarea: z.enum(['Africa', 'Eurasia', 'Papunesia', 'Australia', 'North America', 'South America']).optional(),
  administrativeDivisions: z.array(z.object({
    country: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    township: z.string().optional(),
    village: z.string().optional(),
    freeText: z.string().optional(),
  })).optional(),
  intergenerationalTransmission: z.enum(['all_ages', 'adults_only', 'elderly_only', 'very_few', 'none']).optional(),
  domains: z.array(z.enum(['home', 'education', 'government', 'media', 'religion', 'commerce', 'literature'])).optional(),
  officialStatus: z.enum(['national', 'regional', 'recognized_minority', 'none']).optional(),
  egids: z.string().optional(),
  documentationLevel: z.enum(['undocumented', 'marginally', 'fragmentary', 'fair', 'well_documented']).optional(),
  dialects: z.array(z.string().min(1)).optional(),
  writingSystems: z.array(z.string().min(1)).optional(),
  literacyRate: z.number().min(0).max(100).optional(),
  locationId: z.string().optional(),
  sourceType: languageCatalogSourceTypeSchema.optional(),
  reviewStatus: languageCatalogReviewStatusSchema.optional(),
  visibility: languageCatalogVisibilitySchema.optional(),
  notes: multiLangStringSchema.optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const customFieldValueTypeSchema = z.enum(['text', 'number', 'boolean', 'select', 'multiselect', 'url']);

const customFieldDefinitionDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  fieldType: customFieldValueTypeSchema,
  options: z.array(z.string()).optional(),
  description: multiLangStringSchema.optional(),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  placeholder: multiLangStringSchema.optional(),
  helpText: multiLangStringSchema.optional(),
  minValue: z.number().finite().optional(),
  maxValue: z.number().finite().optional(),
  pattern: z.string().optional(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageDisplayNameDocSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  locale: z.string().min(1),
  role: languageDisplayNameRoleSchema,
  value: z.string().min(1),
  isPreferred: z.boolean().optional(),
  sourceType: languageCatalogSourceTypeSchema,
  reviewStatus: languageCatalogReviewStatusSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageAliasDocSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  alias: z.string().min(1),
  normalizedAlias: z.string().min(1),
  locale: z.string().min(1).optional(),
  aliasType: languageAliasTypeSchema,
  sourceType: languageCatalogSourceTypeSchema,
  reviewStatus: languageCatalogReviewStatusSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageCatalogHistoryDocSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  action: languageCatalogHistoryActionSchema,
  summary: z.string().min(1),
  changedFields: z.array(z.string().min(1)).optional(),
  reason: z.string().optional(),
  reasonCode: z.string().optional(),
  actorId: z.string().optional(),
  actorType: z.enum(['human', 'ai', 'system', 'importer']).optional(),
  sourceType: languageCatalogSourceTypeSchema.optional(),
  beforePatch: z.record(z.string(), z.unknown()).optional(),
  afterPatch: z.record(z.string(), z.unknown()).optional(),
  sourceRef: z.string().optional(),
  snapshot: z.record(z.string(), z.unknown()).optional(),
  createdAt: isoDateSchema,
});

const speakerDocSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pseudonym: z.string().optional(),
  gender: z.string().optional(),
  birthYear: z.number().int().optional(),
  languageIds: z.array(z.string()).optional(),
  role: z.enum(['speaker', 'translator', 'annotator', 'researcher']).optional(),
  consentStatus: z.enum(['granted', 'restricted', 'anonymous']).optional(),
  accessRights: accessRightsSchema.optional(),
  address: z.string().optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const orthographyDirectionSchema = z.enum(['ltr', 'rtl', 'ttb', 'btt']);
const orthographyExemplarCharactersSchema = z.object({
  main: z.array(z.string()).optional(),
  auxiliary: z.array(z.string()).optional(),
  numbers: z.array(z.string()).optional(),
  punctuation: z.array(z.string()).optional(),
  index: z.array(z.string()).optional(),
}).optional();
const orthographyNormalizationSchema = z.object({
  form: z.enum(['NFC', 'NFD', 'NFKC', 'NFKD']).optional(),
  caseSensitive: z.boolean().optional(),
  stripDefaultIgnorables: z.boolean().optional(),
}).optional();
const orthographyCollationSchema = z.object({
  base: z.string().optional(),
  customRules: z.string().optional(),
}).optional();
const orthographyFontPreferencesSchema = z.object({
  primary: z.array(z.string()).optional(),
  fallback: z.array(z.string()).optional(),
  mono: z.array(z.string()).optional(),
  lineHeightScale: z.number().positive().optional(),
  sizeAdjust: z.number().positive().optional(),
}).optional();
const orthographyInputHintsSchema = z.object({
  keyboardLayout: z.string().optional(),
  imeId: z.string().optional(),
  deadKeys: z.array(z.string()).optional(),
}).optional();
const orthographyBidiPolicySchema = z.object({
  isolateInlineRuns: z.boolean().optional(),
  preferDirAttribute: z.boolean().optional(),
}).optional();
const orthographyBridgeEngineSchema = z.enum(['table-map', 'icu-rule', 'manual']);
const orthographyBridgeRulesSchema = z.object({
  mappings: z.array(z.object({
    from: z.string(),
    to: z.string(),
  })).optional(),
  ruleText: z.string().optional(),
  normalizeInput: z.enum(['NFC', 'NFD', 'NFKC', 'NFKD']).optional(),
  normalizeOutput: z.enum(['NFC', 'NFD', 'NFKC', 'NFKD']).optional(),
  caseSensitive: z.boolean().optional(),
});
const orthographyBridgeDocSchema = z.object({
  id: z.string().min(1),
  sourceOrthographyId: z.string().min(1),
  targetOrthographyId: z.string().min(1),
  name: multiLangStringSchema.optional(),
  engine: orthographyBridgeEngineSchema,
  rules: orthographyBridgeRulesSchema,
  sampleInput: z.string().optional(),
  sampleOutput: z.string().optional(),
  sampleCases: z.array(z.object({
    input: z.string(),
    expectedOutput: z.string().optional(),
  })).optional(),
  isReversible: z.boolean().optional(),
  status: z.enum(['draft', 'active', 'deprecated']).optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const orthographyDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  abbreviation: z.string().optional(),
  languageId: z.string().optional(),
  type: z.enum(['phonemic', 'phonetic', 'practical', 'historical', 'other']).optional(),
  catalogMetadata: z.object({
    catalogSource: z.enum(['user', 'built-in-reviewed', 'built-in-generated']).optional(),
    source: z.string().optional(),
    reviewStatus: z.enum(['needs-review', 'verified-primary', 'verified-secondary', 'historical', 'legacy', 'experimental']).optional(),
    priority: z.enum(['primary', 'secondary']).optional(),
    seedKind: z.string().optional(),
  }).optional(),
  scriptTag: z.string().optional(),
  localeTag: z.string().optional(),
  regionTag: z.string().optional(),
  variantTag: z.string().optional(),
  direction: orthographyDirectionSchema.optional(),
  exemplarCharacters: orthographyExemplarCharactersSchema,
  normalization: orthographyNormalizationSchema,
  collation: orthographyCollationSchema,
  fontPreferences: orthographyFontPreferencesSchema,
  inputHints: orthographyInputHintsSchema,
  bidiPolicy: orthographyBidiPolicySchema,
  conversionRules: z.record(z.string(), z.unknown()).optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
});

const locationDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
});

const bibliographicSourceDocSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()).optional(),
  year: z.number().int().optional(),
  publisher: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  citationKey: z.string().optional(),
  sourceType: z.enum(['book', 'article', 'thesis', 'fieldnotes', 'grammar', 'other']).optional(),
  notes: multiLangStringSchema.optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
});

const grammarDocDocSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  parentId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  linkedSourceIds: z.array(z.string()).optional(),
  linkedExampleIds: z.array(z.string()).optional(),
  ai_metadata: aiMetadataSchema.optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const abbreviationDocSchema = z.object({
  id: z.string().min(1),
  abbreviation: z.string().min(1),
  name: multiLangStringSchema,
  category: z.enum(['person', 'number', 'tense', 'aspect', 'mood', 'case', 'voice', 'other']).optional(),
  isLeipzigStandard: z.boolean().optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
});

const structuralRuleProfileAssetDocSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['system', 'language', 'project', 'user']),
  languageId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  enabled: z.boolean(),
  priority: z.number().int(),
  profile: structuralRuleProfileSchema,
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).superRefine((doc, ctx) => {
  if (doc.scope === 'language' && !doc.languageId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['languageId'],
      message: 'language scoped structural rule profile requires languageId',
    });
  }
  if (doc.scope === 'project' && !doc.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'project scoped structural rule profile requires projectId',
    });
  }
});

const phonemeDocSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  ipa: z.string().min(1),
  type: z.enum(['consonant', 'vowel', 'tone', 'diphthong', 'other']),
  features: z.record(z.string(), z.string()).optional(),
  allophones: z.array(z.string()).optional(),
  distribution: z.string().optional(),
  examples: z.array(z.string()).optional(),
  notes: multiLangStringSchema.optional(),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const tagDefinitionDocSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  description: multiLangStringSchema.optional(),
  color: z.string().optional(),
  scope: z.enum(['unit', 'lexeme', 'annotation', 'global']).optional(),
  createdAt: isoDateSchema,
});

const layerConstraintSchema = z.enum(['symbolic_association', 'independent_boundary', 'time_subdivision']);

const layerDisplaySettingsSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().optional(),
}).optional();

const layerDocBaseSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  languageId: z.string().min(1),
  dialect: z.string().min(1).optional(),
  vernacular: z.string().min(1).optional(),
  orthographyId: z.string().min(1).optional(),
  bridgeId: z.string().min(1).optional(),
  modality: z.enum(['text', 'audio', 'mixed']),
  acceptsAudio: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  constraint: layerConstraintSchema.optional(),
  displaySettings: layerDisplaySettingsSchema,
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const transcriptionLayerDocSchema = layerDocBaseSchema.extend({
  layerType: z.literal('transcription'),
  parentLayerId: z.string().min(1).optional(),
});

const translationLayerDocSchema = layerDocBaseSchema.extend({
  layerType: z.literal('translation'),
}).strict();

const layerDocDiscriminatedSchema = z.discriminatedUnion('layerType', [
  transcriptionLayerDocSchema,
  translationLayerDocSchema,
]);

// 移除未使用的 unitTextDocSchema

const layerUnitTypeSchema = z.enum(['unit', 'segment']);
const layerUnitStatusSchema = z.enum(['raw', 'transcribed', 'translated', 'glossed', 'verified']);
const layerContentRoleSchema = z.enum(['primary_text', 'translation', 'gloss', 'note', 'audio_ref']);
const unitRelationTypeSchema = z.enum(['aligned_to', 'derived_from', 'linked_reference']);

const layerUnitDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1),
    mediaId: z.string().min(1).optional(),
    layerId: z.string().min(1).optional(),
    unitType: layerUnitTypeSchema.optional(),
    parentUnitId: z.string().min(1).optional(),
    rootUnitId: z.string().min(1).optional(),
    startTime: z.number().finite(),
    endTime: z.number().finite(),
    startAnchorId: z.string().min(1).optional(),
    endAnchorId: z.string().min(1).optional(),
    orderKey: z.string().min(1).optional(),
    speakerId: z.string().min(1).optional(),
    selfCertainty: z.enum(UNIT_SELF_CERTAINTY_VALUES).optional(),
    status: layerUnitStatusSchema.optional(),
    externalRef: z.string().min(1).optional(),
    provenance: provenanceSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .passthrough()
  .refine((doc) => doc.endTime >= doc.startTime, {
    message: 'endTime must be >= startTime',
    path: ['endTime'],
  });

const layerUnitContentDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1).optional(),
    unitId: z.string().min(1).optional(),
    layerId: z.string().min(1).optional(),
    contentRole: layerContentRoleSchema.optional(),
    modality: z.enum(['text', 'audio', 'mixed']).optional(),
    text: z.string().optional(),
    mediaRefId: z.string().min(1).optional(),
    sourceType: z.enum(['human', 'ai']).optional(),
    ai_metadata: aiMetadataSchema.optional(),
    provenance: provenanceSchema.optional(),
    accessRights: accessRightsSchema.optional(),
    isVerified: z.boolean().optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .passthrough();

const unitRelationDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1),
    sourceUnitId: z.string().min(1).optional(),
    targetUnitId: z.string().min(1).optional(),
    relationType: unitRelationTypeSchema.optional(),
    provenance: provenanceSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .passthrough();

const tierTypeSchema = z.enum(['time-aligned', 'time-subdivision', 'symbolic-subdivision', 'symbolic-association']);
const tierContentTypeSchema = z.enum(['transcription', 'translation', 'gloss', 'pos', 'note', 'custom']);

const tierDefinitionDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  tierType: tierTypeSchema,
  parentTierId: z.string().min(1).optional(),
  extraParentTierIds: z.array(z.string().min(1)).optional(),
  languageId: z.string().optional(),
  orthographyId: z.string().min(1).optional(),
  bridgeId: z.string().min(1).optional(),
  participantId: z.string().optional(),
  dataCategory: z.string().optional(),
  contentType: tierContentTypeSchema,
  modality: z.enum(['text', 'audio', 'mixed']).optional(),
  acceptsAudio: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  accessRights: accessRightsSchema.optional(),
  delimiter: z.string().optional(),
  sortOrder: z.number().int().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const annotationHypothesisSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

const tierAnnotationDocSchema = z.object({
  id: z.string().min(1),
  tierId: z.string().min(1),
  parentAnnotationId: z.string().min(1).optional(),
  startTime: z.number().finite().optional(),
  endTime: z.number().finite().optional(),
  startAnchorId: z.string().min(1).optional(),
  endAnchorId: z.string().min(1).optional(),
  ordinal: z.number().int().min(0).optional(),
  value: z.string(),
  lexemeId: z.string().min(1).optional(),
  senseIndex: z.number().int().min(0).optional(),
  speakerId: z.string().optional(),
  createdBy: z.string().optional(),
  method: z.string().optional(),
  hypotheses: z.array(annotationHypothesisSchema).optional(),
  ai_metadata: aiMetadataSchema.optional(),
  provenance: provenanceSchema.optional(),
  isVerified: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const auditActionSchema = z.enum(['create', 'update', 'delete']);
const auditSourceSchema = z.enum(['human', 'ai', 'system']);

const auditLogDocSchema = z.object({
  id: z.string().min(1),
  collection: z.string().min(1),
  documentId: z.string().min(1),
  action: auditActionSchema,
  field: z.string().optional(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  source: auditSourceSchema,
  timestamp: isoDateSchema,
  /** 幂等性指纹，便于回放/对比 | Idempotency fingerprint for replay/diff */
  requestId: z.string().optional(),
  /** 结构化回放元数据 | Structured replay metadata */
  metadataJson: z.string().optional(),
});

const layerLinkDocSchema = z.object({
  id: z.string().min(1),
  transcriptionLayerKey: z.string().min(1),
  hostTranscriptionLayerId: z.string().min(1),
  layerId: z.string().min(1),
  linkType: z.enum(['direct', 'free', 'literal', 'pedagogical']),
  isPreferred: z.boolean(),
  createdAt: isoDateSchema,
});

const noteTargetTypeSchema = z.enum([
  'unit', 'translation', 'lexeme',
  'sense', 'tier_annotation', 'text',
  'token', 'morpheme', 'annotation',
]);
const noteCategorySchema = z.enum(['comment', 'question', 'todo', 'linguistic', 'fieldwork', 'correction']);

const userNoteDocSchema = z.object({
  id: z.string().min(1),
  targetType: noteTargetTypeSchema,
  targetId: z.string().min(1),
  targetIndex: z.number().int().min(0).optional(),
  parentTargetId: z.string().min(1).optional(),
  content: multiLangStringSchema,
  category: noteCategorySchema.optional(),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const segmentMetaDocSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  unitKind: layerUnitTypeSchema.optional(),
  textId: z.string().min(1),
  mediaId: z.string().min(1),
  layerId: z.string().min(1),
  hostUnitId: z.string().min(1).optional(),
  startTime: z.number().finite(),
  endTime: z.number().finite(),
  text: z.string(),
  normalizedText: z.string(),
  hasText: z.boolean(),
  effectiveSpeakerId: z.string().min(1).optional(),
  effectiveSpeakerName: z.string().min(1).optional(),
  noteCategoryKeys: z.array(noteCategorySchema).optional(),
  effectiveSelfCertainty: z.enum(UNIT_SELF_CERTAINTY_VALUES).optional(),
  annotationStatus: layerUnitStatusSchema.optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  sourceType: z.enum(['human', 'ai']).optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).refine((doc) => doc.endTime >= doc.startTime, {
  message: 'endTime must be >= startTime',
  path: ['endTime'],
});

const segmentQualityIssueKeySchema = z.enum(['empty_text', 'missing_speaker', 'low_ai_confidence', 'todo_note']);
const segmentQualitySeveritySchema = z.enum(['ok', 'warning', 'critical']);
const scopeStatsSnapshotScopeTypeSchema = z.enum(['project', 'text', 'media', 'layer', 'speaker']);
const translationStatusSnapshotStatusSchema = z.enum(['missing', 'draft', 'translated', 'verified']);

const segmentQualitySnapshotDocSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  textId: z.string().min(1),
  mediaId: z.string().min(1),
  layerId: z.string().min(1),
  hostUnitId: z.string().min(1).optional(),
  speakerId: z.string().min(1).optional(),
  speakerName: z.string().min(1).optional(),
  emptyText: z.boolean(),
  missingSpeaker: z.boolean(),
  lowAiConfidence: z.boolean(),
  hasTodoNote: z.boolean(),
  issueKeys: z.array(segmentQualityIssueKeySchema),
  issueCount: z.number().int().min(0),
  severity: segmentQualitySeveritySchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const scopeStatsSnapshotDocSchema = z.object({
  id: z.string().min(1),
  scopeType: scopeStatsSnapshotScopeTypeSchema,
  scopeKey: z.string().min(1),
  textId: z.string().min(1).optional(),
  mediaId: z.string().min(1).optional(),
  layerId: z.string().min(1).optional(),
  speakerId: z.string().min(1).optional(),
  unitCount: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  speakerCount: z.number().int().min(0),
  translationLayerCount: z.number().int().min(0),
  noteFlaggedCount: z.number().int().min(0),
  untranscribedCount: z.number().int().min(0),
  missingSpeakerCount: z.number().int().min(0),
  avgAiConfidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const speakerProfileSnapshotDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  speakerId: z.string().min(1),
  speakerName: z.string().min(1).optional(),
  unitCount: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  totalDurationSec: z.number().min(0),
  noteFlaggedCount: z.number().int().min(0),
  emptyTextCount: z.number().int().min(0),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const translationStatusSnapshotDocSchema = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  textId: z.string().min(1),
  mediaId: z.string().min(1),
  layerId: z.string().min(1),
  parentUnitId: z.string().min(1).optional(),
  status: translationStatusSnapshotStatusSchema,
  hasText: z.boolean(),
  textLength: z.number().int().min(0),
  sourceType: z.enum(['human', 'ai']).optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageAssetOverviewDocSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  displayName: z.string(),
  aliasCount: z.number().int().min(0),
  orthographyCount: z.number().int().min(0),
  bridgeCount: z.number().int().min(0),
  hasCustomFields: z.boolean(),
  completenessScore: z.number().min(0).max(1),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const aiTaskSnapshotDocSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  taskType: aiTaskTypeSchema,
  status: aiTaskStatusSchema,
  targetId: z.string().min(1),
  targetType: z.string().optional(),
  modelId: z.string().optional(),
  hasError: z.boolean(),
  isTerminal: z.boolean(),
  durationMs: z.number().min(0),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

// ── 验证函数 | Validate functions ──────────────────────────────────────────

export function validateTextDoc(doc: TextDocType): void {
  textDocSchema.parse(doc);
}

export function validateMediaItemDoc(doc: MediaItemDocType): void {
  mediaItemDocSchema.parse(doc);
}

export function validateLexemeDoc(doc: LexemeDocType): void {
  lexemeDocSchema.parse(doc);
}

export function validateAnchorDoc(doc: AnchorDocType): void {
  anchorDocSchema.parse(doc);
}

export function validateUnitTokenDoc(doc: UnitTokenDocType): void {
  unitTokenDocSchema.parse(doc);
}

export function validateUnitMorphemeDoc(doc: UnitMorphemeDocType): void {
  unitMorphemeDocSchema.parse(doc);
}

export function validateTokenLexemeLinkDoc(doc: TokenLexemeLinkDocType): void {
  tokenLexemeLinkDocSchema.parse(doc);
}

export function validateAiTaskDoc(doc: AiTaskDoc): void {
  aiTaskDocSchema.parse(doc);
}

export function validateEmbeddingDoc(doc: EmbeddingDoc): void {
  embeddingDocSchema.parse(doc);
}

export function validateAiConversationDoc(doc: AiConversationDoc): void {
  aiConversationDocSchema.parse(doc);
}

export function validateAiMessageDoc(doc: AiMessageDoc): void {
  aiMessageDocSchema.parse(doc);
}

export function validateLanguageDoc(doc: LanguageDocType): void {
  languageDocSchema.parse(doc);
}

export function validateLanguageDisplayNameDoc(doc: LanguageDisplayNameDocType): void {
  languageDisplayNameDocSchema.parse(doc);
}

export function validateLanguageAliasDoc(doc: LanguageAliasDocType): void {
  languageAliasDocSchema.parse(doc);
}

export function validateLanguageCatalogHistoryDoc(doc: LanguageCatalogHistoryDocType): void {
  languageCatalogHistoryDocSchema.parse(doc);
}

export function validateCustomFieldDefinitionDoc(doc: CustomFieldDefinitionDocType): void {
  customFieldDefinitionDocSchema.parse(doc);
}

export function validateSpeakerDoc(doc: SpeakerDocType): void {
  speakerDocSchema.parse(doc);
}

export function validateOrthographyDoc(doc: OrthographyDocType): void {
  orthographyDocSchema.parse(doc);
}

export function validateOrthographyBridgeDoc(doc: OrthographyBridgeDocType): void {
  orthographyBridgeDocSchema.parse(doc);
}

export function validateLocationDoc(doc: LocationDocType): void {
  locationDocSchema.parse(doc);
}

export function validateBibliographicSourceDoc(doc: BibliographicSourceDocType): void {
  bibliographicSourceDocSchema.parse(doc);
}

export function validateGrammarDoc(doc: GrammarDocDocType): void {
  grammarDocDocSchema.parse(doc);
}

export function validateAbbreviationDoc(doc: AbbreviationDocType): void {
  abbreviationDocSchema.parse(doc);
}

export function validateStructuralRuleProfileAssetDoc(doc: StructuralRuleProfileAssetDocType): void {
  structuralRuleProfileAssetDocSchema.parse(doc);
}

export function validatePhonemeDoc(doc: PhonemeDocType): void {
  phonemeDocSchema.parse(doc);
}

export function validateTagDefinitionDoc(doc: TagDefinitionDocType): void {
  tagDefinitionDocSchema.parse(doc);
}

export function validateLayerDoc(doc: LayerDocType): void {
  layerDocDiscriminatedSchema.parse(doc);
}

export function validateLayerUnitDoc(doc: LayerUnitDocType): void {
  layerUnitDocSchema.parse(doc);
}

export function validateLayerUnitContentDoc(doc: LayerUnitContentDocType): void {
  layerUnitContentDocSchema.parse(doc);
}

export function validateUnitRelationDoc(doc: UnitRelationDocType): void {
  unitRelationDocSchema.parse(doc);
}

export function validateLayerLinkDoc(doc: LayerLinkDocType): void {
  layerLinkDocSchema.parse(doc);
}

export function validateTierDefinitionDoc(doc: TierDefinitionDocType): void {
  tierDefinitionDocSchema.parse(doc);
}

export function validateTierAnnotationDoc(doc: TierAnnotationDocType): void {
  tierAnnotationDocSchema.parse(doc);
}

export function validateAuditLogDoc(doc: AuditLogDocType): void {
  auditLogDocSchema.parse(doc);
}

export function validateUserNoteDoc(doc: UserNoteDocType): void {
  userNoteDocSchema.parse(doc);
}

export function validateSegmentMetaDoc(doc: SegmentMetaDocType): void {
  segmentMetaDocSchema.parse(doc);
}

export function validateSegmentQualitySnapshotDoc(doc: SegmentQualitySnapshotDocType): void {
  segmentQualitySnapshotDocSchema.parse(doc);
}

export function validateScopeStatsSnapshotDoc(doc: ScopeStatsSnapshotDocType): void {
  scopeStatsSnapshotDocSchema.parse(doc);
}

export function validateSpeakerProfileSnapshotDoc(doc: SpeakerProfileSnapshotDocType): void {
  speakerProfileSnapshotDocSchema.parse(doc);
}

export function validateTranslationStatusSnapshotDoc(doc: TranslationStatusSnapshotDocType): void {
  translationStatusSnapshotDocSchema.parse(doc);
}

export function validateLanguageAssetOverviewDoc(doc: LanguageAssetOverviewDocType): void {
  languageAssetOverviewDocSchema.parse(doc);
}

export function validateAiTaskSnapshotDoc(doc: AiTaskSnapshotDocType): void {
  aiTaskSnapshotDocSchema.parse(doc);
}

// ─── Track entity doc (per-media track display state) ─────────────────────────

const trackEntityDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  mediaId: z.string().min(1),
  mode: z.enum(['single', 'multi-auto', 'multi-locked', 'multi-speaker-fixed']),
  laneLockMap: z.record(z.string(), z.number().int().min(0)),
  updatedAt: isoDateSchema,
});

export function validateTrackEntityDoc(doc: TrackEntityDocType): void {
  trackEntityDocSchema.parse(doc);
}

