/**
 * 解语 (Jieyu) — 濒危语言科研协作平台
 * Jieyu — Endangered Language Research & Collaboration Platform
 *
 * 本地数据库定义 (RxDB / DLx 兼容)
 * Local database definitions (RxDB / DLx-compatible)
 */

import { createRxDatabase } from 'rxdb';
import type { RxDatabase, RxCollection, RxJsonSchema } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

// ============================================================
//  共享类型定义 | Shared type definitions
// ============================================================

/**
 * DLx 多语言字符串 — 以 BCP-47 语言标签为键
 * DLx MultiLangString — object keyed by BCP-47 language tags
 */
interface MultiLangString {
  [languageTag: string]: string;
}

/**
 * DLx 转写 — 支持多种正字法/音标方案 (如 IPA, 实用正字法等)
 * DLx Transcription — multiple orthography / phonemic / phonetic systems
 */
interface Transcription {
  [orthographyKey: string]: string;
}

/**
 * AI 生成的元数据，可附加到任意记录
 * AI-generated metadata attached to any record
 */
interface AiMetadata {
  confidence: number;            // 置信度 0–1 | confidence score 0–1
  model?: string;                // 模型标识 | model identifier, e.g. "whisper-large-v3"
  generatedAt?: string;          // 生成时间 ISO-8601 | generation timestamp ISO-8601
  [key: string]: unknown;
}

// ============================================================
//  1. Text — 语料项目容器 (DLx Text)
//     Text — Corpus project container (DLx Text)
// ============================================================

