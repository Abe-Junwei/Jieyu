import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

const JIEYU_DB_NAME = 'jieyudb';
const SNAPSHOT_SCHEMA_VERSION = 1;

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

interface Word {
  transcription: Transcription;
  gloss?: MultiLangString;
  morphemes?: Array<{
    transcription: Transcription;
    gloss?: MultiLangString;
  }>;
  [key: string]: unknown;
}

interface UtteranceDocType {
  id: string;
  textId: string;
  mediaId?: string;
  transcription: Transcription;
  translation?: MultiLangString;
  words?: Word[];
  speaker?: string;
  language?: string;
  startTime: number;
  endTime: number;
  notes?: MultiLangString;
  tags?: Record<string, boolean>;
  ai_metadata?: AiMetadata;
  aiMode?: 'AUTO' | 'SUGGEST';
  isVerified: boolean;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
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
  examples?: string[];
  usageCount?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

interface AnnotationDocType {
  id: string;
  textId: string;
  annotationType: 'timespan' | 'timestamp';
  startTime?: number;
  endTime?: number;
  ts?: number;
  tags?: Record<string, boolean>;
  notes?: MultiLangString;
  linkedEntityId?: string;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
}

interface CorpusLexiconLinkDocType {
  id: string;
  utteranceId: string;
  lexemeId: string;
  wordIndex?: number;
  confidence?: number;
  createdAt: string;
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

interface TranslationLayerDocType {
  id: string;
  key: string;
  name: MultiLangString;
  layerType: 'transcription' | 'translation';
  languageId: string;
  modality: 'text' | 'audio' | 'mixed';
  acceptsAudio?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

interface UtteranceTranslationDocType {
  id: string;
  utteranceId: string;
  translationLayerId: string;
  modality: 'text' | 'audio' | 'mixed';
  text?: string;
  translationAudioMediaId?: string;
  recordedBySpeakerId?: string;
  sourceType: 'human' | 'ai';
  ai_metadata?: AiMetadata;
  accessRights?: 'open' | 'restricted' | 'confidential';
  createdAt: string;
  updatedAt: string;
}

interface LayerLinkDocType {
  id: string;
  transcriptionLayerKey: string;
  translationLayerId: string;
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
  delimiter?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

interface TierAnnotationDocType {
  id: string;
  tierId: string;
  parentAnnotationId?: string;
  startTime?: number;
  endTime?: number;
  ordinal?: number;
  value: string;
  lexemeId?: string;
  senseIndex?: number;
  speakerId?: string;
  ai_metadata?: AiMetadata;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

type AuditAction = 'create' | 'update' | 'delete';
type AuditSource = 'human' | 'ai' | 'system';

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

const utteranceWordSchema = z
  .object({
    transcription: transcriptionSchema,
    gloss: multiLangStringSchema.optional(),
    morphemes: z
      .array(
        z.object({
          transcription: transcriptionSchema,
          gloss: multiLangStringSchema.optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const utteranceDocSchema = z
  .object({
    id: z.string().min(1),
    textId: z.string().min(1),
    mediaId: z.string().optional(),
    transcription: transcriptionSchema,
    translation: multiLangStringSchema.optional(),
    words: z.array(utteranceWordSchema).optional(),
    speaker: z.string().optional(),
    language: z.string().optional(),
    startTime: z.number().finite(),
    endTime: z.number().finite(),
    notes: multiLangStringSchema.optional(),
    tags: z.record(z.string(), z.boolean()).optional(),
    ai_metadata: aiMetadataSchema.optional(),
    aiMode: z.enum(['AUTO', 'SUGGEST']).optional(),
    isVerified: z.boolean(),
    accessRights: accessRightsSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .refine((doc) => doc.endTime >= doc.startTime, {
    message: 'endTime must be >= startTime',
    path: ['endTime'],
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
  examples: z.array(z.string()).optional(),
  usageCount: z.number().int().min(0).optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const annotationDocSchema = z.object({
  id: z.string().min(1),
  textId: z.string().min(1),
  annotationType: z.enum(['timespan', 'timestamp']),
  startTime: z.number().finite().optional(),
  endTime: z.number().finite().optional(),
  ts: z.number().finite().optional(),
  tags: z.record(z.string(), z.boolean()).optional(),
  notes: multiLangStringSchema.optional(),
  linkedEntityId: z.string().optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
});

const corpusLexiconLinkDocSchema = z.object({
  id: z.string().min(1),
  utteranceId: z.string().min(1),
  lexemeId: z.string().min(1),
  wordIndex: z.number().int().optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: isoDateSchema,
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

const translationLayerDocSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: multiLangStringSchema,
  layerType: z.enum(['transcription', 'translation']),
  languageId: z.string().min(1),
  modality: z.enum(['text', 'audio', 'mixed']),
  acceptsAudio: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  accessRights: accessRightsSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const utteranceTranslationDocSchema = z.object({
  id: z.string().min(1),
  utteranceId: z.string().min(1),
  translationLayerId: z.string().min(1),
  modality: z.enum(['text', 'audio', 'mixed']),
  text: z.string().optional(),
  translationAudioMediaId: z.string().optional(),
  recordedBySpeakerId: z.string().optional(),
  sourceType: z.enum(['human', 'ai']),
  ai_metadata: aiMetadataSchema.optional(),
  accessRights: accessRightsSchema.optional(),
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
  delimiter: z.string().optional(),
  sortOrder: z.number().int().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const tierAnnotationDocSchema = z.object({
  id: z.string().min(1),
  tierId: z.string().min(1),
  parentAnnotationId: z.string().min(1).optional(),
  startTime: z.number().finite().optional(),
  endTime: z.number().finite().optional(),
  ordinal: z.number().int().min(0).optional(),
  value: z.string(),
  lexemeId: z.string().min(1).optional(),
  senseIndex: z.number().int().min(0).optional(),
  speakerId: z.string().optional(),
  ai_metadata: aiMetadataSchema.optional(),
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
});

const layerLinkDocSchema = z.object({
  id: z.string().min(1),
  transcriptionLayerKey: z.string().min(1),
  translationLayerId: z.string().min(1),
  linkType: z.enum(['direct', 'free', 'literal', 'pedagogical']),
  isPreferred: z.boolean(),
  createdAt: isoDateSchema,
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

function validateAnnotationDoc(doc: AnnotationDocType): void {
  annotationDocSchema.parse(doc);
}

function validateCorpusLexiconLinkDoc(doc: CorpusLexiconLinkDocType): void {
  corpusLexiconLinkDocSchema.parse(doc);
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

function validateTranslationLayerDoc(doc: TranslationLayerDocType): void {
  translationLayerDocSchema.parse(doc);
}

function validateUtteranceTranslationDoc(doc: UtteranceTranslationDocType): void {
  utteranceTranslationDocSchema.parse(doc);
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
        const found = await this.table
          .filter((row) => entries.every(([key, expected]) => row[key] === expected))
          .first();
        return found ? wrapDoc(found) : null;
      },
    };
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

  async removeBySelector(selector: Selector<T>): Promise<number> {
    const entries = Object.entries(selector) as Array<[keyof T, unknown]>;
    const keys = (await this.table
      .filter((row) => entries.every(([key, expected]) => row[key] === expected))
      .primaryKeys()) as string[];

    if (keys.length === 0) {
      return 0;
    }

    await this.table.bulkDelete(keys);
    return keys.length;
  }
}

type CollectionAdapter<T extends { id: string }> = DexieCollectionAdapter<T>;

type JieyuCollections = {
  texts: CollectionAdapter<TextDocType>;
  media_items: CollectionAdapter<MediaItemDocType>;
  utterances: CollectionAdapter<UtteranceDocType>;
  lexemes: CollectionAdapter<LexemeDocType>;
  annotations: CollectionAdapter<AnnotationDocType>;
  corpus_lexicon_links: CollectionAdapter<CorpusLexiconLinkDocType>;
  languages: CollectionAdapter<LanguageDocType>;
  speakers: CollectionAdapter<SpeakerDocType>;
  orthographies: CollectionAdapter<OrthographyDocType>;
  locations: CollectionAdapter<LocationDocType>;
  bibliographic_sources: CollectionAdapter<BibliographicSourceDocType>;
  grammar_docs: CollectionAdapter<GrammarDocDocType>;
  abbreviations: CollectionAdapter<AbbreviationDocType>;
  phonemes: CollectionAdapter<PhonemeDocType>;
  tag_definitions: CollectionAdapter<TagDefinitionDocType>;
  translation_layers: CollectionAdapter<TranslationLayerDocType>;
  utterance_translations: CollectionAdapter<UtteranceTranslationDocType>;
  layer_links: CollectionAdapter<LayerLinkDocType>;
  tier_definitions: CollectionAdapter<TierDefinitionDocType>;
  tier_annotations: CollectionAdapter<TierAnnotationDocType>;
  audit_logs: CollectionAdapter<AuditLogDocType>;
};

type JieyuDatabase = {
  name: string;
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

class JieyuDexie extends Dexie {
  texts!: Table<TextDocType, string>;
  media_items!: Table<MediaItemDocType, string>;
  utterances!: Table<UtteranceDocType, string>;
  lexemes!: Table<LexemeDocType, string>;
  annotations!: Table<AnnotationDocType, string>;
  corpus_lexicon_links!: Table<CorpusLexiconLinkDocType, string>;
  languages!: Table<LanguageDocType, string>;
  speakers!: Table<SpeakerDocType, string>;
  orthographies!: Table<OrthographyDocType, string>;
  locations!: Table<LocationDocType, string>;
  bibliographic_sources!: Table<BibliographicSourceDocType, string>;
  grammar_docs!: Table<GrammarDocDocType, string>;
  abbreviations!: Table<AbbreviationDocType, string>;
  phonemes!: Table<PhonemeDocType, string>;
  tag_definitions!: Table<TagDefinitionDocType, string>;
  translation_layers!: Table<TranslationLayerDocType, string>;
  utterance_translations!: Table<UtteranceTranslationDocType, string>;
  layer_links!: Table<LayerLinkDocType, string>;
  tier_definitions!: Table<TierDefinitionDocType, string>;
  tier_annotations!: Table<TierAnnotationDocType, string>;
  audit_logs!: Table<AuditLogDocType, string>;

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
    lexemes: new DexieCollectionAdapter(dexie.lexemes, validateLexemeDoc),
    annotations: new DexieCollectionAdapter(dexie.annotations, validateAnnotationDoc),
    corpus_lexicon_links: new DexieCollectionAdapter(
      dexie.corpus_lexicon_links,
      validateCorpusLexiconLinkDoc,
    ),
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
    translation_layers: new DexieCollectionAdapter(
      dexie.translation_layers,
      validateTranslationLayerDoc,
    ),
    utterance_translations: new DexieCollectionAdapter(
      dexie.utterance_translations,
      validateUtteranceTranslationDoc,
    ),
    layer_links: new DexieCollectionAdapter(dexie.layer_links, validateLayerLinkDoc),
    tier_definitions: new DexieCollectionAdapter(dexie.tier_definitions, validateTierDefinitionDoc),
    tier_annotations: new DexieCollectionAdapter(dexie.tier_annotations, validateTierAnnotationDoc),
    audit_logs: new DexieCollectionAdapter(dexie.audit_logs, validateAuditLogDoc),
  };

  return {
    name: dexie.name,
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
  'lexemes',
  'annotations',
  'corpus_lexicon_links',
  'languages',
  'speakers',
  'orthographies',
  'locations',
  'bibliographic_sources',
  'grammar_docs',
  'abbreviations',
  'phonemes',
  'tag_definitions',
  'translation_layers',
  'utterance_translations',
  'layer_links',
  'tier_definitions',
  'tier_annotations',
  'audit_logs',
] as const;

type KnownCollectionName = (typeof knownCollectionNames)[number];

const tableByCollection: Record<KnownCollectionName, Table<{ id: string }, string>> = {
  texts: db.texts,
  media_items: db.media_items,
  utterances: db.utterances,
  lexemes: db.lexemes,
  annotations: db.annotations,
  corpus_lexicon_links: db.corpus_lexicon_links,
  languages: db.languages,
  speakers: db.speakers,
  orthographies: db.orthographies,
  locations: db.locations,
  bibliographic_sources: db.bibliographic_sources,
  grammar_docs: db.grammar_docs,
  abbreviations: db.abbreviations,
  phonemes: db.phonemes,
  tag_definitions: db.tag_definitions,
  translation_layers: db.translation_layers,
  utterance_translations: db.utterance_translations,
  layer_links: db.layer_links,
  tier_definitions: db.tier_definitions,
  tier_annotations: db.tier_annotations,
  audit_logs: db.audit_logs,
};

const validatorByCollection: Record<KnownCollectionName, (value: unknown) => void> = {
  texts: (value) => validateTextDoc(value as TextDocType),
  media_items: (value) => validateMediaItemDoc(value as MediaItemDocType),
  utterances: (value) => validateUtteranceDoc(value as UtteranceDocType),
  lexemes: (value) => validateLexemeDoc(value as LexemeDocType),
  annotations: (value) => validateAnnotationDoc(value as AnnotationDocType),
  corpus_lexicon_links: (value) => validateCorpusLexiconLinkDoc(value as CorpusLexiconLinkDocType),
  languages: (value) => validateLanguageDoc(value as LanguageDocType),
  speakers: (value) => validateSpeakerDoc(value as SpeakerDocType),
  orthographies: (value) => validateOrthographyDoc(value as OrthographyDocType),
  locations: (value) => validateLocationDoc(value as LocationDocType),
  bibliographic_sources: (value) => validateBibliographicSourceDoc(value as BibliographicSourceDocType),
  grammar_docs: (value) => validateGrammarDoc(value as GrammarDocDocType),
  abbreviations: (value) => validateAbbreviationDoc(value as AbbreviationDocType),
  phonemes: (value) => validatePhonemeDoc(value as PhonemeDocType),
  tag_definitions: (value) => validateTagDefinitionDoc(value as TagDefinitionDocType),
  translation_layers: (value) => validateTranslationLayerDoc(value as TranslationLayerDocType),
  utterance_translations: (value) =>
    validateUtteranceTranslationDoc(value as UtteranceTranslationDocType),
  layer_links: (value) => validateLayerLinkDoc(value as LayerLinkDocType),
  tier_definitions: (value) => validateTierDefinitionDoc(value as TierDefinitionDocType),
  tier_annotations: (value) => validateTierAnnotationDoc(value as TierAnnotationDocType),
  audit_logs: (value) => validateAuditLogDoc(value as AuditLogDocType),
};

export async function importDatabaseFromJson(
  input: unknown,
  options?: { strategy?: ImportConflictStrategy },
): Promise<ImportResult> {
  const strategy = options?.strategy ?? 'upsert';
  const parsedRaw = typeof input === 'string' ? JSON.parse(input) : input;
  const snapshot = databaseSnapshotSchema.parse(parsedRaw);

  if (snapshot.schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported snapshot schemaVersion=${snapshot.schemaVersion}, current=${SNAPSHOT_SCHEMA_VERSION}`,
    );
  }

  const result: ImportResult = {
    importedAt: new Date().toISOString(),
    strategy,
    collections: {},
    ignoredCollections: [],
  };

  for (const [name, docs] of Object.entries(snapshot.collections)) {
    if (!knownCollectionNames.includes(name as KnownCollectionName)) {
      result.ignoredCollections.push(name);
      continue;
    }

    const collectionName = name as KnownCollectionName;
    const table = tableByCollection[collectionName];
    const validate = validatorByCollection[collectionName];
    let written = 0;
    let skipped = 0;

    if (strategy === 'replace-all') {
      await table.clear();
    }

    for (const doc of docs) {
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
      const existingDocs = await table.bulkGet(docs.map((d) => (d as { id: string }).id));
      const toInsert = docs.filter((_, i) => !existingDocs[i]);
      skipped = docs.length - toInsert.length;
      if (toInsert.length > 0) await table.bulkPut(toInsert as Array<{ id: string }>);
      written = toInsert.length;
    } else {
      if (docs.length > 0) await table.bulkPut(docs as Array<{ id: string }>);
      written = docs.length;
    }

    result.collections[collectionName] = {
      received: docs.length,
      written,
      skipped,
    };
  }

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
  LexemeDocType,
  AnnotationDocType,
  CorpusLexiconLinkDocType,
  LanguageDocType,
  SpeakerDocType,
  OrthographyDocType,
  LocationDocType,
  BibliographicSourceDocType,
  GrammarDocDocType,
  AbbreviationDocType,
  PhonemeDocType,
  TagDefinitionDocType,
  TranslationLayerDocType,
  UtteranceTranslationDocType,
  LayerLinkDocType,
  TierDefinitionDocType,
  TierAnnotationDocType,
  TierType,
  TierContentType,
  AuditLogDocType,
  AuditAction,
  AuditSource,
  AiMetadata,
  MultiLangString,
  Transcription,
};
