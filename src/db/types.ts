/**
 * 数据库文档类型定义 | Database document type definitions
 *
 * 所有 IndexedDB 集合的接口、枚举类型和实用类型别名。
 * All interfaces, enum types, and utility type aliases for IndexedDB collections.
 */

import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

/**
 * 层数量软上限（UI 警告，非硬限制）
 * Soft limits for layer counts (UI warning, not hard limits)
 */
export const LAYER_SOFT_LIMITS = { transcription: 5, translation: 10 } as const;

export interface MultiLangString {
  [languageTag: string]: string;
}

export interface Transcription {
  [orthographyKey: string]: string;
}

export interface AiMetadata {
  confidence: number;
  model?: string;
  generatedAt?: string;
  [key: string]: unknown;
}

export type ReviewStatus = 'draft' | 'suggested' | 'confirmed' | 'rejected';
export type ActorType = 'human' | 'ai' | 'system' | 'importer';
export type CreationMethod =
  | 'manual'
  | 'import'
  | 'auto-segmentation'
  | 'auto-transcription'
  | 'auto-gloss'
  | 'alignment'
  | 'projection'
  | 'merge'
  | 'split'
  | 'migration';

export interface ProvenanceEnvelope {
  actorType: ActorType;
  actorId?: string;
  method: CreationMethod;
  taskId?: string;
  model?: string;
  modelVersion?: string;
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface TextDocType {
  id: string;
  title: MultiLangString;
  metadata?: Record<string, unknown>;
  languageCode?: string;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

export interface MediaItemDocType {
  id: string;
  textId: string;
  filename: string;
  url?: string;
  duration?: number;
  details?: Record<string, unknown>;
  isOfflineCached: boolean;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
}

// ── Morpheme-level annotation types ──────────────────────────────────────────

/**
 * A single morpheme within a word.
 * Maps to FLEx morpheme entries and Toolbox \mb/\ge markers.
 */
export interface Morpheme {
  id?: string;
  /** Surface form of this morpheme, keyed by orthography (e.g. 'default', 'ipa') */
  form: Transcription;
  /** Interlinear gloss keyed by language tag (e.g. { eng: 'run', zho: '跑' }) */
  gloss?: MultiLangString;
  /** Part-of-speech tag (Leipzig abbreviation, e.g. 'V', 'N.SG') */
  pos?: string;
  /** Optional link to a lexeme entry in the lexemes table */
  lexemeId?: string;
  /** Provenance tracking for morpheme-level edits */
  provenance?: ProvenanceEnvelope;
}

/**
 * A single word token within an unit.
 * Contains optional morpheme decomposition for interlinear glossing.
 */
export interface UnitWord {
  id?: string;
  /** Surface form of this word, keyed by orthography */
  form: Transcription;
  /** Word-level interlinear gloss */
  gloss?: MultiLangString;
  /** Part-of-speech tag */
  pos?: string;
  /** Sub-word morpheme decomposition (for FLEx/Toolbox interlinear data) */
  morphemes?: Morpheme[];
  /** Optional link to a lexeme entry */
  lexemeId?: string;
  /** Provenance tracking for gloss/pos edits (who glossed this word) */
  provenance?: ProvenanceEnvelope;
}


/** Canonical token entity (v17+), independent of unit.words cache. */
export interface UnitTokenDocType {
  id: string;
  textId: string;
  /** Layer unit id (unit-type host); M18+ canonical foreign key. */
  unitId: string;
  form: Transcription;
  gloss?: MultiLangString;
  pos?: string;
  lexemeId?: string;
  tokenIndex: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

/** Canonical morpheme entity (v16), tied to unit token entities. */
export interface UnitMorphemeDocType {
  id: string;
  textId: string;
  /** Layer unit id (unit-type host); M18+ canonical foreign key. */
  unitId: string;
  tokenId: string;
  form: Transcription;
  gloss?: MultiLangString;
  pos?: string;
  lexemeId?: string;
  morphemeIndex: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

export interface AnchorDocType {
  id: string;
  mediaId: string;
  time: number;
  createdAt: string;
}

export interface Sense {
  gloss: MultiLangString;
  definition?: MultiLangString;
  category?: string;
  [key: string]: unknown;
}

export interface Form {
  transcription: Transcription;
  [key: string]: unknown;
}

export interface LexemeDocType {
  id: string;
  lemma: Transcription;
  lexemeType?: string;
  morphemeType?: string;
  citationForm?: string;
  senses: Sense[];
  forms?: Form[];
  language?: string;
  notes?: MultiLangString;
  tags?: Record<string, boolean>;
  ai_metadata?: AiMetadata;
  provenance?: ProvenanceEnvelope;
  examples?: string[];
  usageCount?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

export type TokenLexemeLinkTargetType = 'token' | 'morpheme';
export type TokenLexemeLinkRole = 'exact' | 'stem' | 'gloss_candidate' | 'manual';

export interface TokenLexemeLinkDocType {
  id: string;
  targetType: TokenLexemeLinkTargetType;
  targetId: string; // unit_tokens.id or unit_morphemes.id
  lexemeId: string;
  role?: TokenLexemeLinkRole;
  confidence?: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

export type AiTaskStatus = 'pending' | 'running' | 'done' | 'failed';
export type AiTaskType = 'transcribe' | 'gloss' | 'translate' | 'embed' | 'detect_language';

export interface AiTaskDoc {
  id: string;
  taskType: AiTaskType;
  status: AiTaskStatus;
  targetId: string;
  targetType?: string;
  modelId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type EmbeddingSourceType = 'unit' | 'token' | 'morpheme' | 'lexeme' | 'note' | 'pdf' | 'schema';

export interface EmbeddingDoc {
  id: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  model: string;
  modelVersion?: string;
  contentHash: string;
  vector: number[];
  createdAt: string;
}

export type AiConversationMode = 'assistant' | 'analysis' | 'review';

export interface AiConversationDoc {
  id: string;
  textId?: string;
  title: string;
  mode: AiConversationMode;
  providerId: string;
  model: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type AiMessageStatus = 'streaming' | 'done' | 'error' | 'aborted';

export interface AiMessageCitation {
  type: 'unit' | 'note' | 'pdf' | 'schema';
  refId: string;
  label?: string;
  snippet?: string;
  /** Timeline read-model epoch when RAG ran (same instant as prompt `timelineReadModelEpoch`). */
  readModelEpochAtRetrieval?: number;
  /**
   * For `unit` only: whether `refId` was present in `localUnitIndex` at retrieval time.
   * Omitted when the index was incomplete or unavailable (unknown), not a confirmed hit/miss.
   */
  readModelIndexHit?: boolean;
}

export interface AiMessageDoc {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  contextSnapshot?: Record<string, unknown>;
  citations?: AiMessageCitation[];
  errorMessage?: string;
  reasoningContent?: string;
  createdAt: string;
  updatedAt: string;
}

export type LanguageCatalogSourceType = 'built-in-generated' | 'built-in-reviewed' | 'user-override' | 'user-custom';
export type LanguageCatalogReviewStatus = 'needs-review' | 'verified';
export type LanguageCatalogVisibility = 'visible' | 'hidden';
export type LanguageDisplayNameRole = 'preferred' | 'autonym' | 'exonym' | 'historical' | 'menu' | 'academic' | 'search';
export type LanguageAliasType = 'search' | 'display' | 'legacy' | 'short' | 'variant';
export type LanguageCatalogHistoryAction = 'create' | 'update' | 'delete';

export interface LanguageDocType {
  id: string;
  name: MultiLangString;
  languageCode?: string;
  canonicalTag?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6393?: string;
  autonym?: string;
  glottocode?: string;
  wikidataId?: string;
  scope?: 'individual' | 'macrolanguage' | 'collection' | 'special' | 'private-use';
  macrolanguage?: string;
  genus?: string;
  subfamily?: string;
  branch?: string;
  classificationPath?: string;
  modality?: 'spoken' | 'signed' | 'written' | 'mixed';
  languageType?: 'living' | 'historical' | 'extinct' | 'ancient' | 'constructed' | 'special';
  endangermentLevel?:
    | 'safe'
    | 'vulnerable'
    | 'definitely_endangered'
    | 'severely_endangered'
    | 'critically_endangered'
    | 'extinct';
  aesStatus?: 'not_endangered' | 'threatened' | 'shifting' | 'moribund' | 'nearly_extinct' | 'extinct';
  endangermentSource?: string;
  endangermentAssessmentYear?: number;
  speakerCountL1?: number;
  speakerCountL2?: number;
  speakerCountSource?: string;
  speakerCountYear?: number;
  speakerTrend?: 'growing' | 'stable' | 'shrinking' | 'unknown';
  countries?: string[];
  /** User override for CLDR official-status territory list (ISO 3166-1 alpha-2 or labels); empty/absent uses baseline. */
  countriesOfficial?: string[];
  macroarea?: 'Africa' | 'Eurasia' | 'Papunesia' | 'Australia' | 'North America' | 'South America';
  administrativeDivisions?: { country?: string; province?: string; city?: string; county?: string; township?: string; village?: string; freeText?: string }[];
  intergenerationalTransmission?: 'all_ages' | 'adults_only' | 'elderly_only' | 'very_few' | 'none';
  domains?: ('home' | 'education' | 'government' | 'media' | 'religion' | 'commerce' | 'literature')[];
  officialStatus?: 'national' | 'regional' | 'recognized_minority' | 'none';
  egids?: string;
  documentationLevel?: 'undocumented' | 'marginally' | 'fragmentary' | 'fair' | 'well_documented';
  dialects?: string[];
  vernaculars?: string[];
  writingSystems?: string[];
  literacyRate?: number;
  latitude?: number;
  longitude?: number;
  locationId?: string;
  sourceType?: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  visibility?: LanguageCatalogVisibility;
  notes?: MultiLangString;
  customFields?: Record<string, string | number | boolean | string[]>;
  createdAt: string;
  updatedAt: string;
}

// 自定义字段值类型 | Custom field value type
export type CustomFieldValueType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'url';

export interface CustomFieldDefinitionDocType {
  id: string;
  name: MultiLangString;
  fieldType: CustomFieldValueType;
  options?: string[];
  description?: MultiLangString;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  placeholder?: MultiLangString;
  helpText?: MultiLangString;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageDisplayNameDocType {
  id: string;
  languageId: string;
  locale: string;
  role: LanguageDisplayNameRole;
  value: string;
  isPreferred?: boolean;
  sourceType: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageAliasDocType {
  id: string;
  languageId: string;
  alias: string;
  normalizedAlias: string;
  locale?: string;
  aliasType: LanguageAliasType;
  sourceType: LanguageCatalogSourceType;
  reviewStatus?: LanguageCatalogReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageCatalogHistoryDocType {
  id: string;
  languageId: string;
  action: LanguageCatalogHistoryAction;
  summary: string;
  changedFields?: string[];
  reason?: string;
  reasonCode?: string;
  actorId?: string;
  actorType?: ActorType;
  sourceType?: LanguageCatalogSourceType;
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
  sourceRef?: string;
  snapshot?: Record<string, unknown>;
  createdAt: string;
}

export interface SpeakerDocType {
  id: string;
  name: string;
  pseudonym?: string;
  gender?: string;
  birthYear?: number;
  languageIds?: string[];
  role?: 'speaker' | 'translator' | 'annotator' | 'researcher';
  consentStatus?: 'granted' | 'restricted' | 'anonymous';
  accessRights?: 'open' | 'restricted' | 'confidential';
  address?: string;
  notes?: MultiLangString;
  createdAt: string;
  updatedAt: string;
}

export interface OrthographyDocType {
  id: string;
  name: MultiLangString;
  abbreviation?: string;
  languageId?: string;
  type?: 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other';
  /** Catalog provenance and review state | 目录来源与审校状态 */
  catalogMetadata?: {
    catalogSource?: 'user' | 'built-in-reviewed' | 'built-in-generated';
    source?: string;
    reviewStatus?: 'needs-review' | 'verified-primary' | 'verified-secondary' | 'historical' | 'legacy' | 'experimental';
    priority?: 'primary' | 'secondary';
    seedKind?: string;
  };
  /** BCP 47 script subtag (e.g. 'Latn', 'Thai', 'Deva') */
  scriptTag?: string;
  /** BCP 47 locale / region / variant hints | BCP 47 locale / region / variant hints */
  localeTag?: string;
  regionTag?: string;
  variantTag?: string;
  /** Primary writing direction | 主要书写方向 */
  direction?: 'ltr' | 'rtl' | 'ttb' | 'btt';
  /** CLDR/SLDR-style exemplar characters | 参考 CLDR/SLDR 的示例字符集 */
  exemplarCharacters?: {
    main?: string[];
    auxiliary?: string[];
    numbers?: string[];
    punctuation?: string[];
    index?: string[];
  };
  /** Text normalization preferences | 文本正规化偏好 */
  normalization?: {
    form?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
    caseSensitive?: boolean;
    stripDefaultIgnorables?: boolean;
  };
  /** Sorting / collation hints | 排序/比较规则提示 */
  collation?: {
    base?: string;
    customRules?: string;
  };
  /** Preferred font stacks and rendering hints | 字体栈与渲染提示 */
  fontPreferences?: {
    primary?: string[];
    fallback?: string[];
    mono?: string[];
    lineHeightScale?: number;
    sizeAdjust?: number;
  };
  /** Input method hints | 输入法/键盘提示 */
  inputHints?: {
    keyboardLayout?: string;
    imeId?: string;
    deadKeys?: string[];
  };
  /** bidi rendering hints | 双向文字渲染提示 */
  bidiPolicy?: {
    isolateInlineRuns?: boolean;
    preferDirAttribute?: boolean;
  };
  /** Transliteration / conversion rule definitions (F30 预留) */
  conversionRules?: Record<string, unknown>;
  notes?: MultiLangString;
  createdAt: string;
  updatedAt?: string;
}

export type OrthographyBridgeEngine = 'table-map' | 'icu-rule' | 'manual';

export interface OrthographyBridgeDocType {
  id: string;
  sourceOrthographyId: string;
  targetOrthographyId: string;
  name?: MultiLangString;
  engine: OrthographyBridgeEngine;
  rules: {
    mappings?: Array<{ from: string; to: string }>;
    ruleText?: string;
    normalizeInput?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
    normalizeOutput?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
    caseSensitive?: boolean;
  };
  sampleInput?: string;
  sampleOutput?: string;
  sampleCases?: Array<{ input: string; expectedOutput?: string }>;
  isReversible?: boolean;
  status?: 'draft' | 'active' | 'deprecated';
  notes?: MultiLangString;
  createdAt: string;
  updatedAt: string;
}

export interface LocationDocType {
  id: string;
  name: MultiLangString;
  latitude?: number;
  longitude?: number;
  region?: string;
  country?: string;
  notes?: MultiLangString;
  createdAt: string;
}

export interface BibliographicSourceDocType {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  publisher?: string;
  doi?: string;
  url?: string;
  citationKey?: string;
  sourceType?: 'book' | 'article' | 'thesis' | 'fieldnotes' | 'grammar' | 'other';
  notes?: MultiLangString;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
}

export interface GrammarDocDocType {
  id: string;
  title: string;
  content: string;
  parentId?: string;
  sortOrder?: number;
  linkedSourceIds?: string[];
  linkedExampleIds?: string[];
  ai_metadata?: AiMetadata;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

export interface AbbreviationDocType {
  id: string;
  abbreviation: string;
  name: MultiLangString;
  category?: 'person' | 'number' | 'tense' | 'aspect' | 'mood' | 'case' | 'voice' | 'other';
  isLeipzigStandard?: boolean;
  notes?: MultiLangString;
  createdAt: string;
}

export interface PhonemeDocType {
  id: string;
  languageId: string;
  ipa: string;
  type: 'consonant' | 'vowel' | 'tone' | 'diphthong' | 'other';
  features?: Record<string, string>;
  allophones?: string[];
  distribution?: string;
  examples?: string[];
  notes?: MultiLangString;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

export interface TagDefinitionDocType {
  id: string;
  key: string;
  name: MultiLangString;
  description?: MultiLangString;
  color?: string;
  scope?: 'unit' | 'lexeme' | 'annotation' | 'global';
  createdAt: string;
}

/**
 * 层间边界约束（对齐 ELAN LINGUISTIC_TYPE.CONSTRAINTS）| Layer boundary constraint (aligned with ELAN LINGUISTIC_TYPE.CONSTRAINTS)
 * - 'symbolic_association': 继承父层边界 1:1（默认，翻译层） | Inherit parent boundaries 1:1 (default, translation)
 * - 'independent_boundary': 完全独立边界，由当前 canonical segment graph（LayerUnit 真源）承载 | Fully independent boundaries are stored in the canonical segment graph backed by LayerUnit.
 * - 'time_subdivision': 在父段时间范围内自由细分（Phase 2）| Free subdivision within parent segment time range (Phase 2)
 */
export type LayerConstraint = 'symbolic_association' | 'independent_boundary' | 'time_subdivision';

/** 层级显示样式设置 | Layer-level display style settings */
export interface LayerDisplaySettings {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

/** 层文档公共字段（不含树父；树父仅属于转写层）| Shared layer fields (no tree parent). */
export interface LayerDocBase {
  id: string;
  textId: string;
  key: string;
  name: MultiLangString;
  languageId: string;
  /** 方言（可选）| Dialect label (optional) */
  dialect?: string;
  /** 土语（可选）| Vernacular label (optional) */
  vernacular?: string;
  /** 绑定的正字法 ID；为空时回退到 languageId → script 推断 | Bound orthography id; falls back to languageId → script inference when absent */
  orthographyId?: string;
  /** 首选入站桥接规则 ID；用于显式写入转换往返 | Preferred inbound bridge bridge id for explicit write-bridge round-tripping */
  bridgeId?: string;
  modality: 'text' | 'audio' | 'mixed';
  acceptsAudio?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  /** 边界约束类型（默认 'symbolic_association'）| Boundary constraint type (default 'symbolic_association') */
  constraint?: LayerConstraint;
  /** 层级显示样式 | Display style configuration */
  displaySettings?: LayerDisplaySettings;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

/** 转写层：可使用 parentLayerId 表示层树 / bundle 挂靠 | Transcription layer; tree parent id allowed */
export interface TranscriptionLayerDocType extends LayerDocBase {
  layerType: 'transcription';
  parentLayerId?: string;
}

/** 翻译层：宿主仅 `layer_links`；持久化不得含 parentLayerId | Translation layer; hosts are layer_links only */
export interface TranslationLayerDocType extends LayerDocBase {
  layerType: 'translation';
}

export type LayerDocType = TranscriptionLayerDocType | TranslationLayerDocType;

/** 转写层树父 id；翻译层恒为 undefined | Transcription tree parent only */
export function layerTranscriptionTreeParentId(layer: LayerDocType): string | undefined {
  return layer.layerType === 'transcription' ? layer.parentLayerId : undefined;
}

/** 持久化/合并时去掉翻译层上的非法 `parentLayerId` 键（若存在）| Strip stale parent key on translation rows */
export function stripForbiddenTranslationParentLayerId(layer: LayerDocType): LayerDocType {
  if (layer.layerType !== 'translation') return layer;
  if (!('parentLayerId' in layer) || (layer as Record<string, unknown>).parentLayerId === undefined) {
    return layer;
  }
  const { parentLayerId: _removed, ...rest } = layer as TranslationLayerDocType & { parentLayerId?: string };
  return rest as TranslationLayerDocType;
}

export type LayerUnitType = 'unit' | 'segment';
export type LayerUnitStatus = 'raw' | 'transcribed' | 'translated' | 'glossed' | 'verified';
export type LayerContentRole = 'primary_text' | 'translation' | 'gloss' | 'note' | 'audio_ref';
export type UnitRelationType = 'aligned_to' | 'derived_from' | 'linked_reference';
export type UnitRelationLinkType = 'equivalent' | 'projection' | 'bridge' | 'time_subdivision';

/**
 * 统一层时间单元（终态基座）| Unified layer timeline unit (final-model foundation)
 *
 * 这里保留少量 UI 读模型补充字段；持久化仍统一落盘到 canonical 字段
 * （parentUnitId / orderKey / status 等）。
 * A small set of UI-facing read-model fields remains here while persistence stays
 * fully canonical.
 */
export interface LayerUnitDocType {
  id: string;
  textId: string;
  mediaId?: string | undefined;
  layerId?: string | undefined;
  unitType?: LayerUnitType | undefined;
  parentUnitId?: string | undefined;
  rootUnitId?: string | undefined;
  startTime: number;
  endTime: number;
  startAnchorId?: string | undefined;
  endAnchorId?: string | undefined;
  orderKey?: string | undefined;
  speakerId?: string | undefined;
  /** 句段级自我确信度（仅 unit 单元使用）| Unit-level self-certainty (unit units only) */
  selfCertainty?: UnitSelfCertainty | undefined;
  status?: LayerUnitStatus | undefined;
  externalRef?: string | undefined;
  provenance?: ProvenanceEnvelope | undefined;
  createdAt: string;
  updatedAt: string;

  /** UI 读模型补充字段 | UI read-model supplement fields */
  transcription?: Transcription | undefined;
  speaker?: string | undefined;
  language?: string | undefined;
  notes?: MultiLangString | undefined;
  noteCategoryKeys?: NoteCategory[] | undefined;
  tags?: Record<string, boolean> | undefined;
  ai_metadata?: AiMetadata | undefined;
  aiMode?: 'AUTO' | 'SUGGEST' | undefined;
  words?: UnitWord[] | undefined;
  accessRights?: 'open' | 'restricted' | 'confidential' | undefined;

  /** 迁移兼容字段（读模型）| Migration compatibility fields (read model) */
  unitId?: string | undefined;
  ordinal?: number | undefined;
  annotationStatus?: LayerUnitStatus | undefined;
}

export type LayerSegmentViewDocType = LayerUnitDocType & {
  unitId?: string | undefined;
  ordinal?: number | undefined;
  annotationStatus?: LayerUnitStatus | undefined;
};

/**
 * 统一层时间单元内容载荷 | Unified layer timeline unit content payload
 */
export interface LayerUnitContentDocType {
  id: string;
  textId?: string | undefined;
  unitId?: string | undefined;
  layerId?: string | undefined;
  contentRole?: LayerContentRole | undefined;
  modality?: 'text' | 'audio' | 'mixed' | undefined;
  text?: string;
  mediaRefId?: string | undefined;
  sourceType?: 'human' | 'ai' | undefined;
  ai_metadata?: AiMetadata | undefined;
  provenance?: ProvenanceEnvelope | undefined;
  accessRights?: 'open' | 'restricted' | 'confidential' | undefined;
  isVerified?: boolean | undefined;
  createdAt: string;
  updatedAt: string;

  /** 可选内容补充字段 | Optional content supplement fields */
  segmentId?: string | undefined;
  translationAudioMediaId?: string | undefined;
  recordedBySpeakerId?: string | undefined;
  externalRef?: string | undefined;
}

export type LayerUnitContentViewDocType = LayerUnitContentDocType & {
  unitId?: string | undefined;
  segmentId?: string | undefined;
  translationAudioMediaId?: string | undefined;
};

/**
 * 统一层单元关系表 | Unified layer unit relation table
 */
export interface UnitRelationDocType {
  id: string;
  textId: string;
  sourceUnitId?: string | undefined;
  targetUnitId?: string | undefined;
  relationType?: UnitRelationType | undefined;
  provenance?: ProvenanceEnvelope | undefined;
  createdAt: string;
  updatedAt: string;

  /** 可选关系元数据 | Optional relation metadata */
  sourceSegmentId?: string | undefined;
  targetSegmentId?: string | undefined;
  linkType?: UnitRelationLinkType | undefined;
  sourceLayerId?: string | undefined;
  targetLayerId?: string | undefined;
  unitId?: string | undefined;
  confidence?: number | undefined;
}

export type UnitRelationViewDocType = UnitRelationDocType & {
  sourceSegmentId?: string | undefined;
  targetSegmentId?: string | undefined;
  linkType?: UnitRelationLinkType | undefined;
};

export interface LayerLinkDocType {
  id: string;
  transcriptionLayerKey: string;
  /** 宿主转写层 ID（已成为 SSOT）| Host transcription layer id (SSOT for host relationship). */
  hostTranscriptionLayerId: string;
  /** 链接翻译层 ID（历史字段名为 layerId）| Linked translation layer id (legacy field name is layerId). */
  layerId: string;
  /** 链接类型：literal 在中文术语中统一为“对应链接” | Link type: literal maps to "corresponding link" in CN terminology. */
  linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
  isPreferred: boolean;
  createdAt: string;
}

export type TierType = 'time-aligned' | 'time-subdivision' | 'symbolic-subdivision' | 'symbolic-association';
export type TierContentType = 'transcription' | 'translation' | 'gloss' | 'pos' | 'note' | 'custom';

export interface TierDefinitionDocType {
  id: string;
  textId: string;
  key: string;
  name: MultiLangString;
  tierType: TierType;
  parentTierId?: string;
  /** 翻译层额外宿主（tier 主 parentTierId 为首选宿主）| Extra host transcription tier ids for multi-host translation */
  extraParentTierIds?: string[];
  languageId?: string;
  orthographyId?: string;
  bridgeId?: string;
  participantId?: string;
  dataCategory?: string;
  contentType: TierContentType;
  modality?: 'text' | 'audio' | 'mixed';
  acceptsAudio?: boolean;
  isDefault?: boolean;
  accessRights?: 'open' | 'restricted' | 'confidential';
  delimiter?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

/** A single annotation hypothesis with confidence score */
export interface AnnotationHypothesis {
  value: string;
  confidence: number;
  source: string;
}

export interface TierAnnotationDocType {
  id: string;
  tierId: string;
  parentAnnotationId?: string;
  startTime?: number;
  endTime?: number;
  startAnchorId?: string;
  endAnchorId?: string;
  ordinal?: number;
  value: string;
  lexemeId?: string;
  senseIndex?: number;
  speakerId?: string;
  /** Who created this annotation (user id or agent name) */
  createdBy?: string;
  /** How this annotation was produced: 'manual' | 'auto-transcription' | 'import' | etc. */
  method?: string;
  /** Alternative hypotheses for multi-hypothesis annotation (F1 多假设标注) */
  hypotheses?: AnnotationHypothesis[];
  ai_metadata?: AiMetadata;
  provenance?: ProvenanceEnvelope;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction = 'create' | 'update' | 'delete';
export type AuditSource = 'human' | 'ai' | 'system';

/**
 * 审计日志结构，支持 requestId 幂等指纹 | Audit log structure with requestId for idempotency
 */
export interface AuditLogDocType {
  id: string;
  collection: string;
  documentId: string;
  action: AuditAction;
  field?: string;
  oldValue?: string;
  newValue?: string;
  source: AuditSource;
  timestamp: string;
  /** 幂等性指纹，便于回放/对比 | Idempotency fingerprint for replay/diff */
  requestId?: string;
  /** 结构化回放元数据 | Structured replay metadata */
  metadataJson?: string;
}

export type NoteTargetType =
  | 'unit'
  | 'translation'
  | 'lexeme'
  | 'sense'
  | 'tier_annotation'
  | 'text'
  | 'token'
  | 'morpheme'
  | 'annotation';

export type NoteCategory = 'comment' | 'question' | 'todo' | 'linguistic' | 'fieldwork' | 'correction';

export interface UserNoteDocType {
  id: string;
  targetType: NoteTargetType;
  targetId: string;
  targetIndex?: number;
  parentTargetId?: string;
  content: MultiLangString;
  category?: NoteCategory;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

/**
 * 统一语段元信息读模型 | Unified segment metadata read model
 */
export interface SegmentMetaDocType {
  /** 主键按 layerId::segmentId 作用域化，避免跨层同源语段互相覆盖 | Primary key is scoped as layerId::segmentId to prevent cross-layer collisions */
  id: string;
  segmentId: string;
  /** 可选，默认按 segment 解释；兼容早期回填与手工构造测试数据 | Optional, defaults to segment for compatibility with backfills/tests */
  unitKind?: LayerUnitType;
  textId: string;
  mediaId: string;
  layerId: string;
  hostUnitId?: string;
  startTime: number;
  endTime: number;
  text: string;
  normalizedText: string;
  hasText: boolean;
  effectiveSpeakerId?: string;
  effectiveSpeakerName?: string;
  noteCategoryKeys?: NoteCategory[];
  effectiveSelfCertainty?: UnitSelfCertainty;
  annotationStatus?: LayerUnitStatus;
  aiConfidence?: number;
  sourceType?: 'human' | 'ai';
  createdAt: string;
  updatedAt: string;
}

export type SegmentQualityIssueKey = 'empty_text' | 'missing_speaker' | 'low_ai_confidence' | 'todo_note';
export type SegmentQualitySeverity = 'ok' | 'warning' | 'critical';

export interface SegmentQualitySnapshotDocType {
  id: string;
  segmentId: string;
  textId: string;
  mediaId: string;
  layerId: string;
  hostUnitId?: string;
  speakerId?: string;
  speakerName?: string;
  emptyText: boolean;
  missingSpeaker: boolean;
  lowAiConfidence: boolean;
  hasTodoNote: boolean;
  issueKeys: SegmentQualityIssueKey[];
  issueCount: number;
  severity: SegmentQualitySeverity;
  createdAt: string;
  updatedAt: string;
}

export type ScopeStatsSnapshotScopeType = 'project' | 'text' | 'media' | 'layer' | 'speaker';

export interface ScopeStatsSnapshotDocType {
  id: string;
  scopeType: ScopeStatsSnapshotScopeType;
  scopeKey: string;
  textId?: string;
  mediaId?: string;
  layerId?: string;
  speakerId?: string;
  unitCount: number;
  segmentCount: number;
  speakerCount: number;
  translationLayerCount: number;
  noteFlaggedCount: number;
  untranscribedCount: number;
  missingSpeakerCount: number;
  avgAiConfidence?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpeakerProfileSnapshotDocType {
  id: string;
  textId: string;
  speakerId: string;
  speakerName?: string;
  unitCount: number;
  segmentCount: number;
  totalDurationSec: number;
  noteFlaggedCount: number;
  emptyTextCount: number;
  createdAt: string;
  updatedAt: string;
}

export type TranslationSnapshotStatus = 'missing' | 'draft' | 'translated' | 'verified';

export interface TranslationStatusSnapshotDocType {
  id: string;
  unitId: string;
  textId: string;
  mediaId: string;
  layerId: string;
  parentUnitId?: string;
  status: TranslationSnapshotStatus;
  hasText: boolean;
  textLength: number;
  sourceType?: 'human' | 'ai';
  createdAt: string;
  updatedAt: string;
}

export interface LanguageAssetOverviewDocType {
  id: string;
  languageId: string;
  displayName: string;
  aliasCount: number;
  orthographyCount: number;
  bridgeCount: number;
  hasCustomFields: boolean;
  completenessScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiTaskSnapshotDocType {
  id: string;
  taskId: string;
  taskType: AiTaskType;
  status: AiTaskStatus;
  targetId: string;
  targetType?: string;
  modelId?: string;
  hasError: boolean;
  isTerminal: boolean;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrackEntityDocType {
  id: string;
  textId: string;
  mediaId: string;
  mode: 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed';
  laneLockMap: Record<string, number>;
  updatedAt: string;
}

export type Selector<T> = Partial<{ [K in keyof T]: T[K] }>;

export type JieyuDoc<T extends { id: string }> = T & {
  primary: string;
  toJSON: () => T;
};

// ── 集合适配器公共类型 | Collection adapter public types ──────────────────────

export type CollectionAdapter<T extends { id: string }> = {
  find: () => { exec: () => Promise<Array<JieyuDoc<T>>> };
  findOne: (args: { selector: Selector<T> }) => { exec: () => Promise<JieyuDoc<T> | null> };
  findByIndex: (indexName: string, value: string | number) => Promise<Array<JieyuDoc<T>>>;
  findByIndexAnyOf: (indexName: string, values: readonly (string | number)[]) => Promise<Array<JieyuDoc<T>>>;
  insert: (doc: T) => Promise<JieyuDoc<T>>;
  remove: (id: string) => Promise<void>;
  bulkInsert: (docs: T[]) => Promise<void>;
  removeBySelector: (selector: Selector<T>) => Promise<number>;
  update: (id: string, changes: Partial<T>) => Promise<void>;
};

export type JieyuCollections = {
  texts: CollectionAdapter<TextDocType>;
  media_items: CollectionAdapter<MediaItemDocType>;
  unit_tokens: CollectionAdapter<UnitTokenDocType>;
  unit_morphemes: CollectionAdapter<UnitMorphemeDocType>;
  anchors: CollectionAdapter<AnchorDocType>;
  lexemes: CollectionAdapter<LexemeDocType>;
  token_lexeme_links: CollectionAdapter<TokenLexemeLinkDocType>;
  ai_tasks: CollectionAdapter<AiTaskDoc>;
  embeddings: CollectionAdapter<EmbeddingDoc>;
  ai_conversations: CollectionAdapter<AiConversationDoc>;
  ai_messages: CollectionAdapter<AiMessageDoc>;
  languages: CollectionAdapter<LanguageDocType>;
  language_display_names: CollectionAdapter<LanguageDisplayNameDocType>;
  language_aliases: CollectionAdapter<LanguageAliasDocType>;
  language_catalog_history: CollectionAdapter<LanguageCatalogHistoryDocType>;
  custom_field_definitions: CollectionAdapter<CustomFieldDefinitionDocType>;
  speakers: CollectionAdapter<SpeakerDocType>;
  orthographies: CollectionAdapter<OrthographyDocType>;
  orthography_bridges: CollectionAdapter<OrthographyBridgeDocType>;
  locations: CollectionAdapter<LocationDocType>;
  bibliographic_sources: CollectionAdapter<BibliographicSourceDocType>;
  grammar_docs: CollectionAdapter<GrammarDocDocType>;
  abbreviations: CollectionAdapter<AbbreviationDocType>;
  phonemes: CollectionAdapter<PhonemeDocType>;
  tag_definitions: CollectionAdapter<TagDefinitionDocType>;
  layers: CollectionAdapter<LayerDocType>;
  layer_units: CollectionAdapter<LayerUnitDocType>;
  layer_unit_contents: CollectionAdapter<LayerUnitContentDocType>;
  unit_relations: CollectionAdapter<UnitRelationDocType>;
  layer_links: CollectionAdapter<LayerLinkDocType>;
  tier_definitions: CollectionAdapter<TierDefinitionDocType>;
  tier_annotations: CollectionAdapter<TierAnnotationDocType>;
  audit_logs: CollectionAdapter<AuditLogDocType>;
  user_notes: CollectionAdapter<UserNoteDocType>;
  segment_meta: CollectionAdapter<SegmentMetaDocType>;
  segment_quality_snapshots: CollectionAdapter<SegmentQualitySnapshotDocType>;
  scope_stats_snapshots: CollectionAdapter<ScopeStatsSnapshotDocType>;
  speaker_profile_snapshots: CollectionAdapter<SpeakerProfileSnapshotDocType>;
  translation_status_snapshots: CollectionAdapter<TranslationStatusSnapshotDocType>;
  language_asset_overviews: CollectionAdapter<LanguageAssetOverviewDocType>;
  ai_task_snapshots: CollectionAdapter<AiTaskSnapshotDocType>;
  track_entities: CollectionAdapter<TrackEntityDocType>;
};

export type ImportConflictStrategy = 'upsert' | 'skip-existing' | 'replace-all';

export type ImportCollectionResult = {
  received: number;
  written: number;
  skipped: number;
};

export type ImportResult = {
  importedAt: string;
  strategy: ImportConflictStrategy;
  collections: Partial<Record<keyof JieyuCollections, ImportCollectionResult>>;
  ignoredCollections: string[];
};

export type SegmentationV2BackfillRows = {
  segments: LayerUnitDocType[];
  contents: LayerUnitContentDocType[];
  links: UnitRelationDocType[];
};

export type V28BackfillPlan = {
  segment: LayerUnitDocType;
  content: LayerUnitContentDocType;
};