interface TextDocType {
  id: string;
  title: MultiLangString;                   // 多语言标题 | multilingual title
  metadata?: Record<string, unknown>;       // DLx 元数据 | DLx metadata
  languageCode?: string;                    // ISO 639-3 语言代码 | ISO 639-3 language code
  accessRights?: 'open' | 'restricted' | 'confidential';
                                            // 访问权限 (DLx Access Rights) | access rights level
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  2. MediaItem — 媒体资源
//     MediaItem — Media resources
// ============================================================

interface MediaItemDocType {
  id: string;
  textId: string;                           // 所属项目 | parent text -> texts.id
  filename: string;                         // 文件名 | filename
  url?: string;                             // 远程或本地路径 | remote or local path
  duration?: number;                        // 时长（秒）| duration in seconds
  details?: Record<string, unknown>;        // 采样率/编码等 | sample rate, codec, etc.
  isOfflineCached: boolean;                 // 是否已离线缓存 | offline cache status
  createdAt: string;
}

// ============================================================
//  3. Utterance — 句子/话语 (DLx Utterance)
//     Utterance — Speech segment (DLx Utterance)
// ============================================================

interface Word {
  transcription: Transcription;             // 词的转写 | word transcription
  gloss?: MultiLangString;                  // 词义标注 | word-level gloss
  morphemes?: Array<{                       // 语素列表 | morpheme list
    transcription: Transcription;
    gloss?: MultiLangString;
  }>;
  [key: string]: unknown;
}

interface UtteranceDocType {
  id: string;
  textId: string;                           // 所属项目 | parent text -> texts.id
  mediaId?: string;                         // 关联媒体 | linked media -> media_items.id
  transcription: Transcription;             // 多方案转写 | multi-orthography transcription
  translation?: MultiLangString;            // 多语言翻译 | multilingual translation
  words?: Word[];                           // 逐词标注 | word-level annotation
  speaker?: string;                         // 说话人 | speaker identifier
  language?: string;                        // 语言 | language
  startTime: number;                        // 起始时间（秒）| start time in seconds
  endTime: number;                          // 结束时间（秒）| end time in seconds
  notes?: MultiLangString;                  // 备注 | notes
  tags?: Record<string, boolean>;           // 标签 | tags
  ai_metadata?: AiMetadata;                 // AI 元数据 | AI metadata
  aiMode?: 'AUTO' | 'SUGGEST';             // AI 模式 | AI decision mode
  isVerified: boolean;                      // 是否已人工审核 | human verification status
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  4. Lexeme — 词条 (DLx Lexeme 9.0.0)
//     Lexeme — Lexical entry (DLx Lexeme 9.0.0)
// ============================================================

interface Sense {
  gloss: MultiLangString;                   // 释义标签 | gloss label
  definition?: MultiLangString;             // 完整定义 | full definition
  category?: string;                        // 语义类别 | semantic category
  [key: string]: unknown;
}

interface Form {
  transcription: Transcription;             // 词形转写 | form transcription
  [key: string]: unknown;
}

interface LexemeDocType {
  id: string;
  lemma: Transcription;                     // 词头 | lemma / headword
  lexemeType?: string;                      // 词条类型：lexical, grammatical | lexeme type
  morphemeType?: string;                    // 词素类型：stem, prefix, suffix… | morpheme type
  citationForm?: string;                    // 引用形式 | citation form
  senses: Sense[];                          // 义项列表 | sense list
  forms?: Form[];                           // 异体/变体 | allomorphs & variant forms
  language?: string;                        // 语言 | language
  notes?: MultiLangString;                  // 备注 | notes
  tags?: Record<string, boolean>;           // 标签 | tags
  ai_metadata?: AiMetadata;                 // AI 元数据 | AI metadata
  examples?: string[];                      // 关联语料 ID | linked utterance IDs
  usageCount?: number;                      // 出现频次 | usage frequency count
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  5. Annotation — 非语言学标注 (DLx Annotation)
//     Annotation — Non-linguistic annotation (DLx Annotation)
// ============================================================

interface AnnotationDocType {
  id: string;
  textId: string;                           // 所属项目 | parent text
  annotationType: 'timespan' | 'timestamp'; // 标注类型 | annotation type
  startTime?: number;                       // 起始时间 | start time (timespan)
  endTime?: number;                         // 结束时间 | end time (timespan)
  ts?: number;                              // 时间点 | point-in-time (timestamp)
  tags?: Record<string, boolean>;           // 标签 | tags
  notes?: MultiLangString;                  // 备注 | notes
  linkedEntityId?: string;                  // 关联实体 ID | linked utterance or lexeme ID
  createdAt: string;
}

// ============================================================
//  6. CorpusLexiconLink — 语料↔词典交叉引用
//     CorpusLexiconLink — Corpus ↔ Lexicon cross-reference
// ============================================================

interface CorpusLexiconLinkDocType {
  id: string;
  utteranceId: string;                      // 关联语料 | linked utterance
  lexemeId: string;                         // 关联词条 | linked lexeme
  wordIndex?: number;                       // 词在句中的位置 | word position in utterance
  confidence?: number;                      // 匹配置信度 | match confidence 0–1
  createdAt: string;
}

// ============================================================
//  7. Language — 语言档案 (DLx Language)
//     Language — Language profile (DLx Language)
// ============================================================

interface LanguageDocType {
  id: string;                                // ISO 639-3 代码 | ISO 639-3 code
  name: MultiLangString;                     // 语言名称 | language name(s)
  autonym?: string;                          // 自称名 | autonym (endonym)
  glottocode?: string;                       // Glottolog 代码 | Glottolog code
  family?: string;                           // 语系 | language family
  endangermentLevel?: 'safe' | 'vulnerable' | 'definitely_endangered' | 'severely_endangered' | 'critically_endangered' | 'extinct';
                                             // 濒危等级 (UNESCO) | endangerment level (UNESCO)
  locationId?: string;                       // 分布区域 | distribution area -> locations.id
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  8. Speaker — 说话人/语言顾问 (DLx Person)
//     Speaker — Speaker / language consultant (DLx Person)
// ============================================================

interface SpeakerDocType {
  id: string;
  name: string;                              // 姓名 | full name
  pseudonym?: string;                        // 化名（隐私保护）| pseudonym (privacy)
  gender?: string;                           // 性别 | gender
  birthYear?: number;                        // 出生年份 | birth year
  languageIds?: string[];                    // 使用的语言 | languages spoken -> languages.id[]
  role?: 'speaker' | 'translator' | 'annotator' | 'researcher';
                                             // 角色 | role in project
  consentStatus?: 'granted' | 'restricted' | 'anonymous';
                                             // 知情同意状态 | informed consent status
  accessRights?: 'open' | 'restricted' | 'confidential';
                                             // 个人信息访问权限 | personal data access rights
  address?: string;                          // 地址 (DLx Address) | address
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  9. Orthography — 正字法/转写方案定义 (DLx Orthography)
//     Orthography — Writing system / transcription scheme (DLx Orthography)
// ============================================================

interface OrthographyDocType {
  id: string;                                // 转写键名 | transcription key, e.g. "IPA", "Mod"
  name: MultiLangString;                     // 方案名称 | scheme display name
  abbreviation?: string;                     // 缩写 | abbreviation
  languageId?: string;                       // 所属语言 | target language -> languages.id
  type?: 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other';
                                             // 方案类型 | orthography type
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
}

// ============================================================
//  10. Location — 地理位置 (田野调查点/语言分布区)
//      Location — Geographic location (field site / language area)
// ============================================================

interface LocationDocType {
  id: string;
  name: MultiLangString;                     // 地名 | place name
  latitude?: number;                         // 纬度 | latitude
  longitude?: number;                        // 经度 | longitude
  region?: string;                           // 行政区划 | administrative region
  country?: string;                          // 国家/地区 | country / territory
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
}

// ============================================================
//  11. BibliographicSource — 文献引用
//      BibliographicSource — Bibliographic reference
// ============================================================

interface BibliographicSourceDocType {
  id: string;
  title: string;                             // 文献标题 | title
  authors?: string[];                        // 作者列表 | author list
  year?: number;                             // 出版年份 | publication year
  publisher?: string;                        // 出版者 | publisher
  doi?: string;                              // DOI 标识 | DOI identifier
  url?: string;                              // 链接 | URL
  citationKey?: string;                      // BibTeX 引用键 | BibTeX citation key
  sourceType?: 'book' | 'article' | 'thesis' | 'fieldnotes' | 'grammar' | 'other';
                                             // 文献类型 | source type
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
}

// ============================================================
//  12. GrammarDoc — 参考语法文档（写作标签页）
//      GrammarDoc — Reference grammar document (Writing tab)
// ============================================================

interface GrammarDocDocType {
  id: string;
  title: string;                             // 文档标题 | document title
  content: string;                           // Markdown 正文 | Markdown body
  parentId?: string;                         // 父章节 ID | parent chapter -> grammar_docs.id
  sortOrder?: number;                        // 排序序号 | display order
  linkedSourceIds?: string[];                // 训练范本 ID | training reference -> bibliographic_sources.id[]
  linkedExampleIds?: string[];               // 引用的语料 ID | cited utterance IDs
  ai_metadata?: AiMetadata;                  // AI 元数据（草稿置信度）| AI metadata
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  13. Abbreviation — 标注缩写定义 (DLx Abbreviation / Leipzig Glossing)
//      Abbreviation — Glossing abbreviation definition
// ============================================================

interface AbbreviationDocType {
  id: string;                                // 缩写标识 (大写) | abbreviation key, e.g. "1SG"
  abbreviation: string;                      // 缩写文本 | abbreviation text, e.g. "1SG"
  name: MultiLangString;                     // 完整名称 | full name, e.g. {"eng": "first person singular"}
  category?: 'person' | 'number' | 'tense' | 'aspect' | 'mood' | 'case' | 'voice' | 'other';
                                             // 语法类别 | grammatical category
  isLeipzigStandard?: boolean;               // 是否为 Leipzig 标准缩写 | is Leipzig standard
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
}

// ============================================================
//  14. Phoneme — 音位库存 (DLx Phoneme)
//      Phoneme — Phonological inventory (DLx Phoneme)
// ============================================================

interface PhonemeDocType {
  id: string;
  languageId: string;                        // 所属语言 | target language -> languages.id
  ipa: string;                               // IPA 符号 | IPA symbol, e.g. "k", "a"
  type: 'consonant' | 'vowel' | 'tone' | 'diphthong' | 'other';
                                             // 音位类型 | phoneme type
  features?: Record<string, string>;         // 区分特征 | distinctive features, e.g. {"place": "velar", "manner": "plosive"}
  allophones?: string[];                     // 变体音 (IPA) | allophones in IPA
  distribution?: string;                     // 分布描述 | distribution description
  examples?: string[];                       // 例词 (lexeme IDs) | example lexeme IDs
  notes?: MultiLangString;                   // 备注 | notes
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  15. TagDefinition — 标签定义（确保全局一致性）
//      TagDefinition — Tag schema definition (global consistency)
// ============================================================

interface TagDefinitionDocType {
  id: string;
  key: string;                               // 标签键名 | tag key, e.g. "creakyVoice"
  name: MultiLangString;                     // 显示名称 | display name
  description?: MultiLangString;             // 描述 | description
  color?: string;                            // 显示颜色 | display color (hex)
  scope?: 'utterance' | 'lexeme' | 'annotation' | 'global';
                                             // 适用范围 | applicable scope
  createdAt: string;
}

// ============================================================
//  JSON Schemas — RxDB 集合验证模式
//  JSON Schemas — RxDB collection validation schemas
// ============================================================

const multiLangStringSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
} as const;

const transcriptionSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
} as const;

const aiMetadataSchema = {
  type: 'object',
  properties: {
    confidence:  { type: 'number', minimum: 0, maximum: 1 },
    model:       { type: 'string' },
    generatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['confidence'],
  additionalProperties: true,
} as const;

// ---- texts | 语料项目 ----

const textSchema: RxJsonSchema<TextDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:           { type: 'string', maxLength: 128 },
    title:        multiLangStringSchema,
    metadata:     { type: 'object', additionalProperties: true },
    languageCode: { type: 'string' },
    accessRights: { type: 'string', enum: ['open', 'restricted', 'confidential'] },
    createdAt:    { type: 'string', format: 'date-time' },
    updatedAt:    { type: 'string', format: 'date-time' },
  },
  required: ['id', 'title', 'createdAt', 'updatedAt'],
  indexes: ['languageCode', 'updatedAt'],
};

// ---- media_items | 媒体资源 ----

const mediaItemSchema: RxJsonSchema<MediaItemDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:              { type: 'string', maxLength: 128 },
    textId:          { type: 'string' },
    filename:        { type: 'string' },
    url:             { type: 'string' },
    duration:        { type: 'number' },
    details:         { type: 'object', additionalProperties: true },
    isOfflineCached: { type: 'boolean' },
    createdAt:       { type: 'string', format: 'date-time' },
  },
  required: ['id', 'textId', 'filename', 'isOfflineCached', 'createdAt'],
  indexes: ['textId'],
};

// ---- utterances | 句子/话语 ----

const utteranceSchema: RxJsonSchema<UtteranceDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:            { type: 'string', maxLength: 128 },
    textId:        { type: 'string' },
    mediaId:       { type: 'string' },
    transcription: transcriptionSchema,
    translation:   multiLangStringSchema,
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          transcription: transcriptionSchema,
          gloss:         multiLangStringSchema,
          morphemes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                transcription: transcriptionSchema,
                gloss:         multiLangStringSchema,
              },
              required: ['transcription'],
            },
          },
        },
        required: ['transcription'],
        additionalProperties: true,
      },
    },
    speaker:     { type: 'string' },
    language:    { type: 'string' },
    startTime:   { type: 'number' },
    endTime:     { type: 'number' },
    notes:       multiLangStringSchema,
    tags:        { type: 'object', additionalProperties: { type: 'boolean' } },
    ai_metadata: aiMetadataSchema,
    aiMode:      { type: 'string', enum: ['AUTO', 'SUGGEST'] },
    isVerified:  { type: 'boolean' },
    createdAt:   { type: 'string', format: 'date-time' },
    updatedAt:   { type: 'string', format: 'date-time' },
  },
  required: ['id', 'textId', 'transcription', 'startTime', 'endTime', 'isVerified', 'createdAt', 'updatedAt'],
  indexes: ['textId', 'language', 'startTime', 'updatedAt'],
};

