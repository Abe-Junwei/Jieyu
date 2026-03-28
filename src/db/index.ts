import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

const JIEYU_DB_NAME = 'jieyudb';
const SNAPSHOT_SCHEMA_VERSION = 2;

/**
 * 层数量软上限（UI 警告，非硬限制）
 * Soft limits for layer counts (UI warning, not hard limits)
 */
const LAYER_SOFT_LIMITS = { transcription: 5, translation: 10 } as const;

interface MultiLangString {
  [languageTag: string]: string;
}

interface Transcription {
  [orthographyKey: string]: string;
}

interface AiMetadata {
  confidence: number;
  model?: string;
  generatedAt?: string;
  [key: string]: unknown;
}

type ReviewStatus = 'draft' | 'suggested' | 'confirmed' | 'rejected';
type ActorType = 'human' | 'ai' | 'system' | 'importer';
type CreationMethod =
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

interface ProvenanceEnvelope {
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

interface TextDocType {
  id: string;
  title: MultiLangString;
  metadata?: Record<string, unknown>;
  languageCode?: string;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

interface MediaItemDocType {
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
interface Morpheme {
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
 * A single word token within an utterance.
 * Contains optional morpheme decomposition for interlinear glossing.
 */
interface UtteranceWord {
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

interface UtteranceDocType {
  id: string;
  textId: string;
  mediaId?: string;
  /** @deprecated Legacy embedded cache, prefer segmentation-based text content. */
  transcription?: Transcription;
  speaker?: string;
  /** FK reference to speakers table (preferred over freetext `speaker` field) */
  speakerId?: string;
  language?: string;
  startTime: number;
  endTime: number;
  startAnchorId?: string;
  endAnchorId?: string;
  notes?: MultiLangString;
  tags?: Record<string, boolean>;
  ai_metadata?: AiMetadata;
  aiMode?: 'AUTO' | 'SUGGEST';
  /**
   * Annotation depth status for coverage tracking (F16 稀疏转写).
   * - 'raw'        : audio only, no transcription
   * - 'transcribed': has transcription text
   * - 'translated' : has at least one translation
   * - 'glossed'    : has interlinear word/morpheme glosses
   * - 'verified'   : human-reviewed and confirmed
   */
  annotationStatus?: 'raw' | 'transcribed' | 'translated' | 'glossed' | 'verified';
  /**
   * View-only cache derived from `utterance_tokens` / `utterance_morphemes`.
   * NOT written to DB by `saveUtterance()`. Populated by the hook's read path.
   */
  words?: UtteranceWord[];
  provenance?: ProvenanceEnvelope;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

/** Canonical token entity (v17+), independent of utterance.words cache. */
interface UtteranceTokenDocType {
  id: string;
  textId: string;
  utteranceId: string;
  form: Transcription;
  gloss?: MultiLangString;
  pos?: string;
  lexemeId?: string;
  tokenIndex: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

/** Canonical morpheme entity (v16), tied to utterance token entities. */
interface UtteranceMorphemeDocType {
  id: string;
  textId: string;
  utteranceId: string;
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

interface AnchorDocType {
  id: string;
  mediaId: string;
  time: number;
  createdAt: string;
}

interface Sense {
  gloss: MultiLangString;
  definition?: MultiLangString;
  category?: string;
  [key: string]: unknown;
}

interface Form {
  transcription: Transcription;
  [key: string]: unknown;
}

interface LexemeDocType {
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

type TokenLexemeLinkTargetType = 'token' | 'morpheme';
type TokenLexemeLinkRole = 'exact' | 'stem' | 'gloss_candidate' | 'manual';

interface TokenLexemeLinkDocType {
  id: string;
  targetType: TokenLexemeLinkTargetType;
  targetId: string; // utterance_tokens.id or utterance_morphemes.id
  lexemeId: string;
  role?: TokenLexemeLinkRole;
  confidence?: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

type AiTaskStatus = 'pending' | 'running' | 'done' | 'failed';
type AiTaskType = 'transcribe' | 'gloss' | 'translate' | 'embed' | 'detect_language';

interface AiTaskDoc {
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

type EmbeddingSourceType = 'utterance' | 'token' | 'morpheme' | 'lexeme' | 'note' | 'pdf' | 'schema';

interface EmbeddingDoc {
  id: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  model: string;
  modelVersion?: string;
  contentHash: string;
  vector: number[];
  createdAt: string;
}

type AiConversationMode = 'assistant' | 'analysis' | 'review';

interface AiConversationDoc {
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

type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';
type AiMessageStatus = 'streaming' | 'done' | 'error' | 'aborted';

interface AiMessageCitation {
  type: 'utterance' | 'note' | 'pdf' | 'schema';
  refId: string;
  label?: string;
  snippet?: string;
}

interface AiMessageDoc {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  contextSnapshot?: Record<string, unknown>;
  citations?: AiMessageCitation[];
  errorMessage?: string;
  reasoningContent?: string;
  createdAt: string;
  updatedAt: string;
}

interface LanguageDocType {
  id: string;
  name: MultiLangString;
  autonym?: string;
  glottocode?: string;
  family?: string;
  endangermentLevel?:
    | 'safe'
    | 'vulnerable'
    | 'definitely_endangered'
    | 'severely_endangered'
    | 'critically_endangered'
    | 'extinct';
  locationId?: string;
  notes?: MultiLangString;
  createdAt: string;
  updatedAt: string;
}

interface SpeakerDocType {
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

interface OrthographyDocType {
  id: string;
  name: MultiLangString;
  abbreviation?: string;
  languageId?: string;
  type?: 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other';
  /** BCP 47 script subtag (e.g. 'Latn', 'Thai', 'Deva') */
  scriptTag?: string;
  /** Transliteration / conversion rule definitions (F30 预留) */
  conversionRules?: Record<string, unknown>;
  notes?: MultiLangString;
  createdAt: string;
}

interface LocationDocType {
  id: string;
  name: MultiLangString;
  latitude?: number;
  longitude?: number;
  region?: string;
  country?: string;
  notes?: MultiLangString;
  createdAt: string;
}

interface BibliographicSourceDocType {
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

interface GrammarDocDocType {
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

interface AbbreviationDocType {
  id: string;
  abbreviation: string;
  name: MultiLangString;
  category?: 'person' | 'number' | 'tense' | 'aspect' | 'mood' | 'case' | 'voice' | 'other';
  isLeipzigStandard?: boolean;
  notes?: MultiLangString;
  createdAt: string;
}

interface PhonemeDocType {
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

interface TagDefinitionDocType {
  id: string;
  key: string;
  name: MultiLangString;
  description?: MultiLangString;
  color?: string;
  scope?: 'utterance' | 'lexeme' | 'annotation' | 'global';
  createdAt: string;
}

/**
 * 层间边界约束（对齐 ELAN LINGUISTIC_TYPE.CONSTRAINTS）| Layer boundary constraint (aligned with ELAN LINGUISTIC_TYPE.CONSTRAINTS)
 * - 'symbolic_association': 继承父层边界 1:1（默认，翻译层） | Inherit parent boundaries 1:1 (default, translation)
 * - 'independent_boundary': 完全独立边界，由当前 canonical segment graph（LayerUnit 真源）承载 | Fully independent boundaries are stored in the canonical segment graph backed by LayerUnit.
 * - 'time_subdivision': 在父段时间范围内自由细分（Phase 2）| Free subdivision within parent segment time range (Phase 2)
 */
type LayerConstraint = 'symbolic_association' | 'independent_boundary' | 'time_subdivision';

interface LayerDocType {
  id: string;
  textId: string;
  key: string;
  name: MultiLangString;
  layerType: 'transcription' | 'translation';
  languageId: string;
  modality: 'text' | 'audio' | 'mixed';
  acceptsAudio?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  /** 边界约束类型（默认 'symbolic_association'）| Boundary constraint type (default 'symbolic_association') */
  constraint?: LayerConstraint;
  /** 父层 ID（constraint 为 symbolic_association / time_subdivision 时必填）| Parent layer ID (required for symbolic_association / time_subdivision) */
  parentLayerId?: string;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

// Restoring UtteranceTextDocType temporarily as it's still heavily used in the migration logic and React Hooks (as a view model)
interface UtteranceTextDocType {
  id: string;
  utteranceId: string;
  layerId: string;
  modality: 'text' | 'audio' | 'mixed';
  text?: string;
  translationAudioMediaId?: string;
  recordedBySpeakerId?: string;
  sourceType: 'human' | 'ai';
  ai_metadata?: AiMetadata;
  provenance?: ProvenanceEnvelope;
  accessRights?: 'open' | 'restricted' | 'confidential';
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
}

type SegmentLinkType = 'equivalent' | 'projection' | 'bridge' | 'time_subdivision';

interface LayerSegmentDocType {
  id: string;
  textId: string;
  mediaId: string;
  layerId: string;
  /** 所属 utterance（v25 显式字段，替代 ID 后缀解析） | Owner utterance (v25 explicit field, replaces ID suffix parsing) */
  utteranceId?: string;
  /** 独立 segment 的显式说话人键 | Explicit speaker key for standalone segments */
  speakerId?: string;
  startTime: number;
  endTime: number;
  startAnchorId?: string;
  endAnchorId?: string;
  ordinal?: number;
  /** 外部引用（如 EAF 的 ALIGNABLE_ANNOTATION_ID） | External reference (e.g. EAF ALIGNABLE_ANNOTATION_ID) */
  externalRef?: string;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

interface LayerSegmentContentDocType {
  id: string;
  textId: string;
  segmentId: string;
  layerId: string;
  modality: 'text' | 'audio' | 'mixed';
  text?: string;
  translationAudioMediaId?: string;
  sourceType: 'human' | 'ai';
  ai_metadata?: AiMetadata;
  provenance?: ProvenanceEnvelope;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

type LayerUnitType = 'utterance' | 'segment';
type LayerUnitStatus = 'raw' | 'transcribed' | 'translated' | 'glossed' | 'verified';
type LayerContentRole = 'primary_text' | 'translation' | 'gloss' | 'note' | 'audio_ref';
type UnitRelationType = 'aligned_to' | 'derived_from' | 'linked_reference';

/**
 * 统一层时间单元（终态基座）| Unified layer timeline unit (final-model foundation)
 */
interface LayerUnitDocType {
  id: string;
  textId: string;
  mediaId: string;
  layerId: string;
  unitType: LayerUnitType;
  parentUnitId?: string;
  rootUnitId?: string;
  startTime: number;
  endTime: number;
  startAnchorId?: string;
  endAnchorId?: string;
  orderKey?: string;
  speakerId?: string;
  status?: LayerUnitStatus;
  externalRef?: string;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

/**
 * 统一层时间单元内容载荷 | Unified layer timeline unit content payload
 */
interface LayerUnitContentDocType {
  id: string;
  textId: string;
  unitId: string;
  layerId: string;
  contentRole: LayerContentRole;
  modality: 'text' | 'audio' | 'mixed';
  text?: string;
  mediaRefId?: string;
  sourceType: 'human' | 'ai';
  ai_metadata?: AiMetadata;
  provenance?: ProvenanceEnvelope;
  accessRights?: 'open' | 'restricted' | 'confidential';
  isVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 统一层单元关系表 | Unified layer unit relation table
 */
interface UnitRelationDocType {
  id: string;
  textId: string;
  sourceUnitId: string;
  targetUnitId: string;
  relationType: UnitRelationType;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

interface SegmentLinkDocType {
  id: string;
  textId: string;
  sourceSegmentId: string;
  targetSegmentId: string;
  sourceLayerId?: string;
  targetLayerId?: string;
  /** 历史 utterance 桥接键（迁移期） | Legacy utterance bridge key (migration period) */
  utteranceId?: string;
  linkType: SegmentLinkType;
  confidence?: number;
  provenance?: ProvenanceEnvelope;
  createdAt: string;
  updatedAt: string;
}

interface LayerLinkDocType {
  id: string;
  transcriptionLayerKey: string;
  layerId: string;
  linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
  isPreferred: boolean;
  createdAt: string;
}

type TierType = 'time-aligned' | 'time-subdivision' | 'symbolic-subdivision' | 'symbolic-association';
type TierContentType = 'transcription' | 'translation' | 'gloss' | 'pos' | 'note' | 'custom';

interface TierDefinitionDocType {
  id: string;
  textId: string;
  key: string;
  name: MultiLangString;
  tierType: TierType;
  parentTierId?: string;
  languageId?: string;
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
interface AnnotationHypothesis {
  value: string;
  confidence: number;
  source: string;
}

interface TierAnnotationDocType {
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

type AuditAction = 'create' | 'update' | 'delete';
type AuditSource = 'human' | 'ai' | 'system';

/**
 * 审计日志结构，支持 requestId 幂等指纹 | Audit log structure with requestId for idempotency
 */
interface AuditLogDocType {
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

type NoteTargetType =
  | 'utterance'
  | 'translation'
  | 'lexeme'
  | 'sense'
  | 'tier_annotation'
  | 'text'
  | 'token'
  | 'morpheme'
  | 'annotation';

type NoteCategory = 'comment' | 'question' | 'todo' | 'linguistic' | 'fieldwork' | 'correction';

interface UserNoteDocType {
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

interface TrackEntityDocType {
  id: string;
  textId: string;
  mediaId: string;
  mode: 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed';
  laneLockMap: Record<string, number>;
  updatedAt: string;
}

type Selector<T> = Partial<{ [K in keyof T]: T[K] }>;

type JieyuDoc<T extends { id: string }> = T & {
  primary: string;
  toJSON: () => T;
};

const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected ISO date-time string',
});
const accessRightsSchema = z.enum(['open', 'restricted', 'confidential']);
const multiLangStringSchema = z.record(z.string(), z.string());
const transcriptionSchema = z.record(z.string(), z.string());
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
const provenanceSchema = z.object({
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

const utteranceDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1),
    mediaId: z.string().optional(),
    transcription: transcriptionSchema.optional(),
    speaker: z.string().optional(),
    speakerId: z.string().min(1).optional(),
    language: z.string().optional(),
    startTime: z.number().finite(),
    endTime: z.number().finite(),
    startAnchorId: z.string().min(1).optional(),
    endAnchorId: z.string().min(1).optional(),
    notes: multiLangStringSchema.optional(),
    tags: z.record(z.string(), z.boolean()).optional(),
    ai_metadata: aiMetadataSchema.optional(),
    aiMode: z.enum(['AUTO', 'SUGGEST']).optional(),
    isVerified: z.boolean().optional(),
    annotationStatus: z.enum(['raw', 'transcribed', 'translated', 'glossed', 'verified']).optional(),
    provenance: provenanceSchema.optional(),
    accessRights: accessRightsSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .refine((doc) => doc.endTime >= doc.startTime, {
    message: 'endTime must be >= startTime',
    path: ['endTime'],
  });

const anchorDocSchema = z.object({
  id: z.string().min(1),
  mediaId: z.string().min(1),
  time: z.number().finite(),
  createdAt: isoDateSchema,
});

const utteranceTokenDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  utteranceId: z.string().min(1),
  form: transcriptionSchema,
  gloss: multiLangStringSchema.optional(),
  pos: z.string().optional(),
  lexemeId: z.string().min(1).optional(),
  tokenIndex: z.number().int().min(0),
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const utteranceMorphemeDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  utteranceId: z.string().min(1),
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

const embeddingSourceTypeSchema = z.enum(['utterance', 'token', 'morpheme', 'lexeme', 'note', 'pdf', 'schema']);

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
  type: z.enum(['utterance', 'note', 'pdf', 'schema']),
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
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
  citations: z.array(aiMessageCitationSchema).optional(),
  errorMessage: z.string().optional(),
  reasoningContent: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const languageDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  autonym: z.string().optional(),
  glottocode: z.string().optional(),
  family: z.string().optional(),
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
  locationId: z.string().optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
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

const orthographyDocSchema = z.object({
  id: z.string().min(1),
  name: multiLangStringSchema,
  abbreviation: z.string().optional(),
  languageId: z.string().optional(),
  type: z.enum(['phonemic', 'phonetic', 'practical', 'historical', 'other']).optional(),
  scriptTag: z.string().optional(),
  conversionRules: z.record(z.string(), z.unknown()).optional(),
  notes: multiLangStringSchema.optional(),
  createdAt: isoDateSchema,
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
  scope: z.enum(['utterance', 'lexeme', 'annotation', 'global']).optional(),
  createdAt: isoDateSchema,
});

const layerConstraintSchema = z.enum(['symbolic_association', 'independent_boundary', 'time_subdivision']);

const translationLayerDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  layerType: z.enum(['transcription', 'translation']),
  languageId: z.string().min(1),
  modality: z.enum(['text', 'audio', 'mixed']),
  acceptsAudio: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  constraint: layerConstraintSchema.optional(),
  parentLayerId: z.string().optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

// 移除未使用的 utteranceTextDocSchema

const layerUnitTypeSchema = z.enum(['utterance', 'segment']);
const layerUnitStatusSchema = z.enum(['raw', 'transcribed', 'translated', 'glossed', 'verified']);
const layerContentRoleSchema = z.enum(['primary_text', 'translation', 'gloss', 'note', 'audio_ref']);
const unitRelationTypeSchema = z.enum(['aligned_to', 'derived_from', 'linked_reference']);

const layerUnitDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1),
    mediaId: z.string().min(1),
    layerId: z.string().min(1),
    unitType: layerUnitTypeSchema,
    parentUnitId: z.string().min(1).optional(),
    rootUnitId: z.string().min(1).optional(),
    startTime: z.number().finite(),
    endTime: z.number().finite(),
    startAnchorId: z.string().min(1).optional(),
    endAnchorId: z.string().min(1).optional(),
    orderKey: z.string().min(1).optional(),
    speakerId: z.string().min(1).optional(),
    status: layerUnitStatusSchema.optional(),
    externalRef: z.string().min(1).optional(),
    provenance: provenanceSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .refine((doc) => doc.endTime >= doc.startTime, {
    message: 'endTime must be >= startTime',
    path: ['endTime'],
  });

const layerUnitContentDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  unitId: z.string().min(1),
  layerId: z.string().min(1),
  contentRole: layerContentRoleSchema,
  modality: z.enum(['text', 'audio', 'mixed']),
  text: z.string().optional(),
  mediaRefId: z.string().min(1).optional(),
  sourceType: z.enum(['human', 'ai']),
  ai_metadata: aiMetadataSchema.optional(),
  provenance: provenanceSchema.optional(),
  accessRights: accessRightsSchema.optional(),
  isVerified: z.boolean().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const unitRelationDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  sourceUnitId: z.string().min(1),
  targetUnitId: z.string().min(1),
  relationType: unitRelationTypeSchema,
  provenance: provenanceSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const tierTypeSchema = z.enum(['time-aligned', 'time-subdivision', 'symbolic-subdivision', 'symbolic-association']);
const tierContentTypeSchema = z.enum(['transcription', 'translation', 'gloss', 'pos', 'note', 'custom']);

const tierDefinitionDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  tierType: tierTypeSchema,
  parentTierId: z.string().min(1).optional(),
  languageId: z.string().optional(),
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
  layerId: z.string().min(1),
  linkType: z.enum(['direct', 'free', 'literal', 'pedagogical']),
  isPreferred: z.boolean(),
  createdAt: isoDateSchema,
});

const noteTargetTypeSchema = z.enum([
  'utterance', 'translation', 'lexeme',
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

function wrapDoc<T extends { id: string }>(value: T): JieyuDoc<T> {
  return {
    ...value,
    primary: value.id,
    toJSON: () => ({ ...value }),
  };
}

function validateTextDoc(doc: TextDocType): void {
  textDocSchema.parse(doc);
}

function validateUtteranceDoc(doc: UtteranceDocType): void {
  utteranceDocSchema.parse(doc);
}

function validateMediaItemDoc(doc: MediaItemDocType): void {
  mediaItemDocSchema.parse(doc);
}

function validateLexemeDoc(doc: LexemeDocType): void {
  lexemeDocSchema.parse(doc);
}

function validateAnchorDoc(doc: AnchorDocType): void {
  anchorDocSchema.parse(doc);
}

function validateUtteranceTokenDoc(doc: UtteranceTokenDocType): void {
  utteranceTokenDocSchema.parse(doc);
}

function validateUtteranceMorphemeDoc(doc: UtteranceMorphemeDocType): void {
  utteranceMorphemeDocSchema.parse(doc);
}

function validateTokenLexemeLinkDoc(doc: TokenLexemeLinkDocType): void {
  tokenLexemeLinkDocSchema.parse(doc);
}

function validateAiTaskDoc(doc: AiTaskDoc): void {
  aiTaskDocSchema.parse(doc);
}

function validateEmbeddingDoc(doc: EmbeddingDoc): void {
  embeddingDocSchema.parse(doc);
}

function validateAiConversationDoc(doc: AiConversationDoc): void {
  aiConversationDocSchema.parse(doc);
}

function validateAiMessageDoc(doc: AiMessageDoc): void {
  aiMessageDocSchema.parse(doc);
}

function validateLanguageDoc(doc: LanguageDocType): void {
  languageDocSchema.parse(doc);
}

function validateSpeakerDoc(doc: SpeakerDocType): void {
  speakerDocSchema.parse(doc);
}

function validateOrthographyDoc(doc: OrthographyDocType): void {
  orthographyDocSchema.parse(doc);
}

function validateLocationDoc(doc: LocationDocType): void {
  locationDocSchema.parse(doc);
}

function validateBibliographicSourceDoc(doc: BibliographicSourceDocType): void {
  bibliographicSourceDocSchema.parse(doc);
}

function validateGrammarDoc(doc: GrammarDocDocType): void {
  grammarDocDocSchema.parse(doc);
}

function validateAbbreviationDoc(doc: AbbreviationDocType): void {
  abbreviationDocSchema.parse(doc);
}

function validatePhonemeDoc(doc: PhonemeDocType): void {
  phonemeDocSchema.parse(doc);
}

function validateTagDefinitionDoc(doc: TagDefinitionDocType): void {
  tagDefinitionDocSchema.parse(doc);
}

function validateLayerDoc(doc: LayerDocType): void {
  translationLayerDocSchema.parse(doc);
}

function validateLayerUnitDoc(doc: LayerUnitDocType): void {
  layerUnitDocSchema.parse(doc);
}

function validateLayerUnitContentDoc(doc: LayerUnitContentDocType): void {
  layerUnitContentDocSchema.parse(doc);
}

function validateUnitRelationDoc(doc: UnitRelationDocType): void {
  unitRelationDocSchema.parse(doc);
}

function validateLayerLinkDoc(doc: LayerLinkDocType): void {
  layerLinkDocSchema.parse(doc);
}

function validateTierDefinitionDoc(doc: TierDefinitionDocType): void {
  tierDefinitionDocSchema.parse(doc);
}

function validateTierAnnotationDoc(doc: TierAnnotationDocType): void {
  tierAnnotationDocSchema.parse(doc);
}

function validateAuditLogDoc(doc: AuditLogDocType): void {
  auditLogDocSchema.parse(doc);
}

function validateUserNoteDoc(doc: UserNoteDocType): void {
  userNoteDocSchema.parse(doc);
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

function validateTrackEntityDoc(doc: TrackEntityDocType): void {
  trackEntityDocSchema.parse(doc);
}

class DexieCollectionAdapter<T extends { id: string }> {
  constructor(
    private readonly table: Table<T, string>,
    private readonly validate?: (doc: T) => void,
  ) {}

  find() {
    return {
      exec: async (): Promise<Array<JieyuDoc<T>>> => {
        const rows = await this.table.toArray();
        return rows.map((row) => wrapDoc(row));
      },
    };
  }

  findOne(args: { selector: Selector<T> }) {
    return {
      exec: async (): Promise<JieyuDoc<T> | null> => {
        const entries = Object.entries(args.selector) as Array<[keyof T, unknown]>;
        if (entries.length === 1) {
          const [key, expected] = entries[0]!;
          try {
            const indexed = await this.table.where(String(key)).equals(expected as string | number).first();
            return indexed ? wrapDoc(indexed) : null;
          } catch {
            // Fall through to generic filter path for non-indexed fields.
          }
        }
        const found = await this.table
          .filter((row) => entries.every(([key, expected]) => row[key] === expected))
          .first();
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(indexName: string, value: string | number): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table.where(indexName).equals(value).toArray();
    return rows.map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(indexName: string, values: readonly (string | number)[]): Promise<Array<JieyuDoc<T>>> {
    const rows = await this.table.where(indexName).anyOf([...values]).toArray();
    return rows.map((row) => wrapDoc(row));
  }

  async insert(doc: T): Promise<JieyuDoc<T>> {
    if (this.validate) {
      this.validate(doc);
    }
    await this.table.put(doc);
    return wrapDoc(doc);
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async bulkInsert(docs: T[]): Promise<void> {
    if (this.validate) {
      for (const doc of docs) this.validate(doc);
    }
    await this.table.bulkPut(docs);
  }

  async removeBySelector(selector: Selector<T>): Promise<number> {
    const entries = Object.entries(selector) as Array<[keyof T, unknown]>;
    let keys: string[] = [];

    // 优先使用任一可索引字段先收窄候选，再做内存二次过滤 | Narrow candidates via indexed field first, then in-memory refine.
    const firstIndexedEntry = entries.find(([rawKey, rawExpected]) => {
      const key = String(rawKey);
      const expected = rawExpected;
      const isPrimitive = typeof expected === 'string' || typeof expected === 'number' || typeof expected === 'boolean';
      const hasIndex = key === 'id' || key in this.table.schema.idxByName;
      return isPrimitive && hasIndex;
    });

    if (firstIndexedEntry) {
      const [rawKey, rawExpected] = firstIndexedEntry;
      const key = String(rawKey);
      const expected = rawExpected as string | number;
      try {
        const indexedKeys = (await this.table.where(key).equals(expected).primaryKeys()) as string[];
        if (entries.length === 1) {
          keys = indexedKeys;
        } else if (indexedKeys.length > 0) {
          const indexedRows = await this.table.bulkGet(indexedKeys);
          keys = indexedRows
            .filter((row): row is T => Boolean(row))
            .filter((row) => entries.every(([entryKey, entryExpected]) => row[entryKey] === entryExpected))
            .map((row) => row.id);
        }
      } catch {
        // 非索引或不支持 equals 的字段，回退 filter 扫描 | Fall back to filter scan for unsupported selectors.
      }
    }

    if (keys.length === 0) {
      keys = (await this.table
        .filter((row) => entries.every(([key, expected]) => row[key] === expected))
        .primaryKeys()) as string[];
    }

    if (keys.length === 0) {
      return 0;
    }

    await this.table.bulkDelete(keys);
    return keys.length;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await this.table.where(':id').equals(id).modify((row) => {
      Object.assign(row, changes);
    });
  }
}

type CollectionAdapter<T extends { id: string }> = {
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

const BRIDGE_TIER_PREFIX = 'bridge_';

function isBridgeLayerTier(tier: TierDefinitionDocType): boolean {
  return tier.key.startsWith(BRIDGE_TIER_PREFIX)
    && (tier.contentType === 'transcription' || tier.contentType === 'translation');
}

/** tier.tierType → LayerConstraint 映射 | Map TierType to LayerConstraint */
function tierTypeToConstraint(tierType: TierType): LayerConstraint | undefined {
  switch (tierType) {
    case 'symbolic-association': return 'symbolic_association';
    case 'time-subdivision': return 'time_subdivision';
    case 'time-aligned': return 'independent_boundary';
    default: return undefined;
  }
}

/** LayerConstraint → TierType 映射 | Map LayerConstraint to TierType */
function constraintToTierType(constraint: LayerConstraint | undefined): TierType {
  switch (constraint) {
    case 'independent_boundary': return 'time-aligned';
    case 'time_subdivision': return 'time-subdivision';
    case 'symbolic_association': return 'symbolic-association';
    default: return 'time-aligned';
  }
}

function bridgeTierToLayer(tier: TierDefinitionDocType): LayerDocType | null {
  if (!isBridgeLayerTier(tier)) return null;
  const constraint = tierTypeToConstraint(tier.tierType);
  return {
    id: tier.id,
    textId: tier.textId,
    key: tier.key.slice(BRIDGE_TIER_PREFIX.length),
    name: tier.name,
    layerType: tier.contentType as 'transcription' | 'translation',
    languageId: tier.languageId ?? '',
    modality: tier.modality ?? 'text',
    ...(tier.acceptsAudio !== undefined && { acceptsAudio: tier.acceptsAudio }),
    ...(tier.isDefault !== undefined && { isDefault: tier.isDefault }),
    ...(tier.sortOrder !== undefined && { sortOrder: tier.sortOrder }),
    ...(constraint !== undefined && { constraint }),
    ...(tier.parentTierId !== undefined && { parentLayerId: tier.parentTierId }),
    ...(tier.accessRights !== undefined && { accessRights: tier.accessRights }),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
}

function layerToBridgeTier(layer: LayerDocType): TierDefinitionDocType {
  return {
    id: layer.id,
    textId: layer.textId,
    key: `${BRIDGE_TIER_PREFIX}${layer.key}`,
    name: layer.name,
    tierType: constraintToTierType(layer.constraint),
    languageId: layer.languageId,
    contentType: layer.layerType,
    modality: layer.modality,
    ...(layer.acceptsAudio !== undefined && { acceptsAudio: layer.acceptsAudio }),
    ...(layer.isDefault !== undefined && { isDefault: layer.isDefault }),
    ...(layer.accessRights !== undefined && { accessRights: layer.accessRights }),
    ...(layer.sortOrder !== undefined && { sortOrder: layer.sortOrder }),
    ...(layer.parentLayerId !== undefined && { parentTierId: layer.parentLayerId }),
    createdAt: layer.createdAt,
    updatedAt: layer.updatedAt,
  };
}

class TierBackedLayerCollectionAdapter implements CollectionAdapter<LayerDocType> {
  constructor(
    private readonly tierTable: Table<TierDefinitionDocType, string>,
    private readonly validate?: (doc: LayerDocType) => void,
  ) {}

  private async loadLayers(): Promise<LayerDocType[]> {
    const tiers = await this.tierTable.toArray();
    return tiers
      .map((tier) => bridgeTierToLayer(tier))
      .filter((layer): layer is LayerDocType => Boolean(layer));
  }

  find() {
    return {
      exec: async (): Promise<Array<JieyuDoc<LayerDocType>>> => {
        const rows = await this.loadLayers();
        return rows.map((row) => wrapDoc(row));
      },
    };
  }

  findOne(args: { selector: Selector<LayerDocType> }) {
    return {
      exec: async (): Promise<JieyuDoc<LayerDocType> | null> => {
        const rows = await this.loadLayers();
        const entries = Object.entries(args.selector) as Array<[keyof LayerDocType, unknown]>;
        const found = rows.find((row) => entries.every(([key, expected]) => row[key] === expected));
        return found ? wrapDoc(found) : null;
      },
    };
  }

  async findByIndex(indexName: string, value: string | number): Promise<Array<JieyuDoc<LayerDocType>>> {
    if (indexName === 'textId') {
      const rows = await this.tierTable.where('textId').equals(String(value)).toArray();
      return rows
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));
    }

    if (indexName === 'key') {
      const rows = await this.tierTable.where('key').equals(`${BRIDGE_TIER_PREFIX}${String(value)}`).toArray();
      return rows
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));
    }

    if (indexName === 'parentLayerId') {
      const rows = await this.tierTable.where('parentTierId').equals(String(value)).toArray();
      return rows
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));
    }

    if (indexName === 'layerType') {
      const rows = await this.tierTable.where('contentType').equals(String(value)).toArray();
      return rows
        .map((row) => bridgeTierToLayer(row))
        .filter((row): row is LayerDocType => Boolean(row))
        .map((row) => wrapDoc(row));
    }

    const rows = await this.loadLayers();
    return rows
      .filter((row) => (row as unknown as Record<string, unknown>)[indexName] === value)
      .map((row) => wrapDoc(row));
  }

  async findByIndexAnyOf(indexName: string, values: readonly (string | number)[]): Promise<Array<JieyuDoc<LayerDocType>>> {
    const collected: LayerDocType[] = [];
    for (const value of values) {
      const docs = await this.findByIndex(indexName, value);
      collected.push(...docs.map((doc) => doc.toJSON()));
    }
    const dedup = new Map(collected.map((item) => [item.id, item]));
    return [...dedup.values()].map((row) => wrapDoc(row));
  }

  async insert(doc: LayerDocType): Promise<JieyuDoc<LayerDocType>> {
    if (this.validate) this.validate(doc);
    await this.tierTable.put(layerToBridgeTier(doc));
    return wrapDoc(doc);
  }

  async remove(id: string): Promise<void> {
    await this.tierTable.delete(id);
  }

  async bulkInsert(docs: LayerDocType[]): Promise<void> {
    if (this.validate) {
      for (const doc of docs) this.validate(doc);
    }
    await this.tierTable.bulkPut(docs.map((doc) => layerToBridgeTier(doc)));
  }

  async removeBySelector(selector: Selector<LayerDocType>): Promise<number> {
    const rows = await this.loadLayers();
    const entries = Object.entries(selector) as Array<[keyof LayerDocType, unknown]>;
    const ids = rows
      .filter((row) => entries.every(([key, expected]) => row[key] === expected))
      .map((row) => row.id);
    if (ids.length === 0) return 0;
    await this.tierTable.bulkDelete(ids);
    return ids.length;
  }

  async update(id: string, changes: Partial<LayerDocType>): Promise<void> {
    const existingTier = await this.tierTable.get(id);
    if (!existingTier) return;
    // Apply only the fields that exist in TierDefinitionDocType
    const updatedTier: TierDefinitionDocType = {
      ...existingTier,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.languageId !== undefined ? { languageId: changes.languageId } : {}),
      ...(changes.modality !== undefined ? { modality: changes.modality } : {}),
      ...(changes.acceptsAudio !== undefined ? { acceptsAudio: changes.acceptsAudio } : {}),
      ...(changes.isDefault !== undefined ? { isDefault: changes.isDefault } : {}),
      ...(changes.sortOrder !== undefined ? { sortOrder: changes.sortOrder } : {}),
      ...(changes.accessRights !== undefined ? { accessRights: changes.accessRights } : {}),
      ...(changes.constraint !== undefined ? { tierType: constraintToTierType(changes.constraint) } : {}),
      ...(changes.parentLayerId !== undefined ? { parentTierId: changes.parentLayerId } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.tierTable.put(updatedTier);
  }
}

type JieyuCollections = {
  texts: CollectionAdapter<TextDocType>;
  media_items: CollectionAdapter<MediaItemDocType>;
  utterances: CollectionAdapter<UtteranceDocType>;
  utterance_tokens: CollectionAdapter<UtteranceTokenDocType>;
  utterance_morphemes: CollectionAdapter<UtteranceMorphemeDocType>;
  anchors: CollectionAdapter<AnchorDocType>;
  lexemes: CollectionAdapter<LexemeDocType>;
  token_lexeme_links: CollectionAdapter<TokenLexemeLinkDocType>;
  ai_tasks: CollectionAdapter<AiTaskDoc>;
  embeddings: CollectionAdapter<EmbeddingDoc>;
  ai_conversations: CollectionAdapter<AiConversationDoc>;
  ai_messages: CollectionAdapter<AiMessageDoc>;
  languages: CollectionAdapter<LanguageDocType>;
  speakers: CollectionAdapter<SpeakerDocType>;
  orthographies: CollectionAdapter<OrthographyDocType>;
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
  track_entities: CollectionAdapter<TrackEntityDocType>;
};

type JieyuDatabase = {
  name: string;
  dexie: JieyuDexie;
  collections: JieyuCollections;
  close: () => Promise<void>;
};

type ImportConflictStrategy = 'upsert' | 'skip-existing' | 'replace-all';

type ImportCollectionResult = {
  received: number;
  written: number;
  skipped: number;
};

type ImportResult = {
  importedAt: string;
  strategy: ImportConflictStrategy;
  collections: Partial<Record<keyof JieyuCollections, ImportCollectionResult>>;
  ignoredCollections: string[];
};

type SegmentationV2BackfillRows = {
  segments: LayerSegmentDocType[];
  contents: LayerSegmentContentDocType[];
  links: SegmentLinkDocType[];
};

type V28BackfillPlan = {
  segment: LayerSegmentDocType;
  content: LayerSegmentContentDocType;
};

function buildSegmentationV2BackfillRows(input: {
  utterances: UtteranceDocType[];
  utteranceTexts: UtteranceTextDocType[];
  tiers: TierDefinitionDocType[];
  nowIso?: string;
}): SegmentationV2BackfillRows {
  const { utterances, utteranceTexts, tiers, nowIso } = input;
  if (utterances.length === 0) {
    return { segments: [], contents: [], links: [] };
  }

  const now = nowIso ?? new Date().toISOString();
  const transcriptionTierByTextId = new Map<string, string>();
  const tiersByTextId = new Map<string, TierDefinitionDocType[]>();

  for (const tier of tiers) {
    const bucket = tiersByTextId.get(tier.textId);
    if (bucket) {
      bucket.push(tier);
    } else {
      tiersByTextId.set(tier.textId, [tier]);
    }
  }

  for (const [textId, bucket] of tiersByTextId.entries()) {
    const candidates = bucket
      .filter((item) => item.contentType === 'transcription')
      .sort((a, b) => {
        const defaultCmp = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
        if (defaultCmp !== 0) return defaultCmp;
        const sortA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const sortB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) return sortA - sortB;
        return a.id.localeCompare(b.id);
      });
    const picked = candidates[0];
    if (picked) transcriptionTierByTextId.set(textId, picked.id);
  }

  const buildSegmentId = (layerId: string, utteranceId: string) => `segv22_${layerId}_${utteranceId}`;
  const buildContentId = (utteranceTextId: string) => utteranceTextId;
  const buildLinkId = (layerId: string, utteranceId: string) => `seglv22_${layerId}_${utteranceId}`;

  const segmentById = new Map<string, LayerSegmentDocType>();
  const contentById = new Map<string, LayerSegmentContentDocType>();
  const linkById = new Map<string, SegmentLinkDocType>();
  const utteranceById = new Map(utterances.map((item) => [item.id, item]));

  const ensureSegment = (
    utterance: UtteranceDocType,
    layerId: string,
  ): LayerSegmentDocType => {
    const segmentId = buildSegmentId(layerId, utterance.id);
    const existing = segmentById.get(segmentId);
    if (existing) return existing;

    const next: LayerSegmentDocType = {
      id: segmentId,
      textId: utterance.textId,
      mediaId: utterance.mediaId && utterance.mediaId.trim().length > 0 ? utterance.mediaId : '__unknown_media__',
      layerId,
      utteranceId: utterance.id,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
      ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
      provenance: {
        actorType: 'system',
        method: 'migration',
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    segmentById.set(segmentId, next);
    return next;
  };

  for (const utterance of utterances) {
    const baseLayerId = transcriptionTierByTextId.get(utterance.textId);
    if (!baseLayerId) continue;
    ensureSegment(utterance, baseLayerId);
  }

  // v22 迁移数据可能仍含 tierId 而非 layerId | v22 migration data may still have tierId instead of layerId
  const getRowLayerId = (row: UtteranceTextDocType): string =>
    ((row as unknown as Record<string, unknown>).tierId as string | undefined) ?? row.layerId;

  for (const row of utteranceTexts) {
    const utterance = utteranceById.get(row.utteranceId);
    if (!utterance) continue;

    const rowLayerId = getRowLayerId(row);
    const targetSegment = ensureSegment(utterance, rowLayerId);
    const contentId = buildContentId(row.id);

    contentById.set(contentId, {
      id: contentId,
      textId: utterance.textId,
      segmentId: targetSegment.id,
      layerId: rowLayerId,
      modality: row.modality,
      ...(row.text !== undefined ? { text: row.text } : {}),
      ...(row.translationAudioMediaId ? { translationAudioMediaId: row.translationAudioMediaId } : {}),
      sourceType: row.sourceType,
      ...(row.ai_metadata ? { ai_metadata: row.ai_metadata } : {}),
      ...(row.provenance ? { provenance: row.provenance } : {}),
      ...(row.accessRights ? { accessRights: row.accessRights } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const baseLayerId = transcriptionTierByTextId.get(utterance.textId);
    if (!baseLayerId || baseLayerId === rowLayerId) continue;

    const sourceSegmentId = buildSegmentId(baseLayerId, utterance.id);
    const linkId = buildLinkId(rowLayerId, utterance.id);
    linkById.set(linkId, {
      id: linkId,
      textId: utterance.textId,
      sourceSegmentId,
      targetSegmentId: targetSegment.id,
      sourceLayerId: baseLayerId,
      targetLayerId: rowLayerId,
      utteranceId: utterance.id,
      linkType: 'bridge',
      provenance: {
        actorType: 'system',
        method: 'migration',
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    segments: [...segmentById.values()],
    contents: [...contentById.values()],
    links: [...linkById.values()],
  };
}

function buildV28BackfillPlanForText(input: {
  text: UtteranceTextDocType;
  utterance: UtteranceDocType;
  nowIso: string;
  existingContent?: LayerSegmentContentDocType;
  segmentExists: (segmentId: string) => boolean;
}): V28BackfillPlan | null {
  const { text, utterance, nowIso, existingContent, segmentExists } = input;
  const canonicalSegmentId = `segv2_${text.layerId}_${utterance.id}`;

  if (existingContent && segmentExists(existingContent.segmentId)) {
    return null;
  }

  const segment: LayerSegmentDocType = {
    id: canonicalSegmentId,
    textId: utterance.textId,
    mediaId: utterance.mediaId && utterance.mediaId.trim().length > 0 ? utterance.mediaId : '__unknown_media__',
    layerId: text.layerId,
    utteranceId: utterance.id,
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
    ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
    provenance: { actorType: 'system', method: 'projection', createdAt: nowIso, updatedAt: nowIso },
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (existingContent) {
    return {
      segment,
      content: {
        ...existingContent,
        segmentId: canonicalSegmentId,
        updatedAt: nowIso,
      },
    };
  }

  const content: LayerSegmentContentDocType = {
    id: text.id,
    textId: utterance.textId,
    segmentId: canonicalSegmentId,
    layerId: text.layerId,
    modality: text.modality,
    ...(text.text !== undefined ? { text: text.text } : {}),
    ...(text.translationAudioMediaId ? { translationAudioMediaId: text.translationAudioMediaId } : {}),
    sourceType: text.sourceType,
    ...(text.ai_metadata ? { ai_metadata: text.ai_metadata } : {}),
    ...(text.provenance ? { provenance: text.provenance } : {}),
    ...(text.accessRights ? { accessRights: text.accessRights } : {}),
    createdAt: text.createdAt,
    updatedAt: text.updatedAt,
  };

  return { segment, content };
}

class JieyuDexie extends Dexie {
  texts!: Table<TextDocType, string>;
  media_items!: Table<MediaItemDocType, string>;
  utterances!: Table<UtteranceDocType, string>;
  utterance_tokens!: Table<UtteranceTokenDocType, string>;
  utterance_morphemes!: Table<UtteranceMorphemeDocType, string>;
  anchors!: Table<AnchorDocType, string>;
  lexemes!: Table<LexemeDocType, string>;
  token_lexeme_links!: Table<TokenLexemeLinkDocType, string>;
  ai_tasks!: Table<AiTaskDoc, string>;
  embeddings!: Table<EmbeddingDoc, string>;
  ai_conversations!: Table<AiConversationDoc, string>;
  ai_messages!: Table<AiMessageDoc, string>;
  languages!: Table<LanguageDocType, string>;
  speakers!: Table<SpeakerDocType, string>;
  orthographies!: Table<OrthographyDocType, string>;
  locations!: Table<LocationDocType, string>;
  bibliographic_sources!: Table<BibliographicSourceDocType, string>;
  grammar_docs!: Table<GrammarDocDocType, string>;
  abbreviations!: Table<AbbreviationDocType, string>;
  phonemes!: Table<PhonemeDocType, string>;
  tag_definitions!: Table<TagDefinitionDocType, string>;
  layer_units!: Table<LayerUnitDocType, string>;
  layer_unit_contents!: Table<LayerUnitContentDocType, string>;
  unit_relations!: Table<UnitRelationDocType, string>;
  layer_links!: Table<LayerLinkDocType, string>;
  tier_definitions!: Table<TierDefinitionDocType, string>;
  tier_annotations!: Table<TierAnnotationDocType, string>;
  audit_logs!: Table<AuditLogDocType, string>;
  user_notes!: Table<UserNoteDocType, string>;
  track_entities!: Table<TrackEntityDocType, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      utterance_translations: 'id, utteranceId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(2).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, mediaId, [mediaId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      utterance_translations: 'id, utteranceId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(3).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      utterance_translations: 'id, utteranceId, translationLayerId, [utteranceId+translationLayerId], updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(4).stores({
      tier_annotations: 'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime',
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp',
    });

    this.version(5).stores({
      user_notes: 'id, [targetType+targetId], [targetId+targetIndex], updatedAt',
    });

    this.version(6).stores({
      anchors: 'id, mediaId, [mediaId+time], time',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utterancesTable = typedTx.table('utterances');
      const anchorsTable = typedTx.table('anchors');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();

      if (allUtterances.length === 0) return;

      const now = new Date().toISOString();
      let anchorCounter = 0;

      const anchorsToInsert: AnchorDocType[] = [];
      const utterancesToUpdate: UtteranceDocType[] = [];

      for (const u of allUtterances) {
        const mediaId = u.mediaId ?? '';
        const startAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        const endAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        anchorsToInsert.push(
          { id: startAnchorId, mediaId, time: u.startTime, createdAt: now },
          { id: endAnchorId, mediaId, time: u.endTime, createdAt: now },
        );
        utterancesToUpdate.push({
          ...u,
          startAnchorId,
          endAnchorId,
        });
      }

      await anchorsTable.bulkPut(anchorsToInsert);
      await utterancesTable.bulkPut(utterancesToUpdate);
    });

    this.version(7).stores({
      corpus_lexicon_links: 'id, utteranceId, lexemeId, annotationId',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const linksTable = typedTx.table('corpus_lexicon_links');
      const allLinks = (await linksTable.toArray()) as Array<{ id: string; utteranceId: string; lexemeId: string; annotationId: string; wordIndex?: number }>;
      if (allLinks.length === 0) return;
      const updated = allLinks.map((link) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { wordIndex: _wordIndex, ...rest } = link;
        void _wordIndex;
        return rest;
      });
      await linksTable.bulkPut(updated);
    });

    this.version(8).stores({
      tier_annotations: 'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime, startAnchorId, endAnchorId',
    });

    this.version(9).stores({
      annotations: null,
    });

    // v10: Rename utterance_translations → utterance_texts + strip deprecated transcription cache
    this.version(10).stores({
      utterance_translations: null,
      utterance_texts: 'id, utteranceId, translationLayerId, [utteranceId+translationLayerId], updatedAt',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      // 1. Copy all rows from old table to new table
      const oldTable = typedTx.table('utterance_translations');
      const newTable = typedTx.table('utterance_texts');
      const allRows = await oldTable.toArray();
      if (allRows.length > 0) {
        await newTable.bulkPut(allRows);
      }

      // 2. Migrate utterance.transcription.default → utterance_texts if not yet present
      const utterancesTable = typedTx.table('utterances');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();

      for (const utt of allUtterances) {
        const defaultText = utt.transcription?.['default'];
        if (!defaultText) continue;

        // Check if there's already an utterance_text for the default transcription layer
        const existing = await newTable.where('[utteranceId+translationLayerId]').equals([utt.id, 'default']).first();
        if (!existing) {
          const now = new Date().toISOString();
          await newTable.put({
            id: `ut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            utteranceId: utt.id,
            translationLayerId: 'default',
            modality: 'text',
            text: defaultText,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // 3. Strip transcription field from utterances
      const cleaned = allUtterances.map(({ transcription, ...rest }) => rest);
      if (cleaned.length > 0) {
        await utterancesTable.bulkPut(cleaned);
      }
    });

    // v11: Add textId to translation_layers (scope layers per text)
    this.version(11).stores({
      translation_layers: 'id, textId, key, languageId, updatedAt, layerType',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const layersTable = typedTx.table('translation_layers');
      const allLayers = (await layersTable.toArray()) as LayerDocType[];
      if (allLayers.length === 0) return;

      // Find textId from utterances or texts
      const utterancesTable = typedTx.table('utterances');
      const firstUtt = await utterancesTable.toCollection().first();
      let textId = firstUtt?.textId;

      if (!textId) {
        const textsTable = typedTx.table('texts');
        const firstText = await textsTable.toCollection().first();
        textId = firstText?.id;
      }

      if (!textId) return; // No text in DB — layers will need manual fix

      const updated = allLayers.map((layer) => ({ ...layer, textId }));
      await layersTable.bulkPut(updated);
    });

    // v12: Fully merge layer system into tier_definitions and remove translation_layers table
    this.version(12).stores({
      translation_layers: null,
      tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const layersTable = typedTx.table('translation_layers');
      const tiersTable = typedTx.table('tier_definitions');
      const annotationsTable = typedTx.table('tier_annotations');

      const layers: LayerDocType[] = await layersTable.toArray();
      if (layers.length === 0) return;

      for (const layer of layers) {
        const bridgeKey = `${BRIDGE_TIER_PREFIX}${layer.key}`;
        const existingTier = await tiersTable
          .filter((t: TierDefinitionDocType) => t.textId === layer.textId && t.key === bridgeKey)
          .first();

        const mergedTier: TierDefinitionDocType = {
          ...(existingTier ?? {
            tierType: 'time-aligned',
            contentType: layer.layerType,
            createdAt: layer.createdAt,
          }),
          id: layer.id,
          textId: layer.textId,
          key: bridgeKey,
          name: layer.name,
          languageId: layer.languageId,
          contentType: layer.layerType,
          modality: layer.modality,
          acceptsAudio: layer.acceptsAudio,
          isDefault: layer.isDefault,
          accessRights: layer.accessRights,
          sortOrder: layer.sortOrder,
          createdAt: existingTier?.createdAt ?? layer.createdAt,
          updatedAt: layer.updatedAt,
        };

        await tiersTable.put(mergedTier);

        if (existingTier && existingTier.id !== layer.id) {
          const oldTierId = existingTier.id;

          const tierAnnotations = await annotationsTable.where('tierId').equals(oldTierId).toArray();
          if (tierAnnotations.length > 0) {
            await annotationsTable.bulkPut(
              tierAnnotations.map((ann: TierAnnotationDocType) => ({ ...ann, tierId: layer.id })),
            );
          }

          const childTiers = await tiersTable.where('parentTierId').equals(oldTierId).toArray();
          if (childTiers.length > 0) {
            await tiersTable.bulkPut(
              childTiers.map((tier: TierDefinitionDocType) => ({ ...tier, parentTierId: layer.id })),
            );
          }

          await tiersTable.delete(oldTierId);
        }
      }
    });

    // v13: CAM-Lite morpheme-level data model.
    // Adds optional fields to utterances (no index change except speakerId):
    //   - speakerId: FK reference to speakers table (replaces freetext `speaker`)
    //   - annotationStatus: coverage depth enum
    //   - words: UtteranceWord[] with optional Morpheme[] nested structure
    this.version(13).stores({
      utterances: 'id, textId, startTime, updatedAt, speakerId',
    });
    // No upgrade hook needed — new fields are optional and default to undefined.
    // Existing utterances remain valid; speakerId index is populated on next save.

    // v14: Schema expansion — F1 schema补全 + 多假设标注 + F29 user_notes扩展
    // - OrthographyDocType: +scriptTag, +conversionRules (F30 预留)
    // - TierAnnotationDocType: +createdBy, +method (provenance), +hypotheses[] (多假设标注)
    // - NoteTargetType: +'word'|'morpheme'|'annotation'
    // - NoteCategory: +'linguistic'|'fieldwork'|'correction'
    // All new fields are optional — no index changes, no upgrade hook needed.
    this.version(14).stores({});

    // v15: Phase A/B foundation — provenance envelope + stable word/morpheme ids.
    this.version(15).stores({}).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utterancesTable = typedTx.table('utterances');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (allUtterances.length === 0) return;

      let changed = false;
      let wordCounter = 0;
      let morphCounter = 0;
      const nowPart = Date.now();

      const updatedUtterances = allUtterances.map((utterance) => {
        if (!Array.isArray(utterance.words) || utterance.words.length === 0) return utterance;

        let utteranceChanged = false;
        const nextWords = utterance.words.map((word) => {
          const nextWordId = typeof word.id === 'string' && word.id.length > 0
            ? word.id
            : `tok_${nowPart}_${++wordCounter}`;
          if (nextWordId !== word.id) utteranceChanged = true;

          const nextMorphemes = Array.isArray(word.morphemes)
            ? word.morphemes.map((morpheme) => {
              const nextMorphId = typeof morpheme.id === 'string' && morpheme.id.length > 0
                ? morpheme.id
                : `morph_${nowPart}_${++morphCounter}`;
              if (nextMorphId !== morpheme.id) utteranceChanged = true;
              return {
                ...morpheme,
                id: nextMorphId,
              };
            })
            : word.morphemes;

          return {
            ...word,
            id: nextWordId,
            ...(Array.isArray(nextMorphemes) ? { morphemes: nextMorphemes } : {}),
          };
        });

        if (!utteranceChanged) return utterance;
        changed = true;
        return {
          ...utterance,
          words: nextWords,
        };
      });

      if (changed) {
        await utterancesTable.bulkPut(updatedUtterances);
      }
    });

    // v16: canonical token/morpheme entities for stable word-level operations.
    this.version(16).stores({
      utterance_tokens: 'id, textId, utteranceId, [utteranceId+tokenIndex], lexemeId',
      utterance_morphemes: 'id, textId, utteranceId, tokenId, [tokenId+morphemeIndex], lexemeId',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utterancesTable = typedTx.table('utterances');
      const tokensTable = typedTx.table('utterance_tokens');
      const morphemesTable = typedTx.table('utterance_morphemes');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (allUtterances.length === 0) return;

      const nextTokens: UtteranceTokenDocType[] = [];
      const nextMorphemes: UtteranceMorphemeDocType[] = [];
      let tokenCounter = 0;
      let morphemeCounter = 0;
      const nowSeed = Date.now();

      for (const utterance of allUtterances) {
        if (!Array.isArray(utterance.words) || utterance.words.length === 0) continue;
        const createdAt = utterance.createdAt;
        const updatedAt = utterance.updatedAt;

        for (let wi = 0; wi < utterance.words.length; wi++) {
          const word = utterance.words[wi]!;
          const tokenId = `tokv16_${nowSeed}_${++tokenCounter}`;

          nextTokens.push({
            id: tokenId,
            textId: utterance.textId,
            utteranceId: utterance.id,
            form: word.form,
            ...(word.gloss ? { gloss: word.gloss } : {}),
            ...(word.pos ? { pos: word.pos } : {}),
            ...(word.lexemeId ? { lexemeId: word.lexemeId } : {}),
            tokenIndex: wi,
            ...(word.provenance ? { provenance: word.provenance } : {}),
            createdAt,
            updatedAt,
          });

          if (!Array.isArray(word.morphemes) || word.morphemes.length === 0) continue;
          for (let mi = 0; mi < word.morphemes.length; mi++) {
            const morpheme = word.morphemes[mi]!;
            const morphemeId = `morphv16_${nowSeed}_${++morphemeCounter}`;
            nextMorphemes.push({
              id: morphemeId,
              textId: utterance.textId,
              utteranceId: utterance.id,
              tokenId,
              form: morpheme.form,
              ...(morpheme.gloss ? { gloss: morpheme.gloss } : {}),
              ...(morpheme.pos ? { pos: morpheme.pos } : {}),
              ...(morpheme.lexemeId ? { lexemeId: morpheme.lexemeId } : {}),
              morphemeIndex: mi,
              ...(morpheme.provenance ? { provenance: morpheme.provenance } : {}),
              createdAt,
              updatedAt,
            });
          }
        }
      }

      if (nextTokens.length > 0) await tokensTable.bulkPut(nextTokens);
      if (nextMorphemes.length > 0) await morphemesTable.bulkPut(nextMorphemes);
    });

    // v17: CAM-v2 naming + token-level links + ai/embedding foundational tables.
    this.version(17).stores({
      utterance_tokens: 'id, textId, utteranceId, [utteranceId+tokenIndex], lexemeId',
      utterance_morphemes: 'id, textId, utteranceId, tokenId, [tokenId+morphemeIndex], lexemeId',
      utterance_texts: 'id, utteranceId, tierId, [utteranceId+tierId], updatedAt',
      corpus_lexicon_links: null,
      token_lexeme_links: 'id, [targetType+targetId], lexemeId, [lexemeId+targetType]',
      layer_links: 'id, transcriptionLayerKey, tierId',
      ai_tasks: 'id, taskType, status, targetId, createdAt, updatedAt',
      embeddings: 'id, sourceType, sourceId, model, contentHash, createdAt',
    });

    // v18: AI conversation persistence for chat panel.
    this.version(18).stores({
      ai_conversations: 'id, textId, updatedAt, archived',
      ai_messages: 'id, conversationId, [conversationId+createdAt], status, updatedAt',
    });

    // v19: index optimization for recent AI tool decision logs.
    this.version(19).stores({
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp]',
    });

    // v20: requestId index for replay/dedup queries.
    this.version(20).stores({
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp], requestId, [collection+field+requestId]',
    });

    // v21: compound index for efficient embedding queries by (sourceType, model).
    // B-08 fix: enables Dexie to use index seek instead of scan + JS filter for model field.
    this.version(21).stores({
      embeddings: 'id, sourceType, sourceId, [sourceType+model], model, contentHash, createdAt',
    });

    // v22: segmentation-v2 foundation tables (independent per-layer boundaries).
    this.version(22).stores({
      layer_segments: 'id, textId, mediaId, layerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId]',
      layer_segment_contents: 'id, textId, segmentId, layerId, [segmentId+layerId], [layerId+updatedAt], sourceType, updatedAt',
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, [sourceSegmentId+targetSegmentId], linkType, utteranceId',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utterancesTable = typedTx.table('utterances');
      const utteranceTextsTable = typedTx.table('utterance_texts');
      const tierDefinitionsTable = typedTx.table('tier_definitions');
      const layerSegmentsTable = typedTx.table('layer_segments');
      const layerSegmentContentsTable = typedTx.table('layer_segment_contents');
      const segmentLinksTable = typedTx.table('segment_links');

      const utterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (utterances.length === 0) return;

      const utteranceTexts: UtteranceTextDocType[] = await utteranceTextsTable.toArray();
      const tiers: TierDefinitionDocType[] = await tierDefinitionsTable.toArray();

      const rows = buildSegmentationV2BackfillRows({
        utterances,
        utteranceTexts,
        tiers,
      });

      if (rows.segments.length > 0) {
        await layerSegmentsTable.bulkPut(rows.segments);
      }
      if (rows.contents.length > 0) {
        await layerSegmentContentsTable.bulkPut(rows.contents);
      }
      if (rows.links.length > 0) {
        await segmentLinksTable.bulkPut(rows.links);
      }
    });

    // v23: add layer-level indexes for segment link cleanup and audits.
    this.version(23).stores({
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, sourceLayerId, targetLayerId, [sourceSegmentId+targetSegmentId], linkType, utteranceId',
    });

    // v24: rename utterance_texts.tierId → layerId, layer_links.tierId → layerId
    // 统一字段命名为 layerId，消除历史 tier/layer 混用 | Unify field naming to layerId, eliminating legacy tier/layer ambiguity
    this.version(24).stores({
      utterance_texts: 'id, utteranceId, layerId, [utteranceId+layerId], updatedAt',
      layer_links: 'id, transcriptionLayerKey, layerId',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;

      const utteranceTextsTable = typedTx.table('utterance_texts');
      await utteranceTextsTable.toCollection().modify((row: Record<string, unknown>) => {
        if ('tierId' in row) {
          row.layerId = row.tierId;
          delete row.tierId;
        }
      });

      const layerLinksTable = typedTx.table('layer_links');
      await layerLinksTable.toCollection().modify((row: Record<string, unknown>) => {
        if ('tierId' in row) {
          row.layerId = row.tierId;
          delete row.tierId;
        }
      });
    });

    // v25: 为 layer_segments 添加 utteranceId 索引，消除 removeUtteranceCascade 全表扫描
    // Add utteranceId index to layer_segments, eliminating full table scan in removeUtteranceCascade
    this.version(25).stores({
      layer_segments: 'id, textId, mediaId, layerId, utteranceId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId]',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const layerSegmentsTable = typedTx.table('layer_segments');

      const prefixes = ['segv2_', 'segv22_'];
      await layerSegmentsTable.toCollection().modify((row: Record<string, unknown>) => {
        if (row.utteranceId) return; // 已有则跳过 | Skip if already present
        const segmentId = row.id as string;
        const layerId = row.layerId as string;
        for (const prefix of prefixes) {
          const expected = `${prefix}${layerId}_`;
          if (segmentId.startsWith(expected)) {
            const value = segmentId.slice(expected.length).trim();
            if (value.length > 0) {
              row.utteranceId = value;
              return;
            }
          }
        }
      });
    });

    // v26: track_entities — per-media track display state persisted to DB.
    // Migration: read from LocalStorage (v1 PoC), write to DB, then clear LocalStorage.
    this.version(26).stores({
      track_entities: 'id, textId, mediaId, [textId+mediaId]',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const trackEntitiesTable = typedTx.table('track_entities');

      // Read v1 LocalStorage data
      const STORAGE_KEY = 'jieyu:track-entity-state:v1';
      let localData: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) localData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }

      if (Object.keys(localData).length === 0) return;

      const now = new Date().toISOString();
      const toInsert: TrackEntityDocType[] = [];

      for (const [mediaId, value] of Object.entries(localData)) {
        if (!value || typeof value !== 'object') continue;
        const row = value as Record<string, unknown>;

        // textId is unknown at this level — use '__unknown__' as placeholder;
        // consumers that have a textId scope will filter accordingly.
        const textId = '__unknown__';
        const laneLockMap: Record<string, number> = {};
        if (row.laneLockMap && typeof row.laneLockMap === 'object') {
          for (const [k, v] of Object.entries(row.laneLockMap as Record<string, unknown>)) {
            if (Number.isInteger(v) && (v as number) >= 0) {
              laneLockMap[k] = v as number;
            }
          }
        }

        const mode = (row.mode === 'multi-auto' || row.mode === 'multi-locked' || row.mode === 'multi-speaker-fixed')
          ? (row.mode as 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed')
          : 'single';

        toInsert.push({
          id: `track_${mediaId}`,
          textId,
          mediaId,
          mode,
          laneLockMap,
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : now,
        });
      }

      if (toInsert.length > 0) {
        await trackEntitiesTable.bulkPut(toInsert);
      }

      // Keep LocalStorage as fallback safety net; cleanup can be done by explicit maintenance task later.
      // 保留 LocalStorage 作为兜底，避免迁移提交窗口崩溃导致“本地已删、DB未完成”丢失。
    });

    // v27: Plan B foundation — unified per-layer timeline units.
    // 统一时间单元基座：先回填默认转写层与独立段层，后续逐步替换业务读写。
    this.version(27).stores({
      layer_utterances: 'id, textId, mediaId, layerId, sourceKind, sourceId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId], [layerId+sourceKind+sourceId]',
    }).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utterancesTable = typedTx.table('utterances');
      const tiersTable = typedTx.table('tier_definitions');
      const layerSegmentsTable = typedTx.table('layer_segments');
      const layerUtterancesTable = typedTx.table('layer_utterances');

      const [utterances, tiers, segments] = await Promise.all([
        utterancesTable.toArray() as Promise<UtteranceDocType[]>,
        tiersTable.toArray() as Promise<TierDefinitionDocType[]>,
        layerSegmentsTable.toArray() as Promise<LayerSegmentDocType[]>,
      ]);

      if (utterances.length === 0 && segments.length === 0) return;

      const defaultTrcByText = new Map<string, TierDefinitionDocType>();
      const trcByText = new Map<string, TierDefinitionDocType[]>();
      for (const tier of tiers) {
        if (tier.contentType !== 'transcription') continue;
        const bucket = trcByText.get(tier.textId);
        if (bucket) bucket.push(tier);
        else trcByText.set(tier.textId, [tier]);
      }
      for (const [textId, bucket] of trcByText.entries()) {
        const sorted = [...bucket].sort((a, b) => {
          const defaultCmp = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
          if (defaultCmp !== 0) return defaultCmp;
          const sortA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const sortB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          if (sortA !== sortB) return sortA - sortB;
          return a.id.localeCompare(b.id);
        });
        const picked = sorted[0];
        if (picked) defaultTrcByText.set(textId, picked);
      }

      type LayerUtteranceMigrationRow = {
        id: string;
        textId: string;
        mediaId: string;
        layerId: string;
        sourceKind: 'utterance' | 'segment';
        sourceId: string;
        startTime: number;
        endTime: number;
        speakerId?: string;
        startAnchorId?: string;
        endAnchorId?: string;
        ordinal?: number;
        createdAt: string;
        updatedAt: string;
      };

      const rowsById = new Map<string, LayerUtteranceMigrationRow>();
      for (const utt of utterances) {
        const defaultTrc = defaultTrcByText.get(utt.textId);
        if (!defaultTrc || !utt.mediaId) continue;
        const id = `lu_${defaultTrc.id}_utt_${utt.id}`;
        rowsById.set(id, {
          id,
          textId: utt.textId,
          mediaId: utt.mediaId,
          layerId: defaultTrc.id,
          sourceKind: 'utterance',
          sourceId: utt.id,
          startTime: utt.startTime,
          endTime: utt.endTime,
          ...(utt.speakerId ? { speakerId: utt.speakerId } : {}),
          ...(utt.startAnchorId ? { startAnchorId: utt.startAnchorId } : {}),
          ...(utt.endAnchorId ? { endAnchorId: utt.endAnchorId } : {}),
          ...((utt as any).ordinal !== undefined && typeof (utt as any).ordinal === 'number' ? { ordinal: (utt as any).ordinal } : {}),
          createdAt: utt.createdAt,
          updatedAt: utt.updatedAt,
        });
      }

      for (const seg of segments) {
        const id = `lu_${seg.layerId}_seg_${seg.id}`;
        rowsById.set(id, {
          id,
          textId: seg.textId,
          mediaId: seg.mediaId,
          layerId: seg.layerId,
          sourceKind: 'segment',
          sourceId: seg.id,
          startTime: seg.startTime,
          endTime: seg.endTime,
          ...(seg.speakerId ? { speakerId: seg.speakerId } : {}),
          ...(seg.startAnchorId ? { startAnchorId: seg.startAnchorId } : {}),
          ...(seg.endAnchorId ? { endAnchorId: seg.endAnchorId } : {}),
          ...(typeof seg.ordinal === 'number' ? { ordinal: seg.ordinal } : {}),
          createdAt: seg.createdAt,
          updatedAt: seg.updatedAt,
        });
      }

      const rows = [...rowsById.values()];
      if (rows.length > 0) {
        await layerUtterancesTable.bulkPut(rows);
      }
    });

    // v28: Backfill utterance_texts → layer_segment_contents（Phase 0 去双写安全网）
    // 确保每一条 utterance_texts 行都有对应 V2 条目；v22 迁移的条目用 segv22_ 前缀，
    // 后续 BridgeService 写入的用 segv2_ 前缀，此处按 content ID 幂等补全。
    // Ensure every utterance_texts row has a corresponding V2 entry. Idempotent by content ID.
    this.version(28).stores({}).upgrade(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedTx = tx as any;
      const utteranceTextsTable = typedTx.table('utterance_texts');
      const utterancesTable     = typedTx.table('utterances');
      const layerSegmentsTable  = typedTx.table('layer_segments');
      const layerSegmentContentsTable = typedTx.table('layer_segment_contents');

      const [allTexts, allUtterances, existingContents, existingSegmentIds] = await Promise.all([
        utteranceTextsTable.toArray() as Promise<UtteranceTextDocType[]>,
        utterancesTable.toArray()     as Promise<UtteranceDocType[]>,
        layerSegmentContentsTable.toArray() as Promise<LayerSegmentContentDocType[]>,
        (layerSegmentsTable.toCollection().primaryKeys()) as Promise<string[]>,
      ]);

      if (allTexts.length === 0) return;

      const utteranceById = new Map(allUtterances.map((u: UtteranceDocType) => [u.id, u]));
      const existingContentById = new Map(existingContents.map((c: LayerSegmentContentDocType) => [c.id, c]));
      const existingSegmentIdSet = new Set(existingSegmentIds);
      const now = new Date().toISOString();

      const BATCH_SIZE = 200;
      const segmentBatch: LayerSegmentDocType[] = [];
      const contentBatch: LayerSegmentContentDocType[] = [];

      for (const text of allTexts) {
        const utt = utteranceById.get(text.utteranceId);
        if (!utt) continue; // 孤立 text，跳过 | orphan text, skip
        const existingContent = existingContentById.get(text.id);

        // 修复分支：若 content 存在但 segment 丢失，重建 canonical segment 并回指 | Repair branch: rebuild canonical segment when content exists but segment is missing
        const plan = buildV28BackfillPlanForText({
          text,
          utterance: utt,
          nowIso: now,
          ...(existingContent !== undefined
            ? { existingContent }
            : {}),
          segmentExists: (segmentId) => existingSegmentIdSet.has(segmentId),
        });
        if (!plan) continue;

        segmentBatch.push(plan.segment);
        contentBatch.push(plan.content);
        existingSegmentIdSet.add(plan.segment.id);
        existingContentById.set(plan.content.id, plan.content);

        // 分批写入避免 IndexedDB 单事务过大 | Batch write to avoid oversized transactions
        if (segmentBatch.length >= BATCH_SIZE) {
          await layerSegmentsTable.bulkPut(segmentBatch);
          await layerSegmentContentsTable.bulkPut(contentBatch);
          segmentBatch.length = 0;
          contentBatch.length = 0;
        }
      }

      // 写入剩余 | Flush remaining
      if (segmentBatch.length > 0) {
        await layerSegmentsTable.bulkPut(segmentBatch);
        await layerSegmentContentsTable.bulkPut(contentBatch);
      }
    });

    // v29: V2 single-source-of-truth cutoff — drop legacy utterance_texts table.
    this.version(29).stores({
      utterance_texts: null,
    });

    // v30: unified layer unit foundation tables.
    // 统一层单元基座表：为单实体多轴模型提供正式 schema，暂不回填旧数据。
    this.version(30).stores({
      layer_units: 'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
      layer_unit_contents: 'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
      unit_relations: 'id, textId, sourceUnitId, targetUnitId, relationType, [sourceUnitId+relationType], [targetUnitId+relationType]',
    });

    // v31: retire legacy segmentation tables after LayerUnit convergence.
    // LayerUnit 已成为唯一真源，物理移除 legacy segmentation 真表。
    this.version(31).stores({
      layer_segments: null,
      layer_segment_contents: null,
      segment_links: null,
    });

    // v32: remove abandoned layer_utterances table.
    // 删除未落地消费者的 layer_utterances 死表，避免继续悬空存在。
    this.version(32).stores({
      layer_utterances: null,
    });
  }
}

type GlobalWithJieyuDb = typeof globalThis & {
  __jieyuDbPromise__?: Promise<JieyuDatabase>;
  __jieyuDexie__?: JieyuDexie;
};

const globalWithDb = globalThis as GlobalWithJieyuDb;

function getOrCreateDexie(): JieyuDexie {
  if (!globalWithDb.__jieyuDexie__) {
    globalWithDb.__jieyuDexie__ = new JieyuDexie(JIEYU_DB_NAME);
  }
  return globalWithDb.__jieyuDexie__;
}

export const db = getOrCreateDexie();

async function _createDb(): Promise<JieyuDatabase> {
  const dexie = getOrCreateDexie();
  await dexie.open();

  const collections: JieyuCollections = {
    texts: new DexieCollectionAdapter(dexie.texts, validateTextDoc),
    media_items: new DexieCollectionAdapter(dexie.media_items, validateMediaItemDoc),
    utterances: new DexieCollectionAdapter(dexie.utterances, validateUtteranceDoc),
    utterance_tokens: new DexieCollectionAdapter(dexie.utterance_tokens, validateUtteranceTokenDoc),
    utterance_morphemes: new DexieCollectionAdapter(dexie.utterance_morphemes, validateUtteranceMorphemeDoc),
    anchors: new DexieCollectionAdapter(dexie.anchors, validateAnchorDoc),
    lexemes: new DexieCollectionAdapter(dexie.lexemes, validateLexemeDoc),
    token_lexeme_links: new DexieCollectionAdapter(
      dexie.token_lexeme_links,
      validateTokenLexemeLinkDoc,
    ),
    ai_tasks: new DexieCollectionAdapter(dexie.ai_tasks, validateAiTaskDoc),
    embeddings: new DexieCollectionAdapter(dexie.embeddings, validateEmbeddingDoc),
    ai_conversations: new DexieCollectionAdapter(
      dexie.ai_conversations,
      validateAiConversationDoc,
    ),
    ai_messages: new DexieCollectionAdapter(dexie.ai_messages, validateAiMessageDoc),
    languages: new DexieCollectionAdapter(dexie.languages, validateLanguageDoc),
    speakers: new DexieCollectionAdapter(dexie.speakers, validateSpeakerDoc),
    orthographies: new DexieCollectionAdapter(dexie.orthographies, validateOrthographyDoc),
    locations: new DexieCollectionAdapter(dexie.locations, validateLocationDoc),
    bibliographic_sources: new DexieCollectionAdapter(
      dexie.bibliographic_sources,
      validateBibliographicSourceDoc,
    ),
    grammar_docs: new DexieCollectionAdapter(dexie.grammar_docs, validateGrammarDoc),
    abbreviations: new DexieCollectionAdapter(dexie.abbreviations, validateAbbreviationDoc),
    phonemes: new DexieCollectionAdapter(dexie.phonemes, validatePhonemeDoc),
    tag_definitions: new DexieCollectionAdapter(
      dexie.tag_definitions,
      validateTagDefinitionDoc,
    ),
    layers: new TierBackedLayerCollectionAdapter(
      dexie.tier_definitions,
      validateLayerDoc,
    ),
    layer_units: new DexieCollectionAdapter(
      dexie.layer_units,
      validateLayerUnitDoc,
    ),
    layer_unit_contents: new DexieCollectionAdapter(
      dexie.layer_unit_contents,
      validateLayerUnitContentDoc,
    ),
    unit_relations: new DexieCollectionAdapter(
      dexie.unit_relations,
      validateUnitRelationDoc,
    ),
    layer_links: new DexieCollectionAdapter(dexie.layer_links, validateLayerLinkDoc),
    tier_definitions: new DexieCollectionAdapter(dexie.tier_definitions, validateTierDefinitionDoc),
    tier_annotations: new DexieCollectionAdapter(dexie.tier_annotations, validateTierAnnotationDoc),
    audit_logs: new DexieCollectionAdapter(dexie.audit_logs, validateAuditLogDoc),
    user_notes: new DexieCollectionAdapter(dexie.user_notes, validateUserNoteDoc),
    track_entities: new DexieCollectionAdapter(dexie.track_entities, validateTrackEntityDoc),
  };

  return {
    name: dexie.name,
    dexie,
    collections,
    close: async () => {
      dexie.close();
    },
  };
}

export function getDb(): Promise<JieyuDatabase> {
  if (!globalWithDb.__jieyuDbPromise__) {
    globalWithDb.__jieyuDbPromise__ = _createDb().catch((error) => {
      delete globalWithDb.__jieyuDbPromise__;
      throw error;
    });
  }
  return globalWithDb.__jieyuDbPromise__;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export async function exportDatabaseAsJson(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: Record<string, unknown[]>;
}> {
  const db = await getDb();
  const entries = await Promise.all(
    Object.entries(db.collections).map(async ([name, collection]) => {
      const docs = await collection.find().exec();
      return [name, docs.map((doc) => doc.toJSON())] as const;
    }),
  );

  const collections = Object.fromEntries(entries) as Record<string, unknown[]>;

  // Convert audio Blobs to portable data URLs for JSON export
  const mediaItems = collections['media_items'] as Array<Record<string, unknown>> | undefined;
  if (mediaItems) {
    for (const item of mediaItems) {
      const details = item['details'] as Record<string, unknown> | undefined;
      if (details?.['audioBlob'] instanceof Blob) {
        const copy = { ...details };
        copy['audioDataUrl'] = await blobToBase64(details['audioBlob'] as Blob);
        delete copy['audioBlob'];
        item['details'] = copy;
      }
    }
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dbName: db.name,
    collections,
  };
}

export async function downloadDatabaseAsJson(filename?: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadDatabaseAsJson can only run in browser context');
  }

  const snapshot = await exportDatabaseAsJson();
  const content = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `jieyu-export-${snapshot.exportedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const databaseSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive().optional().default(1),
  exportedAt: isoDateSchema.optional(),
  dbName: z.string().optional(),
  collections: z.record(z.string(), z.array(z.unknown())),
});

const knownCollectionNames = [
  'texts',
  'media_items',
  'utterances',
  'utterance_tokens',
  'utterance_morphemes',
  'anchors',
  'lexemes',
  'token_lexeme_links',
  'ai_tasks',
  'embeddings',
  'ai_conversations',
  'ai_messages',
  'languages',
  'speakers',
  'orthographies',
  'locations',
  'bibliographic_sources',
  'grammar_docs',
  'abbreviations',
  'phonemes',
  'tag_definitions',
  'layers',
  'layer_units',
  'layer_unit_contents',
  'unit_relations',
  'layer_links',
  'tier_definitions',
  'tier_annotations',
  'audit_logs',
  'user_notes',
  'track_entities',
] as const;

type KnownCollectionName = (typeof knownCollectionNames)[number];

const tableByCollection: Partial<Record<KnownCollectionName, Table<{ id: string }, string>>> = {
  texts: db.texts,
  media_items: db.media_items,
  utterances: db.utterances,
  utterance_tokens: db.utterance_tokens,
  utterance_morphemes: db.utterance_morphemes,
  anchors: db.anchors,
  lexemes: db.lexemes,
  token_lexeme_links: db.token_lexeme_links,
  ai_tasks: db.ai_tasks,
  embeddings: db.embeddings,
  ai_conversations: db.ai_conversations,
  ai_messages: db.ai_messages,
  languages: db.languages,
  speakers: db.speakers,
  orthographies: db.orthographies,
  locations: db.locations,
  bibliographic_sources: db.bibliographic_sources,
  grammar_docs: db.grammar_docs,
  abbreviations: db.abbreviations,
  phonemes: db.phonemes,
  tag_definitions: db.tag_definitions,
  layer_units: db.layer_units,
  layer_unit_contents: db.layer_unit_contents,
  unit_relations: db.unit_relations,
  layer_links: db.layer_links,
  tier_definitions: db.tier_definitions,
  tier_annotations: db.tier_annotations,
  audit_logs: db.audit_logs,
  user_notes: db.user_notes,
  track_entities: db.track_entities,
};

const validatorByCollection: Record<KnownCollectionName, (value: unknown) => void> = {
  texts: (value) => validateTextDoc(value as TextDocType),
  media_items: (value) => validateMediaItemDoc(value as MediaItemDocType),
  utterances: (value) => validateUtteranceDoc(value as UtteranceDocType),
  utterance_tokens: (value) => validateUtteranceTokenDoc(value as UtteranceTokenDocType),
  utterance_morphemes: (value) => validateUtteranceMorphemeDoc(value as UtteranceMorphemeDocType),
  anchors: (value) => validateAnchorDoc(value as AnchorDocType),
  lexemes: (value) => validateLexemeDoc(value as LexemeDocType),
  token_lexeme_links: (value) => validateTokenLexemeLinkDoc(value as TokenLexemeLinkDocType),
  ai_tasks: (value) => validateAiTaskDoc(value as AiTaskDoc),
  embeddings: (value) => validateEmbeddingDoc(value as EmbeddingDoc),
  ai_conversations: (value) => validateAiConversationDoc(value as AiConversationDoc),
  ai_messages: (value) => validateAiMessageDoc(value as AiMessageDoc),
  languages: (value) => validateLanguageDoc(value as LanguageDocType),
  speakers: (value) => validateSpeakerDoc(value as SpeakerDocType),
  orthographies: (value) => validateOrthographyDoc(value as OrthographyDocType),
  locations: (value) => validateLocationDoc(value as LocationDocType),
  bibliographic_sources: (value) => validateBibliographicSourceDoc(value as BibliographicSourceDocType),
  grammar_docs: (value) => validateGrammarDoc(value as GrammarDocDocType),
  abbreviations: (value) => validateAbbreviationDoc(value as AbbreviationDocType),
  phonemes: (value) => validatePhonemeDoc(value as PhonemeDocType),
  tag_definitions: (value) => validateTagDefinitionDoc(value as TagDefinitionDocType),
  layers: (value) => validateLayerDoc(value as LayerDocType),
  layer_units: (value) => validateLayerUnitDoc(value as LayerUnitDocType),
  layer_unit_contents: (value) => validateLayerUnitContentDoc(value as LayerUnitContentDocType),
  unit_relations: (value) => validateUnitRelationDoc(value as UnitRelationDocType),
  layer_links: (value) => validateLayerLinkDoc(value as LayerLinkDocType),
  tier_definitions: (value) => validateTierDefinitionDoc(value as TierDefinitionDocType),
  tier_annotations: (value) => validateTierAnnotationDoc(value as TierAnnotationDocType),
  audit_logs: (value) => validateAuditLogDoc(value as AuditLogDocType),
  user_notes: (value) => validateUserNoteDoc(value as UserNoteDocType),
  track_entities: (value) => validateTrackEntityDoc(value as TrackEntityDocType),
};

function ensureImportProvenance<T extends { provenance?: ProvenanceEnvelope; createdAt?: string }>(
  doc: T,
  fallbackCreatedAt: string,
): T {
  if (doc.provenance) return doc;
  return {
    ...doc,
    provenance: {
      actorType: 'importer',
      method: 'import',
      createdAt: doc.createdAt ?? fallbackCreatedAt,
    },
  };
}

function normalizeImportedUtteranceDoc(doc: UtteranceDocType, fallbackCreatedAt: string): UtteranceDocType {
  const normalizedWords = doc.words?.map((word, wi) => {
    const wordId = word.id ?? `${doc.id}_w${wi + 1}`;
    const normalizedMorphemes = word.morphemes?.map((morpheme, mi) => {
      const morphemeId = morpheme.id ?? `${wordId}_m${mi + 1}`;
      return ensureImportProvenance({ ...morpheme, id: morphemeId }, fallbackCreatedAt);
    });

    return ensureImportProvenance(
      {
        ...word,
        id: wordId,
        ...(normalizedMorphemes ? { morphemes: normalizedMorphemes } : {}),
      },
      fallbackCreatedAt,
    );
  });

  return ensureImportProvenance(
    {
      ...doc,
      ...(normalizedWords ? { words: normalizedWords } : {}),
    },
    fallbackCreatedAt,
  );
}

function normalizeImportedDoc(collectionName: KnownCollectionName, doc: unknown, fallbackCreatedAt: string): unknown {
  if (!doc || typeof doc !== 'object') return doc;

  switch (collectionName) {
    case 'utterances':
      return normalizeImportedUtteranceDoc(doc as UtteranceDocType, fallbackCreatedAt);
    case 'utterance_tokens':
      return ensureImportProvenance(doc as UtteranceTokenDocType, fallbackCreatedAt);
    case 'utterance_morphemes':
      return ensureImportProvenance(doc as UtteranceMorphemeDocType, fallbackCreatedAt);
    case 'layer_units':
      return ensureImportProvenance(doc as LayerUnitDocType, fallbackCreatedAt);
    case 'layer_unit_contents':
      return ensureImportProvenance(doc as LayerUnitContentDocType, fallbackCreatedAt);
    case 'unit_relations':
      return ensureImportProvenance(doc as UnitRelationDocType, fallbackCreatedAt);
    case 'tier_annotations':
      return ensureImportProvenance(doc as TierAnnotationDocType, fallbackCreatedAt);
    case 'user_notes':
      return ensureImportProvenance(doc as UserNoteDocType, fallbackCreatedAt);
    case 'track_entities':
      return doc;
    case 'lexemes':
      return ensureImportProvenance(doc as LexemeDocType, fallbackCreatedAt);
    case 'token_lexeme_links':
      return ensureImportProvenance(doc as TokenLexemeLinkDocType, fallbackCreatedAt);
    case 'phonemes':
      return ensureImportProvenance(doc as PhonemeDocType, fallbackCreatedAt);
    default:
      return doc;
  }
}

async function pruneOrphanUserNotes(): Promise<number> {
  const notes = await db.user_notes.toArray();
  if (notes.length === 0) return 0;

  const utteranceIds = new Set<string>();
  const textIds = new Set<string>();
  const lexemeIds = new Set<string>();
  const annotationIds = new Set<string>();
  const tokenIds = new Set<string>();
  const morphemeIds = new Set<string>();

  for (const note of notes) {
    if (note.targetType === 'utterance') utteranceIds.add(note.targetId);
    if (note.targetType === 'text') textIds.add(note.targetId);
    if (note.targetType === 'lexeme') lexemeIds.add(note.targetId);
    if (note.targetType === 'tier_annotation' && !note.targetId.includes('::')) annotationIds.add(note.targetId);
    if (note.targetType === 'token') tokenIds.add(note.targetId);
    if (note.targetType === 'morpheme') morphemeIds.add(note.targetId);
  }

  const existingUtteranceIds = new Set((await db.utterances.bulkGet([...utteranceIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingTextIds = new Set((await db.texts.bulkGet([...textIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingLexemeIds = new Set((await db.lexemes.bulkGet([...lexemeIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingAnnotationIds = new Set((await db.tier_annotations.bulkGet([...annotationIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingTokenIds = new Set((await db.utterance_tokens.bulkGet([...tokenIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingMorphemeIds = new Set((await db.utterance_morphemes.bulkGet([...morphemeIds])).flatMap((d) => (d?.id ? [d.id] : [])));

  const orphanIds: string[] = [];
  for (const note of notes) {
    if (note.targetType === 'utterance' && !existingUtteranceIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'text' && !existingTextIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'lexeme' && !existingLexemeIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'tier_annotation' && !note.targetId.includes('::') && !existingAnnotationIds.has(note.targetId)) {
      orphanIds.push(note.id);
    }
    if (note.targetType === 'token' && !existingTokenIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'morpheme' && !existingMorphemeIds.has(note.targetId)) orphanIds.push(note.id);
  }

  if (orphanIds.length > 0) {
    await db.user_notes.bulkDelete(orphanIds);
  }

  return orphanIds.length;
}

export async function importDatabaseFromJson(
  input: unknown,
  options?: { strategy?: ImportConflictStrategy },
): Promise<ImportResult> {
  const strategy = options?.strategy ?? 'upsert';
  let parsedRaw: unknown;
  try {
    parsedRaw = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    throw new Error(`Invalid JSON input: ${e instanceof Error ? e.message : 'unknown parse error'}`);
  }
  const snapshot = databaseSnapshotSchema.parse(parsedRaw);

  if (snapshot.schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported snapshot schemaVersion=${snapshot.schemaVersion}, current=${SNAPSHOT_SCHEMA_VERSION}`,
    );
  }

  if ('utterance_texts' in snapshot.collections) {
    throw new Error('Legacy collection "utterance_texts" is no longer supported; import a LayerUnit snapshot.');
  }
  if (!('layer_units' in snapshot.collections) || !('layer_unit_contents' in snapshot.collections)) {
    throw new Error('Invalid LayerUnit snapshot: missing required collections "layer_units" or "layer_unit_contents".');
  }

  const result: ImportResult = {
    importedAt: new Date().toISOString(),
    strategy,
    collections: {},
    ignoredCollections: [],
  };
  const importStartedAt = result.importedAt;

  for (const [name, docs] of Object.entries(snapshot.collections)) {
    if (!knownCollectionNames.includes(name as KnownCollectionName)) {
      result.ignoredCollections.push(name);
      continue;
    }

    const collectionName = name as KnownCollectionName;
    if (collectionName === 'layers') {
      const collection = (await getDb()).collections.layers;
      let written = 0;
      let skipped = 0;

      if (strategy === 'replace-all') {
        const existing = await collection.find().exec();
        for (const row of existing) {
          await collection.remove(row.primary);
        }
      }

      const normalizedDocs = docs.map((doc) => normalizeImportedDoc(collectionName, doc, importStartedAt));

      for (const doc of normalizedDocs) {
        const candidate = doc as { id?: unknown };
        if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
          throw new Error(`Invalid doc in ${collectionName}: missing non-empty id`);
        }
        validatorByCollection[collectionName](doc);
      }

      if (strategy === 'skip-existing') {
        for (const doc of normalizedDocs as LayerDocType[]) {
          const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
          if (existing) {
            skipped += 1;
            continue;
          }
          await collection.insert(doc);
          written += 1;
        }
      } else {
        for (const doc of normalizedDocs as LayerDocType[]) {
          await collection.insert(doc);
          written += 1;
        }
      }

      result.collections[collectionName] = {
        received: docs.length,
        written,
        skipped,
      };
      continue;
    }

    const table = tableByCollection[collectionName];
    if (!table) {
      result.ignoredCollections.push(collectionName);
      continue;
    }
    const validate = validatorByCollection[collectionName];
    let written = 0;
    let skipped = 0;

    if (strategy === 'replace-all') {
      await table.clear();
    }

    const normalizedDocs = docs.map((doc) => normalizeImportedDoc(collectionName, doc, importStartedAt));

    for (const doc of normalizedDocs) {
      const candidate = doc as { id?: unknown };
      if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
        throw new Error(`Invalid doc in ${collectionName}: missing non-empty id`);
      }

      // Restore audio Blobs from exported data URLs
      if (collectionName === 'media_items') {
        const details = (doc as Record<string, unknown>)['details'] as Record<string, unknown> | undefined;
        if (typeof details?.['audioDataUrl'] === 'string') {
          const resp = await fetch(details['audioDataUrl'] as string);
          details['audioBlob'] = await resp.blob();
          delete details['audioDataUrl'];
        }
      }

      validate(doc);
    }

    if (strategy === 'skip-existing') {
      const existingDocs = await table.bulkGet(normalizedDocs.map((d) => (d as { id: string }).id));
      const toInsert = normalizedDocs.filter((_, i) => !existingDocs[i]);
      skipped = normalizedDocs.length - toInsert.length;
      if (toInsert.length > 0) await table.bulkPut(toInsert as Array<{ id: string }>);
      written = toInsert.length;
    } else {
      if (normalizedDocs.length > 0) await table.bulkPut(normalizedDocs as Array<{ id: string }>);
      written = normalizedDocs.length;
    }

    result.collections[collectionName] = {
      received: docs.length,
      written,
      skipped,
    };
  }

  await pruneOrphanUserNotes();

  return result;
}

export type {
  ImportConflictStrategy,
  ImportCollectionResult,
  ImportResult,
  JieyuDatabase,
  JieyuCollections,
  TextDocType,
  MediaItemDocType,
  UtteranceDocType,
  UtteranceTokenDocType,
  UtteranceMorphemeDocType,
  AnchorDocType,
  LexemeDocType,
  TokenLexemeLinkDocType,
  TokenLexemeLinkTargetType,
  TokenLexemeLinkRole,
  AiTaskDoc,
  AiTaskStatus,
  AiTaskType,
  EmbeddingDoc,
  EmbeddingSourceType,
  AiConversationDoc,
  AiConversationMode,
  AiMessageDoc,
  AiMessageRole,
  AiMessageStatus,
  AiMessageCitation,
  LanguageDocType,
  SpeakerDocType,
  OrthographyDocType,
  LocationDocType,
  BibliographicSourceDocType,
  GrammarDocDocType,
  AbbreviationDocType,
  PhonemeDocType,
  TagDefinitionDocType,
  LayerDocType,
  LayerConstraint,
  UtteranceTextDocType,
  LayerUnitDocType,
  LayerUnitType,
  LayerUnitStatus,
  LayerUnitContentDocType,
  LayerContentRole,
  UnitRelationDocType,
  UnitRelationType,
  LayerSegmentDocType,
  LayerSegmentContentDocType,
  SegmentLinkDocType,
  SegmentLinkType,
  LayerLinkDocType,
  TierDefinitionDocType,
  TierAnnotationDocType,
  AnnotationHypothesis,
  TierType,
  TierContentType,
  AuditLogDocType,
  UserNoteDocType,
  TrackEntityDocType,
  NoteTargetType,
  NoteCategory,
  AuditAction,
  AuditSource,
  AiMetadata,
  ReviewStatus,
  ActorType,
  CreationMethod,
  ProvenanceEnvelope,
  MultiLangString,
  Transcription,
  Morpheme,
  UtteranceWord,
};

export { LAYER_SOFT_LIMITS };
export { buildSegmentationV2BackfillRows, buildV28BackfillPlanForText };