// ---- lexemes | 词条 ----

const lexemeSchema: RxJsonSchema<LexemeDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:           { type: 'string', maxLength: 128 },
    lemma:        transcriptionSchema,
    lexemeType:   { type: 'string' },
    morphemeType: { type: 'string' },
    citationForm: { type: 'string' },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gloss:      multiLangStringSchema,
          definition: multiLangStringSchema,
          category:   { type: 'string' },
        },
        required: ['gloss'],
        additionalProperties: true,
      },
    },
    forms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          transcription: transcriptionSchema,
        },
        required: ['transcription'],
        additionalProperties: true,
      },
    },
    language:    { type: 'string' },
    notes:       multiLangStringSchema,
    tags:        { type: 'object', additionalProperties: { type: 'boolean' } },
    ai_metadata: aiMetadataSchema,
    examples:    { type: 'array', items: { type: 'string' } },
    usageCount:  { type: 'integer', minimum: 0 },
    createdAt:   { type: 'string', format: 'date-time' },
    updatedAt:   { type: 'string', format: 'date-time' },
  },
  required: ['id', 'lemma', 'senses', 'createdAt', 'updatedAt'],
  indexes: ['language', 'updatedAt'],
};

// ---- annotations | 标注 ----

const annotationSchema: RxJsonSchema<AnnotationDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:             { type: 'string', maxLength: 128 },
    textId:         { type: 'string' },
    annotationType: { type: 'string', enum: ['timespan', 'timestamp'] },
    startTime:      { type: 'number' },
    endTime:        { type: 'number' },
    ts:             { type: 'number' },
    tags:           { type: 'object', additionalProperties: { type: 'boolean' } },
    notes:          multiLangStringSchema,
    linkedEntityId: { type: 'string' },
    createdAt:      { type: 'string', format: 'date-time' },
  },
  required: ['id', 'textId', 'annotationType', 'createdAt'],
  indexes: ['textId'],
};

// ---- corpus_lexicon_links | 语料↔词典交叉引用 ----

const corpusLexiconLinkSchema: RxJsonSchema<CorpusLexiconLinkDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:          { type: 'string', maxLength: 128 },
    utteranceId: { type: 'string' },
    lexemeId:    { type: 'string' },
    wordIndex:   { type: 'integer' },
    confidence:  { type: 'number', minimum: 0, maximum: 1 },
    createdAt:   { type: 'string', format: 'date-time' },
  },
  required: ['id', 'utteranceId', 'lexemeId', 'createdAt'],
  indexes: ['utteranceId', 'lexemeId'],
};

// ---- languages | 语言档案 ----

const languageSchema: RxJsonSchema<LanguageDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:                 { type: 'string', maxLength: 128 },
    name:               multiLangStringSchema,
    autonym:            { type: 'string' },
    glottocode:         { type: 'string' },
    family:             { type: 'string' },
    endangermentLevel:  { type: 'string', enum: ['safe', 'vulnerable', 'definitely_endangered', 'severely_endangered', 'critically_endangered', 'extinct'] },
    locationId:         { type: 'string' },
    notes:              multiLangStringSchema,
    createdAt:          { type: 'string', format: 'date-time' },
    updatedAt:          { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'createdAt', 'updatedAt'],
  indexes: ['family', 'updatedAt'],
};

// ---- speakers | 说话人 ----

const speakerSchema: RxJsonSchema<SpeakerDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:             { type: 'string', maxLength: 128 },
    name:           { type: 'string' },
    pseudonym:      { type: 'string' },
    gender:         { type: 'string' },
    birthYear:      { type: 'integer' },
    languageIds:    { type: 'array', items: { type: 'string' } },
    role:           { type: 'string', enum: ['speaker', 'translator', 'annotator', 'researcher'] },
    consentStatus:  { type: 'string', enum: ['granted', 'restricted', 'anonymous'] },
    accessRights:   { type: 'string', enum: ['open', 'restricted', 'confidential'] },
    address:        { type: 'string' },
    notes:          multiLangStringSchema,
    createdAt:      { type: 'string', format: 'date-time' },
    updatedAt:      { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt'],
};

// ---- orthographies | 正字法方案 ----

const orthographySchema: RxJsonSchema<OrthographyDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:           { type: 'string', maxLength: 128 },
    name:         multiLangStringSchema,
    abbreviation: { type: 'string' },
    languageId:   { type: 'string' },
    type:         { type: 'string', enum: ['phonemic', 'phonetic', 'practical', 'historical', 'other'] },
    notes:        multiLangStringSchema,
    createdAt:    { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'createdAt'],
  indexes: ['languageId'],
};

// ---- locations | 地理位置 ----

const locationSchema: RxJsonSchema<LocationDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:        { type: 'string', maxLength: 128 },
    name:      multiLangStringSchema,
    latitude:  { type: 'number' },
    longitude: { type: 'number' },
    region:    { type: 'string' },
    country:   { type: 'string' },
    notes:     multiLangStringSchema,
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'createdAt'],
  indexes: ['country'],
};

// ---- bibliographic_sources | 文献引用 ----

const bibliographicSourceSchema: RxJsonSchema<BibliographicSourceDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:          { type: 'string', maxLength: 128 },
    title:       { type: 'string' },
    authors:     { type: 'array', items: { type: 'string' } },
    year:        { type: 'integer' },
    publisher:   { type: 'string' },
    doi:         { type: 'string' },
    url:         { type: 'string' },
    citationKey: { type: 'string' },
    sourceType:  { type: 'string', enum: ['book', 'article', 'thesis', 'fieldnotes', 'grammar', 'other'] },
    notes:       multiLangStringSchema,
    createdAt:   { type: 'string', format: 'date-time' },
  },
  required: ['id', 'title', 'createdAt'],
  indexes: ['citationKey'],
};

// ---- grammar_docs | 参考语法文档 ----

const grammarDocSchema: RxJsonSchema<GrammarDocDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:                { type: 'string', maxLength: 128 },
    title:             { type: 'string' },
    content:           { type: 'string' },
    parentId:          { type: 'string' },
    sortOrder:         { type: 'integer' },
    linkedSourceIds:   { type: 'array', items: { type: 'string' } },
    linkedExampleIds:  { type: 'array', items: { type: 'string' } },
    ai_metadata:       aiMetadataSchema,
    createdAt:         { type: 'string', format: 'date-time' },
    updatedAt:         { type: 'string', format: 'date-time' },
  },
  required: ['id', 'title', 'content', 'createdAt', 'updatedAt'],
  indexes: ['parentId', 'updatedAt'],
};

// ---- abbreviations | 标注缩写定义 ----

const abbreviationSchema: RxJsonSchema<AbbreviationDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:                  { type: 'string', maxLength: 128 },
    abbreviation:        { type: 'string' },
    name:                multiLangStringSchema,
    category:            { type: 'string', enum: ['person', 'number', 'tense', 'aspect', 'mood', 'case', 'voice', 'other'] },
    isLeipzigStandard:   { type: 'boolean' },
    notes:               multiLangStringSchema,
    createdAt:           { type: 'string', format: 'date-time' },
  },
  required: ['id', 'abbreviation', 'name', 'createdAt'],
  indexes: ['abbreviation', 'category'],
};

// ---- phonemes | 音位库存 ----

const phonemeSchema: RxJsonSchema<PhonemeDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:           { type: 'string', maxLength: 128 },
    languageId:   { type: 'string' },
    ipa:          { type: 'string' },
    type:         { type: 'string', enum: ['consonant', 'vowel', 'tone', 'diphthong', 'other'] },
    features:     { type: 'object', additionalProperties: { type: 'string' } },
    allophones:   { type: 'array', items: { type: 'string' } },
    distribution: { type: 'string' },
    examples:     { type: 'array', items: { type: 'string' } },
    notes:        multiLangStringSchema,
    createdAt:    { type: 'string', format: 'date-time' },
    updatedAt:    { type: 'string', format: 'date-time' },
  },
  required: ['id', 'languageId', 'ipa', 'type', 'createdAt', 'updatedAt'],
  indexes: ['languageId', 'type'],
};

// ---- tag_definitions | 标签定义 ----

const tagDefinitionSchema: RxJsonSchema<TagDefinitionDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:          { type: 'string', maxLength: 128 },
    key:         { type: 'string' },
    name:        multiLangStringSchema,
    description: multiLangStringSchema,
    color:       { type: 'string' },
    scope:       { type: 'string', enum: ['utterance', 'lexeme', 'annotation', 'global'] },
    createdAt:   { type: 'string', format: 'date-time' },
  },
  required: ['id', 'key', 'name', 'createdAt'],
  indexes: ['key', 'scope'],
};

// ============================================================
//  集合类型与数据库工厂
//  Collection types & database factory
// ============================================================

type JieyuCollections = {
  texts:                  RxCollection<TextDocType>;
  media_items:            RxCollection<MediaItemDocType>;
  utterances:             RxCollection<UtteranceDocType>;
  lexemes:                RxCollection<LexemeDocType>;
  annotations:            RxCollection<AnnotationDocType>;
  corpus_lexicon_links:   RxCollection<CorpusLexiconLinkDocType>;
  languages:              RxCollection<LanguageDocType>;
  speakers:               RxCollection<SpeakerDocType>;
  orthographies:          RxCollection<OrthographyDocType>;
  locations:              RxCollection<LocationDocType>;
  bibliographic_sources:  RxCollection<BibliographicSourceDocType>;
  grammar_docs:           RxCollection<GrammarDocDocType>;
  abbreviations:          RxCollection<AbbreviationDocType>;
  phonemes:               RxCollection<PhonemeDocType>;
  tag_definitions:        RxCollection<TagDefinitionDocType>;
};

type JieyuDatabase = RxDatabase<JieyuCollections>;

let dbPromise: Promise<JieyuDatabase> | null = null;

async function _createDb(): Promise<JieyuDatabase> {
  const db = await createRxDatabase<JieyuCollections>({
    name: 'jieyudb',
    storage: getRxStorageDexie(),
    multiInstance: true,
    ignoreDuplicate: true,
  });

  await db.addCollections({
    texts:                  { schema: textSchema },
    media_items:            { schema: mediaItemSchema },
    utterances:             { schema: utteranceSchema },
    lexemes:                { schema: lexemeSchema },
    annotations:            { schema: annotationSchema },
    corpus_lexicon_links:   { schema: corpusLexiconLinkSchema },
    languages:              { schema: languageSchema },
    speakers:               { schema: speakerSchema },
    orthographies:          { schema: orthographySchema },
    locations:              { schema: locationSchema },
    bibliographic_sources:  { schema: bibliographicSourceSchema },
    grammar_docs:           { schema: grammarDocSchema },
    abbreviations:          { schema: abbreviationSchema },
    phonemes:               { schema: phonemeSchema },
    tag_definitions:        { schema: tagDefinitionSchema },
  });

  return db;
}

/**
 * 获取单例数据库实例
 * Get the singleton database instance
 */
export function getDb(): Promise<JieyuDatabase> {
  if (!dbPromise) {
    dbPromise = _createDb();
  }
  return dbPromise;
}

export type {
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
  AiMetadata,
  MultiLangString,
  Transcription,
};
