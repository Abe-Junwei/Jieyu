/**
 * 把一份合成的旧库快照规划成音频文件和 .jyd。
 * 不读、不写 IndexedDB。一份文稿挂着多条录音时，未经确认不产出文件。
 * 层、词和词素会跟着文稿写进 `.jyd`。项目行、说话人、语言、显示名、别名和正字法进项目库。
 * 文稿引用到的语言、显示名、别名、正字法和说话人另存一份定义副本。语言记录的其余字段还没写。
 * 来源登记进项目库。文稿只记下它引用的来源 id，不复制来源行，也不放进定义副本。
 * 词条进项目库，只记 id、所属项目和词头。文稿里的链接只存词条 id。
 * 音位进项目库，只记 id、所属项目、语言、IPA 和类型，不进定义副本。特征、音位变体和例词还没写。
 * 缩写进项目库，只记 id、所属项目、缩写和可选类别，不进定义副本。多语名称还没写。
 * 标签定义进项目库，只记 id、所属项目、键、可选范围和颜色，不进定义副本。多语名称和说明还没写。
 * 文献来源进项目库，只记 id、所属项目、标题，以及可选的年份、类型、引用键和访问权限，不进定义副本。作者、出版方、DOI、链接和备注还没写。
 * 地点进项目库，只记 id、所属项目，以及可选的纬度、经度、地区和国家，不进定义副本。多语名称和备注还没写。
 * 语法文档进项目库，记 id、所属项目、标题和正文，以及可选的排序、访问权限和同一项目内的父级，不进定义副本。关联来源和例证还没写。
 * 正字法转换进项目库，只记 id、所属项目、两端正字法和转换方式，以及可选的状态和是否可逆，不进定义副本。规则正文、样例和多语名称还没写。
 * 自定义字段进项目库，只记 id、所属项目、类型和排序，以及可选的是否必填、上下限和校验式，不进定义副本。多语名称、说明和选项列表还没写。
 * 语言目录历史进项目库，只记 id、所属项目、语言、动作和摘要，以及可选的原因、原因码、操作者、来源类型和来源引用，不进定义副本。变更字段和修改前后的补丁还没写。
 * 语言记录的标量字段进项目库，不进定义副本。数组、行政区划、多语备注和自定义字段值还没写。
 * 词条另记种类、使用次数和访问权限。词条附件只记种类、媒体类型、显示名、字节数和引用次数，不写二进制。附件链接两端都在留下的行里才保留。DMLex 正文还没写。
 * 结构规则进项目库，只记 id、项目、范围、是否启用和优先级，以及可选的语言和来源模板。规则正文还没写。
 * 项目 AI 进项目库：会话、消息、任务、任务快照、项目记忆、产物、来源集和会话记忆。会话记忆载荷是 JSON 对象（ADR-0066），不进定义副本。`model_runs` 按 ADR-0057 第 8 条进项目库，能力只收 `transcribe`。
 * 锚点跟着录音进对应的 `.jyd`，不进项目库，也不进定义副本。
 * 层内容跟着语段进 `.jyd`，只记 id、语段、角色和文本。
 * 两端都在同一份文稿里的单元关系写进该 `.jyd`。跨文稿的不存。
 * 指语段、词、词素的备注随那份文稿。指语言、说话人、正字法、词条或项目行的备注进项目库。
 * 两端层都在同一份文稿里的层链接写进该 `.jyd`。拆开后不在同一份文件里的不存。
 * 轨道跟着录音进对应的 `.jyd`。车道锁定表还没写。
 * 层标注跟着所在的层进 `.jyd`，只记 id、层、文本、是否已核和可选起止时间。同一层出现在多份文稿时不复制。
 * 层对不上的语段、词和词素记入丢弃，不进文稿。显示名和别名带项目 id，别的项目即使语言号相同也不进。
 * 没有语段引用的音频也写出，看板上是录音卡片（ADR-0061 第 3 条）。
 * 拆分时没有 mediaId 的语段跟着父语段走；自己和上级都没有音频的纯文本语段不进任何一份，确认前就列在待确认清单里，连同会断开的父子链接。mediaId 一律去掉首尾空白再比较。
 * 文稿引用了库里没有的音频 id 时照写，记进 `missingAudios`。
 * 文稿引用的来源挂在别的录音上、哪份文稿都不进时，记进 `droppedSourceRefs`。
 * 同一个锚点、轨道或层链接进了几份 `.jyd` 时，第一份保留原 id，其余换成 `原id--文稿id`，对照记进 `copiedIds`，语段上的锚点引用跟着换。
 * 文件名由标题或原文件名清成一段安全文件名。音频和 `.jyd` 共用一个命名空间，忽略大小写和组合方式去重；音频不占用 `project.sqlite`、隐藏目录、`.jyd` 和 SQLite 日志的名字。
 */
import { createHash } from 'node:crypto';
import { HIDDEN_DIRECTORY } from './fileOps.ts';
import { audioIdOf, unitAudioIds } from './manuscriptAudio.ts';
import { crossManuscriptParentLinks } from './manuscriptParents.ts';

export interface LegacyDocument {
  id: string;
  name: string;
  sourceIds?: readonly string[];
}

export interface LegacyLayer {
  id: string;
  documentId: string;
  key?: string;
  languageId?: string;
  orthographyId?: string;
}

export interface LegacyUnit {
  id: string;
  layerId: string;
  mediaId?: string;
  parentUnitId?: string;
  speakerId?: string;
  startAnchorId?: string;
  endAnchorId?: string;
}

export interface LegacyAnchor {
  id: string;
  mediaId: string;
  time: number;
}

export type LegacyContentRole = 'primary_text' | 'translation' | 'gloss' | 'note' | 'audio_ref';

export interface LegacyUnitContent {
  id: string;
  unitId: string;
  role: LegacyContentRole;
  text: string;
}

export type LegacyRelationType =
  'aligned_to' | 'derived_from' | 'linked_reference' | 'analysis_graph_candidate';

export interface LegacyUnitRelation {
  id: string;
  sourceUnitId: string;
  targetUnitId: string;
  relationType: LegacyRelationType;
}

export interface DroppedUnitRelation {
  id: string;
  sourceUnitId: string;
  targetUnitId: string;
  reason: 'missing-target' | 'cross-manuscript';
}

export type LegacyNoteTarget =
  'unit' | 'token' | 'morpheme' | 'language' | 'speaker' | 'orthography' | 'lexeme' | 'text';

export type LegacyLayerLinkType = 'direct' | 'free' | 'literal' | 'pedagogical';

export interface LegacyLayerLink {
  id: string;
  hostLayerId: string;
  layerId: string;
  linkType: LegacyLayerLinkType;
  isPreferred: boolean;
}

export type LegacyTrackMode = 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed';

export interface LegacyTrack {
  id: string;
  mediaId: string;
  mode: LegacyTrackMode;
}

export interface LegacyAnnotation {
  id: string;
  tierId: string;
  value: string;
  isVerified: boolean;
  startTime?: number;
  endTime?: number;
}

export interface DroppedAnnotation {
  id: string;
  tierId: string;
  reason: 'missing-target' | 'shared-layer';
}

export interface DroppedLayerLink {
  id: string;
  hostLayerId: string;
  layerId: string;
  reason: 'missing-target' | 'cross-manuscript';
}

export interface LegacyNote {
  id: string;
  textId: string;
  targetType: LegacyNoteTarget;
  targetId: string;
  text: string;
}

export interface PlannedNote {
  id: string;
  targetType: LegacyNoteTarget;
  targetId: string;
  text: string;
}

export interface LegacyToken {
  id: string;
  unitId: string;
  tokenIndex: number;
  form: string;
}

export interface LegacyMorpheme {
  id: string;
  unitId: string;
  tokenId: string;
  morphemeIndex: number;
  form: string;
}

export interface LegacyProject {
  id: string;
  name: string;
}

export interface LegacySpeaker {
  id: string;
  textId: string;
  name: string;
}

export interface LegacyLanguage {
  id: string;
  textId: string;
  name: string;
  languageCode?: string;
  canonicalTag?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6393?: string;
  autonym?: string;
  glottocode?: string;
  wikidataId?: string;
  scope?: string;
  macrolanguage?: string;
  genus?: string;
  subfamily?: string;
  branch?: string;
  classificationPath?: string;
  modality?: string;
  languageType?: string;
  endangermentLevel?: string;
  aesStatus?: string;
  endangermentSource?: string;
  endangermentAssessmentYear?: number;
  speakerCountL1?: number;
  speakerCountL2?: number;
  speakerCountSource?: string;
  speakerCountYear?: number;
  speakerTrend?: string;
  macroarea?: string;
  intergenerationalTransmission?: string;
  officialStatus?: string;
  egids?: string;
  documentationLevel?: string;
  literacyRate?: number;
  latitude?: number;
  longitude?: number;
  locationId?: string;
  sourceType?: string;
  reviewStatus?: string;
  visibility?: string;
}

export interface LegacyLanguageDisplayName {
  id: string;
  textId: string;
  languageId: string;
  locale: string;
  value: string;
}

export interface LegacyLanguageAlias {
  id: string;
  textId: string;
  languageId: string;
  alias: string;
}

export interface LegacyOrthography {
  id: string;
  textId: string;
  name: string;
  languageId?: string;
}

export type LegacyOrthographyBridgeEngine = 'table-map' | 'icu-rule' | 'manual';

export type LegacyCatalogHistoryAction = 'create' | 'update' | 'delete';

export interface LegacyCatalogHistory {
  id: string;
  textId: string;
  languageId: string;
  action: LegacyCatalogHistoryAction;
  summary: string;
  reason?: string;
  reasonCode?: string;
  actorId?: string;
  actorType?: 'human' | 'ai' | 'system' | 'importer';
  sourceType?: 'built-in-generated' | 'built-in-reviewed' | 'user-override' | 'user-custom';
  sourceRef?: string;
}

export type LegacyCustomFieldType =
  'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'url';

export interface LegacyCustomField {
  id: string;
  textId: string;
  fieldType: LegacyCustomFieldType;
  sortOrder: number;
  required?: boolean;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
}

export interface LegacyOrthographyBridge {
  id: string;
  textId: string;
  sourceOrthographyId: string;
  targetOrthographyId: string;
  engine: LegacyOrthographyBridgeEngine;
  status?: 'draft' | 'active' | 'deprecated';
  isReversible?: boolean;
}

export interface LegacySourceRecord {
  id: string;
  textId: string;
  originalName: string;
  displayName: string;
  format: string;
  mediaId?: string;
}

export interface LegacyLexeme {
  id: string;
  textId: string;
  headword: string;
  kind?: 'entry' | 'resource';
  usageCount?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
}

export type LegacyLexemeAssetKind = 'image' | 'audio' | 'document';

export interface LegacyLexemeAsset {
  id: string;
  textId: string;
  kind: LegacyLexemeAssetKind;
  mimeType: string;
  displayName: string;
  languageCode?: string;
  byteSize: number;
  refCount: number;
  blobExportOmitted?: boolean;
}

export interface LegacyLexemeAssetLink {
  id: string;
  textId: string;
  lexemeId: string;
  assetId: string;
}

export interface LegacyStructuralRule {
  id: string;
  projectId: string;
  scope: 'language' | 'project';
  languageId?: string;
  derivedFromSystemId?: string;
  enabled: boolean;
  priority: number;
}

export interface LegacyAiConversation {
  id: string;
  textId?: string;
  title: string;
  mode: 'assistant' | 'analysis' | 'review';
  providerId: string;
  model: string;
  archived?: boolean;
  clearedAt?: string;
}

export interface LegacyAiMessage {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  status: 'streaming' | 'done' | 'error' | 'aborted';
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  errorMessage?: string;
}

export interface LegacyAiTask {
  id: string;
  taskType: 'transcribe' | 'gloss' | 'translate' | 'embed' | 'detect_language' | 'agent_loop';
  status: 'pending' | 'running' | 'done' | 'failed';
  targetId: string;
  targetType?: string;
  modelId?: string;
  errorMessage?: string;
  attempt?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  resumable?: boolean;
  handoffReason?: string;
  agentRunId?: string;
}

export interface LegacyAiTaskSnapshot {
  id: string;
  taskId: string;
  taskType: LegacyAiTask['taskType'];
  status: LegacyAiTask['status'];
  targetId: string;
  targetType?: string;
  modelId?: string;
  hasError: boolean;
  isTerminal: boolean;
  durationMs: number;
  attempt?: number;
  maxAttempts?: number;
  resumable?: boolean;
  handoffReason?: string;
}

export interface LegacyProjectMemory {
  id: string;
  projectId: string;
  fact: string;
  confidence: number;
  sourceConversationId?: string;
  expiresAt?: string;
}

export interface LegacyAgentArtifact {
  id: string;
  schemaVersion: 0;
  kind: 'source_set_snapshot' | 'workflow_output' | 'export_manifest';
  uri: string;
  title: string;
  mimeType: string;
  bodyJson: string;
  agentRunId?: string;
  adoptionItemId?: string;
}

export interface LegacyAiSourceSet {
  id: string;
  projectId: string;
  name: string;
  scope: 'current_segment' | 'selection' | 'current_media' | 'project';
  status: 'active' | 'inactive' | 'invalidated';
  mediaId?: string;
  layerId?: string;
  boundSessionId?: string;
}

/** 旧快照里的会话记忆。载荷先不假定是对象，不合的行在规划时丢掉。 */
export interface LegacyAiSessionMemoryInput {
  id: string;
  conversationId: string;
  payload: unknown;
  updatedAt?: string;
}

/** 载荷在数据层是不透明对象。列形状见 ADR-0066。 */
export interface LegacyAiSessionMemory {
  id: string;
  conversationId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

/** 旧快照里的一次模型运行。能力不是 `transcribe` 的行不写。 */
export interface LegacyModelRunInput {
  id: string;
  textId: string;
  modelId?: string;
  modelVersion?: string;
  manifestSha256?: string;
  capability?: string;
  params?: unknown;
  mediaId?: string;
  rangeStart?: number;
  rangeEnd?: number;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
  errorCode?: string;
  chunkCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  pendingCount?: number;
}

/** 字段照 ADR-0057 第 8 条，不另加列。 */
export interface LegacyModelRun {
  id: string;
  textId: string;
  modelId: string;
  modelVersion: string;
  manifestSha256: string;
  capability: 'transcribe';
  params: Record<string, unknown>;
  mediaId: string;
  rangeStart: number;
  rangeEnd: number;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  errorCode?: string;
  chunkCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
}

export type LegacyPhonemeType = 'consonant' | 'vowel' | 'tone' | 'diphthong' | 'other';

export type LegacyAbbreviationCategory =
  'person' | 'number' | 'tense' | 'aspect' | 'mood' | 'case' | 'voice' | 'other';

export interface LegacyAbbreviation {
  id: string;
  textId: string;
  abbreviation: string;
  category?: LegacyAbbreviationCategory;
}

export interface LegacyGrammarDoc {
  id: string;
  textId: string;
  title: string;
  content: string;
  parentId?: string;
  sortOrder?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
}

export interface LegacyLocation {
  id: string;
  textId: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  country?: string;
}

export interface LegacyBibliographicSource {
  id: string;
  textId: string;
  title: string;
  year?: number;
  sourceType?: 'book' | 'article' | 'thesis' | 'fieldnotes' | 'grammar' | 'other';
  citationKey?: string;
  accessRights?: 'open' | 'restricted' | 'confidential';
}

export type LegacyTagScope = 'unit' | 'lexeme' | 'annotation' | 'global';

export interface LegacyTagDefinition {
  id: string;
  textId: string;
  key: string;
  scope?: LegacyTagScope;
  color?: string;
}

export interface LegacyPhoneme {
  id: string;
  textId: string;
  languageId: string;
  ipa: string;
  type: LegacyPhonemeType;
}

export interface LegacyLexemeLink {
  id: string;
  targetType: 'token' | 'morpheme';
  targetId: string;
  lexemeId: string;
}

export interface LegacyAudio {
  id: string;
  filename: string;
  bytes: Uint8Array;
}

export interface LegacyLibrary {
  documents: readonly LegacyDocument[];
  layers: readonly LegacyLayer[];
  units: readonly LegacyUnit[];
  audios: readonly LegacyAudio[];
  tokens?: readonly LegacyToken[];
  morphemes?: readonly LegacyMorpheme[];
  project?: LegacyProject;
  speakers?: readonly LegacySpeaker[];
  languages?: readonly LegacyLanguage[];
  displayNames?: readonly LegacyLanguageDisplayName[];
  aliases?: readonly LegacyLanguageAlias[];
  orthographies?: readonly LegacyOrthography[];
  sourceRecords?: readonly LegacySourceRecord[];
  lexemes?: readonly LegacyLexeme[];
  phonemes?: readonly LegacyPhoneme[];
  abbreviations?: readonly LegacyAbbreviation[];
  tagDefinitions?: readonly LegacyTagDefinition[];
  bibliographicSources?: readonly LegacyBibliographicSource[];
  locations?: readonly LegacyLocation[];
  grammarDocs?: readonly LegacyGrammarDoc[];
  orthographyBridges?: readonly LegacyOrthographyBridge[];
  customFields?: readonly LegacyCustomField[];
  catalogHistory?: readonly LegacyCatalogHistory[];
  lexemeAssets?: readonly LegacyLexemeAsset[];
  lexemeAssetLinks?: readonly LegacyLexemeAssetLink[];
  structuralRules?: readonly LegacyStructuralRule[];
  conversations?: readonly LegacyAiConversation[];
  aiMessages?: readonly LegacyAiMessage[];
  aiTasks?: readonly LegacyAiTask[];
  aiTaskSnapshots?: readonly LegacyAiTaskSnapshot[];
  projectMemories?: readonly LegacyProjectMemory[];
  agentArtifacts?: readonly LegacyAgentArtifact[];
  aiSourceSets?: readonly LegacyAiSourceSet[];
  sessionMemories?: readonly LegacyAiSessionMemoryInput[];
  modelRuns?: readonly LegacyModelRunInput[];
  lexemeLinks?: readonly LegacyLexemeLink[];
  anchors?: readonly LegacyAnchor[];
  contents?: readonly LegacyUnitContent[];
  relations?: readonly LegacyUnitRelation[];
  notes?: readonly LegacyNote[];
  layerLinks?: readonly LegacyLayerLink[];
  tracks?: readonly LegacyTrack[];
  annotations?: readonly LegacyAnnotation[];
}

export interface PlannedAudio {
  audioId: string;
  fileName: string;
  sha256: string;
  bytes: Uint8Array;
}

export interface PlannedLayer {
  id: string;
  key: string;
  languageId?: string;
  orthographyId?: string;
}

export interface PlannedUnit {
  id: string;
  layerId: string;
  mediaId?: string;
  parentUnitId?: string;
  speakerId?: string;
  startAnchorId?: string;
  endAnchorId?: string;
}

export interface PlannedAnchor {
  id: string;
  mediaId: string;
  time: number;
}

export interface PlannedDefinitions {
  languages: { id: string; name: string }[];
  displayNames: { id: string; languageId: string; locale: string; value: string }[];
  aliases: { id: string; languageId: string; alias: string }[];
  orthographies: { id: string; name: string; languageId?: string }[];
  speakers: { id: string; name: string }[];
}

export interface PlannedMissingDefinition {
  kind: 'language' | 'orthography' | 'speaker';
  id: string;
}

export interface PlannedToken {
  id: string;
  unitId: string;
  tokenIndex: number;
  form: string;
}

export interface PlannedMorpheme {
  id: string;
  unitId: string;
  tokenId: string;
  morphemeIndex: number;
  form: string;
}

export interface PlannedLexemeLink {
  id: string;
  targetType: 'token' | 'morpheme';
  targetId: string;
  lexemeId: string;
}

export interface DroppedLexemeLink {
  id: string;
  targetId: string;
  lexemeId: string;
  reason: 'missing-lexeme' | 'missing-target';
}

export interface PlannedManuscript {
  id: string;
  sourceDocumentId: string;
  fileName: string;
  audioId: string | null;
  layers: PlannedLayer[];
  units: PlannedUnit[];
  tokens: PlannedToken[];
  morphemes: PlannedMorpheme[];
  definitions: PlannedDefinitions;
  missingDefinitions: PlannedMissingDefinition[];
  sourceIds: string[];
  missingSourceIds: string[];
  lexemeLinks: PlannedLexemeLink[];
  anchors: PlannedAnchor[];
  missingAnchors: { unitId: string; anchorId: string }[];
  contents: LegacyUnitContent[];
  relations: LegacyUnitRelation[];
  notes: PlannedNote[];
  layerLinks: LegacyLayerLink[];
  tracks: LegacyTrack[];
  annotations: LegacyAnnotation[];
}

export interface DroppedLink {
  unitId: string;
  parentUnitId: string;
}

export type LegacyMigrationPlan =
  | {
      status: 'ready';
      audios: PlannedAudio[];
      manuscripts: PlannedManuscript[];
      droppedLinks: DroppedLink[];
      droppedUnits: {
        id: string;
        layerId: string;
        reason: 'missing-layer' | 'no-audio-in-split';
      }[];
      /** 文稿引用了库里没有的音频 id。文稿照写，卡片会显示音频不见了。 */
      missingAudios: { manuscriptId: string; audioId: string }[];
      droppedTokens: { id: string; unitId: string }[];
      droppedMorphemes: { id: string; tokenId: string }[];
      project: LegacyProject | null;
      speakers: { id: string; textId: string; name: string }[];
      droppedSpeakers: { id: string; textId: string }[];
      languages: LegacyLanguage[];
      displayNames: LegacyLanguageDisplayName[];
      aliases: LegacyLanguageAlias[];
      orthographies: LegacyOrthography[];
      sourceRecords: LegacySourceRecord[];
      droppedSourceRecords: { id: string; textId: string }[];
      lexemes: LegacyLexeme[];
      droppedLexemes: { id: string; textId: string }[];
      phonemes: LegacyPhoneme[];
      droppedPhonemes: { id: string; textId: string }[];
      abbreviations: LegacyAbbreviation[];
      droppedAbbreviations: { id: string; textId: string }[];
      tagDefinitions: LegacyTagDefinition[];
      droppedTagDefinitions: { id: string; textId: string }[];
      bibliographicSources: LegacyBibliographicSource[];
      droppedBibliographicSources: { id: string; textId: string }[];
      locations: LegacyLocation[];
      droppedLocations: { id: string; textId: string }[];
      grammarDocs: LegacyGrammarDoc[];
      droppedGrammarDocs: { id: string; textId: string }[];
      droppedGrammarParents: { id: string; parentId: string }[];
      orthographyBridges: LegacyOrthographyBridge[];
      droppedOrthographyBridges: { id: string; textId: string }[];
      customFields: LegacyCustomField[];
      droppedCustomFields: { id: string; textId: string }[];
      catalogHistory: LegacyCatalogHistory[];
      droppedCatalogHistory: { id: string; textId: string }[];
      lexemeAssets: LegacyLexemeAsset[];
      droppedLexemeAssets: { id: string; textId: string }[];
      lexemeAssetLinks: LegacyLexemeAssetLink[];
      droppedLexemeAssetLinks: {
        id: string;
        textId?: string;
        lexemeId?: string;
        assetId?: string;
        reason: 'wrong-project' | 'missing-target';
      }[];
      structuralRules: LegacyStructuralRule[];
      droppedStructuralRules: { id: string; projectId: string }[];
      conversations: LegacyAiConversation[];
      droppedConversations: { id: string; textId: string }[];
      aiMessages: LegacyAiMessage[];
      droppedAiMessages: { id: string; conversationId: string }[];
      aiTasks: LegacyAiTask[];
      aiTaskSnapshots: LegacyAiTaskSnapshot[];
      droppedAiTaskSnapshots: { id: string; taskId: string }[];
      projectMemories: LegacyProjectMemory[];
      droppedProjectMemories: { id: string; projectId: string }[];
      agentArtifacts: LegacyAgentArtifact[];
      aiSourceSets: LegacyAiSourceSet[];
      droppedAiSourceSets: { id: string; projectId: string }[];
      sessionMemories: LegacyAiSessionMemory[];
      droppedSessionMemories: {
        id: string;
        reason: 'missing-conversation' | 'id-mismatch' | 'payload' | 'updated-at';
      }[];
      modelRuns: LegacyModelRun[];
      droppedModelRuns: { id: string; reason: 'wrong-project' | 'shape' }[];
      droppedLexemeLinks: DroppedLexemeLink[];
      droppedAnchors: { id: string; mediaId: string }[];
      droppedContents: { id: string; unitId: string }[];
      droppedRelations: DroppedUnitRelation[];
      notes: PlannedNote[];
      droppedNotes: { id: string; textId: string }[];
      droppedNoteTargets: { id: string; targetType: LegacyNoteTarget; targetId: string }[];
      droppedLayerLinks: DroppedLayerLink[];
      droppedTracks: { id: string; mediaId: string }[];
      droppedAnnotations: DroppedAnnotation[];
      droppedSourceRefs: DroppedSourceRef[];
      copiedIds: CopiedId[];
      droppedDefinitions: {
        kind: 'language' | 'orthography' | 'display-name' | 'alias';
        id: string;
        ref: string;
      }[];
    }
  | { status: 'needs-confirm'; documents: PendingSplit[] }
  | { status: 'rejected'; reason: 'cross-manuscript-parent'; links: DroppedLink[] }
  | { status: 'rejected'; reason: 'speakers-without-project' }
  | { status: 'rejected'; reason: 'definitions-without-project' }
  | { status: 'rejected'; reason: 'sources-without-project' }
  | { status: 'rejected'; reason: 'lexemes-without-project' }
  | { status: 'rejected'; reason: 'phonemes-without-project' }
  | { status: 'rejected'; reason: 'abbreviations-without-project' }
  | { status: 'rejected'; reason: 'tags-without-project' }
  | { status: 'rejected'; reason: 'bibliography-without-project' }
  | { status: 'rejected'; reason: 'locations-without-project' }
  | { status: 'rejected'; reason: 'grammar-without-project' }
  | { status: 'rejected'; reason: 'bridges-without-project' }
  | { status: 'rejected'; reason: 'custom-fields-without-project' }
  | { status: 'rejected'; reason: 'catalog-history-without-project' }
  | { status: 'rejected'; reason: 'lexeme-assets-without-project' }
  | { status: 'rejected'; reason: 'lexeme-asset-links-without-project' }
  | { status: 'rejected'; reason: 'structural-rules-without-project' }
  | { status: 'rejected'; reason: 'ai-without-project' }
  | { status: 'rejected'; reason: 'model-runs-without-project' }
  | { status: 'rejected'; reason: 'notes-without-project' };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function baseName(filename: string): string {
  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] ?? filename;
}

const PROJECT_FILE = 'project.sqlite';
/** 留出 ` (n)` 的位置，整个文件名不超过常见文件系统的 255 字节。 */
const MAX_NAME_BYTES = 240;
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/gu;
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
const SQLITE_SIDE_FILE = /-(journal|wal|shm)$/u;

/** 同名比较忽略大小写和 Unicode 组合方式，对齐 APFS、NTFS 的默认行为。 */
function fileNameKey(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase();
}

function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out;
}

/** 标题或原文件名变成项目文件夹里的一段文件名：不带目录，不是 `.`/`..`，Windows 也能建。 */
function safeFileName(raw: string, fallback: string): string {
  let name = raw
    .normalize('NFC')
    .replace(UNSAFE_NAME_CHARS, '_')
    .replace(/^[. ]+|[. ]+$/gu, '');
  if (name.length === 0) name = fallback;
  const head = name.split('.')[0] ?? name;
  if (WINDOWS_DEVICE_NAME.test(head.trimEnd())) name = `${head}_${name.slice(head.length)}`;
  const { stem, ext } = splitExtension(name);
  const extBytes = new TextEncoder().encode(ext).length;
  if (extBytes >= MAX_NAME_BYTES) return truncateUtf8(name, MAX_NAME_BYTES);
  const kept = truncateUtf8(stem, MAX_NAME_BYTES - extBytes).replace(/[. ]+$/u, '');
  return `${kept.length > 0 ? kept : fallback}${ext}`;
}

function manuscriptFileName(documentName: string): string {
  return `${safeFileName(documentName, 'untitled')}.jyd`;
}

/** 音频不能占用项目库、隐藏目录、`.jyd` 和 SQLite 日志的名字。 */
function audioFileName(filename: string): string {
  const name = safeFileName(baseName(filename), 'audio');
  const key = fileNameKey(name);
  const reserved =
    key === PROJECT_FILE ||
    key === fileNameKey(HIDDEN_DIRECTORY) ||
    fileNameKey(splitExtension(name).ext) === '.jyd' ||
    SQLITE_SIDE_FILE.test(key);
  return reserved ? `${name}_` : name;
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(fileNameKey(name))) {
    used.add(fileNameKey(name));
    return name;
  }
  const { stem, ext } = splitExtension(name);
  let n = 2;
  let next = `${stem} (${n})${ext}`;
  while (used.has(fileNameKey(next))) {
    n += 1;
    next = `${stem} (${n})${ext}`;
  }
  used.add(fileNameKey(next));
  return next;
}

function plannedSegmentation(
  tokens: readonly LegacyToken[],
  morphemes: readonly LegacyMorpheme[],
  unitIds: ReadonlySet<string>,
): {
  tokens: PlannedToken[];
  morphemes: PlannedMorpheme[];
  droppedMorphemes: { id: string; tokenId: string }[];
} {
  const keptTokens = tokens
    .filter((token) => unitIds.has(token.unitId))
    .map((token) => ({
      id: token.id,
      unitId: token.unitId,
      tokenIndex: token.tokenIndex,
      form: token.form,
    }));
  const tokenIds = new Set(keptTokens.map((token) => token.id));
  const keptMorphemes: PlannedMorpheme[] = [];
  const droppedMorphemes: { id: string; tokenId: string }[] = [];
  for (const morpheme of morphemes) {
    if (!unitIds.has(morpheme.unitId)) continue;
    if (!tokenIds.has(morpheme.tokenId)) {
      droppedMorphemes.push({ id: morpheme.id, tokenId: morpheme.tokenId });
      continue;
    }
    keptMorphemes.push({
      id: morpheme.id,
      unitId: morpheme.unitId,
      tokenId: morpheme.tokenId,
      morphemeIndex: morpheme.morphemeIndex,
      form: morpheme.form,
    });
  }
  return { tokens: keptTokens, morphemes: keptMorphemes, droppedMorphemes };
}

function plannedUnit(
  unit: LegacyUnit,
  parentUnitId: string | undefined,
  anchors: { startAnchorId?: string; endAnchorId?: string },
): PlannedUnit {
  return {
    id: unit.id,
    layerId: unit.layerId,
    ...(audioIdOf(unit.mediaId) !== null ? { mediaId: audioIdOf(unit.mediaId) as string } : {}),
    ...(parentUnitId !== undefined ? { parentUnitId } : {}),
    ...(unit.speakerId !== undefined ? { speakerId: unit.speakerId } : {}),
    ...(anchors.startAnchorId !== undefined ? { startAnchorId: anchors.startAnchorId } : {}),
    ...(anchors.endAnchorId !== undefined ? { endAnchorId: anchors.endAnchorId } : {}),
  };
}

function assignUnitRelations(
  relations: readonly LegacyUnitRelation[],
  manuscripts: readonly PlannedManuscript[],
): DroppedUnitRelation[] {
  const manuscriptOf = new Map<string, PlannedManuscript>();
  for (const manuscript of manuscripts) {
    for (const unit of manuscript.units) manuscriptOf.set(unit.id, manuscript);
  }
  const dropped: DroppedUnitRelation[] = [];
  for (const relation of relations) {
    const source = manuscriptOf.get(relation.sourceUnitId);
    const target = manuscriptOf.get(relation.targetUnitId);
    const droppedRelation = {
      id: relation.id,
      sourceUnitId: relation.sourceUnitId,
      targetUnitId: relation.targetUnitId,
    };
    if (source === undefined || target === undefined) {
      dropped.push({ ...droppedRelation, reason: 'missing-target' });
      continue;
    }
    if (source !== target) {
      dropped.push({ ...droppedRelation, reason: 'cross-manuscript' });
      continue;
    }
    source.relations.push({
      id: relation.id,
      sourceUnitId: relation.sourceUnitId,
      targetUnitId: relation.targetUnitId,
      relationType: relation.relationType,
    });
  }
  return dropped;
}

function assignAnnotations(
  annotations: readonly LegacyAnnotation[],
  manuscripts: readonly PlannedManuscript[],
): DroppedAnnotation[] {
  const dropped: DroppedAnnotation[] = [];
  for (const annotation of annotations) {
    const homes = manuscripts.filter((manuscript) =>
      manuscript.layers.some((layer) => layer.id === annotation.tierId),
    );
    if (homes.length === 1) {
      for (const home of homes) home.annotations.push(annotation);
      continue;
    }
    dropped.push({
      id: annotation.id,
      tierId: annotation.tierId,
      reason: homes.length === 0 ? 'missing-target' : 'shared-layer',
    });
  }
  return dropped;
}

function assignTracks(
  tracks: readonly LegacyTrack[],
  manuscripts: readonly PlannedManuscript[],
): { id: string; mediaId: string }[] {
  const dropped: { id: string; mediaId: string }[] = [];
  for (const track of tracks) {
    const homes = manuscripts.filter(
      (manuscript) =>
        manuscript.audioId !== null && manuscript.audioId === audioIdOf(track.mediaId),
    );
    if (homes.length === 0) {
      dropped.push({ id: track.id, mediaId: track.mediaId });
      continue;
    }
    for (const home of homes) home.tracks.push(track);
  }
  return dropped;
}

function assignLayerLinks(
  links: readonly LegacyLayerLink[],
  manuscripts: readonly PlannedManuscript[],
): DroppedLayerLink[] {
  const dropped: DroppedLayerLink[] = [];
  for (const link of links) {
    const homes = manuscripts.filter(
      (manuscript) =>
        manuscript.layers.some((layer) => layer.id === link.hostLayerId) &&
        manuscript.layers.some((layer) => layer.id === link.layerId),
    );
    if (homes.length > 0) {
      for (const home of homes) home.layerLinks.push(link);
      continue;
    }
    const hostSeen = manuscripts.some((manuscript) =>
      manuscript.layers.some((layer) => layer.id === link.hostLayerId),
    );
    const layerSeen = manuscripts.some((manuscript) =>
      manuscript.layers.some((layer) => layer.id === link.layerId),
    );
    dropped.push({
      id: link.id,
      hostLayerId: link.hostLayerId,
      layerId: link.layerId,
      reason: hostSeen && layerSeen ? 'cross-manuscript' : 'missing-target',
    });
  }
  return dropped;
}

function assignNotes(
  notes: readonly LegacyNote[],
  manuscripts: readonly PlannedManuscript[],
  projectId: string | undefined,
  ids: {
    languages: ReadonlySet<string>;
    speakers: ReadonlySet<string>;
    orthographies: ReadonlySet<string>;
    lexemes: ReadonlySet<string>;
  },
): {
  projectNotes: PlannedNote[];
  droppedTargets: { id: string; targetType: LegacyNoteTarget; targetId: string }[];
} {
  const manuscriptOfUnit = new Map<string, PlannedManuscript>();
  const manuscriptOfToken = new Map<string, PlannedManuscript>();
  const manuscriptOfMorpheme = new Map<string, PlannedManuscript>();
  for (const manuscript of manuscripts) {
    for (const unit of manuscript.units) manuscriptOfUnit.set(unit.id, manuscript);
    for (const token of manuscript.tokens) manuscriptOfToken.set(token.id, manuscript);
    for (const morpheme of manuscript.morphemes) manuscriptOfMorpheme.set(morpheme.id, manuscript);
  }
  const projectNotes: PlannedNote[] = [];
  const droppedTargets: { id: string; targetType: LegacyNoteTarget; targetId: string }[] = [];
  for (const note of notes) {
    const planned = {
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      text: note.text,
    };
    const manuscript =
      note.targetType === 'unit'
        ? manuscriptOfUnit.get(note.targetId)
        : note.targetType === 'token'
          ? manuscriptOfToken.get(note.targetId)
          : note.targetType === 'morpheme'
            ? manuscriptOfMorpheme.get(note.targetId)
            : undefined;
    if (manuscript !== undefined) {
      manuscript.notes.push(planned);
      continue;
    }
    const inProject =
      (note.targetType === 'language' && ids.languages.has(note.targetId)) ||
      (note.targetType === 'speaker' && ids.speakers.has(note.targetId)) ||
      (note.targetType === 'orthography' && ids.orthographies.has(note.targetId)) ||
      (note.targetType === 'lexeme' && ids.lexemes.has(note.targetId)) ||
      (note.targetType === 'text' && projectId === note.targetId);
    if (inProject) {
      projectNotes.push(planned);
      continue;
    }
    droppedTargets.push({ id: note.id, targetType: note.targetType, targetId: note.targetId });
  }
  return { projectNotes, droppedTargets };
}

function plannedContents(
  contents: readonly LegacyUnitContent[],
  unitIds: ReadonlySet<string>,
): LegacyUnitContent[] {
  return contents.filter((content) => unitIds.has(content.unitId));
}

function plannedAnchors(anchors: readonly LegacyAnchor[], audioId: string | null): PlannedAnchor[] {
  if (audioId === null) return [];
  return anchors
    .filter((anchor) => audioIdOf(anchor.mediaId) === audioId)
    .map((anchor) => ({ id: anchor.id, mediaId: anchor.mediaId, time: anchor.time }));
}

function keptAnchorId(
  anchorId: string | undefined,
  kept: ReadonlySet<string>,
  unitId: string,
  missing: { unitId: string; anchorId: string }[],
): string | undefined {
  if (anchorId === undefined) return undefined;
  if (kept.has(anchorId)) return anchorId;
  missing.push({ unitId, anchorId });
  return undefined;
}

function plannedLayers(
  layers: readonly LegacyLayer[],
  documentId: string,
  documentUnits: readonly LegacyUnit[],
  groupUnits: readonly LegacyUnit[],
  includeEmpty: boolean,
): PlannedLayer[] {
  const usedByDocument = new Set(documentUnits.map((unit) => unit.layerId));
  const usedByGroup = new Set(groupUnits.map((unit) => unit.layerId));
  return layers
    .filter((layer) => {
      if (layer.documentId !== documentId) return false;
      if (usedByGroup.has(layer.id)) return true;
      return includeEmpty && !usedByDocument.has(layer.id);
    })
    .map((layer) => ({
      id: layer.id,
      key: layer.key ?? layer.id,
      ...(layer.languageId !== undefined ? { languageId: layer.languageId } : {}),
      ...(layer.orthographyId !== undefined ? { orthographyId: layer.orthographyId } : {}),
    }));
}

function referencedIds(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}

function plannedGrammarDocs(rows: readonly LegacyGrammarDoc[]): {
  kept: LegacyGrammarDoc[];
  droppedParents: { id: string; parentId: string }[];
} {
  const ids = new Set(rows.map((row) => row.id));
  const kept: LegacyGrammarDoc[] = [];
  const droppedParents: { id: string; parentId: string }[] = [];
  for (const row of rows) {
    if (row.parentId === undefined || ids.has(row.parentId)) {
      kept.push(row);
      continue;
    }
    droppedParents.push({ id: row.id, parentId: row.parentId });
    const { parentId: _parentId, ...rest } = row;
    kept.push(rest);
  }
  return { kept, droppedParents };
}

function keepByProjectId<T extends { id: string; projectId: string }>(
  rows: readonly T[],
  projectId: string | undefined,
): { kept: T[]; dropped: { id: string; projectId: string }[] } {
  const kept: T[] = [];
  const dropped: { id: string; projectId: string }[] = [];
  for (const row of rows) {
    if (projectId !== undefined && row.projectId === projectId) kept.push(row);
    else dropped.push({ id: row.id, projectId: row.projectId });
  }
  return { kept, dropped };
}

function keepConversations(
  rows: readonly LegacyAiConversation[],
  projectId: string | undefined,
): { kept: LegacyAiConversation[]; dropped: { id: string; textId: string }[] } {
  const kept: LegacyAiConversation[] = [];
  const dropped: { id: string; textId: string }[] = [];
  for (const row of rows) {
    if (projectId !== undefined && row.textId === projectId) kept.push(row);
    else dropped.push({ id: row.id, textId: row.textId ?? '' });
  }
  return { kept, dropped };
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function wholeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function keepSessionMemories(
  rows: readonly LegacyAiSessionMemoryInput[],
  conversationIds: ReadonlySet<string>,
): {
  kept: LegacyAiSessionMemory[];
  dropped: {
    id: string;
    reason: 'missing-conversation' | 'id-mismatch' | 'payload' | 'updated-at';
  }[];
} {
  const kept: LegacyAiSessionMemory[] = [];
  const dropped: {
    id: string;
    reason: 'missing-conversation' | 'id-mismatch' | 'payload' | 'updated-at';
  }[] = [];
  for (const row of rows) {
    if (row.id !== row.conversationId) {
      dropped.push({ id: row.id, reason: 'id-mismatch' });
      continue;
    }
    if (!conversationIds.has(row.conversationId)) {
      dropped.push({ id: row.id, reason: 'missing-conversation' });
      continue;
    }
    const payload = jsonObject(row.payload);
    if (payload === undefined) {
      dropped.push({ id: row.id, reason: 'payload' });
      continue;
    }
    if (!nonEmpty(row.updatedAt)) {
      dropped.push({ id: row.id, reason: 'updated-at' });
      continue;
    }
    kept.push({
      id: row.id,
      conversationId: row.conversationId,
      payload,
      updatedAt: row.updatedAt,
    });
  }
  return { kept, dropped };
}

function keepModelRuns(
  rows: readonly LegacyModelRunInput[],
  projectId: string | undefined,
): { kept: LegacyModelRun[]; dropped: { id: string; reason: 'wrong-project' | 'shape' }[] } {
  const kept: LegacyModelRun[] = [];
  const dropped: { id: string; reason: 'wrong-project' | 'shape' }[] = [];
  for (const row of rows) {
    if (projectId === undefined || row.textId !== projectId) {
      dropped.push({ id: row.id, reason: 'wrong-project' });
      continue;
    }
    const params = jsonObject(row.params);
    const status = row.status;
    if (
      row.capability !== 'transcribe' ||
      params === undefined ||
      (status !== 'running' && status !== 'ok' && status !== 'error' && status !== 'cancelled') ||
      !nonEmpty(row.modelId) ||
      !nonEmpty(row.modelVersion) ||
      !nonEmpty(row.manifestSha256) ||
      !nonEmpty(row.mediaId) ||
      !nonEmpty(row.startedAt) ||
      (row.finishedAt !== undefined && !nonEmpty(row.finishedAt)) ||
      (row.errorCode !== undefined && typeof row.errorCode !== 'string') ||
      !wholeCount(row.chunkCount) ||
      !wholeCount(row.acceptedCount) ||
      !wholeCount(row.rejectedCount) ||
      !wholeCount(row.pendingCount) ||
      typeof row.rangeStart !== 'number' ||
      !Number.isFinite(row.rangeStart) ||
      typeof row.rangeEnd !== 'number' ||
      !Number.isFinite(row.rangeEnd)
    ) {
      dropped.push({ id: row.id, reason: 'shape' });
      continue;
    }
    kept.push({
      id: row.id,
      textId: row.textId,
      modelId: row.modelId,
      modelVersion: row.modelVersion,
      manifestSha256: row.manifestSha256,
      capability: 'transcribe',
      params,
      mediaId: row.mediaId,
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      startedAt: row.startedAt,
      ...(row.finishedAt !== undefined ? { finishedAt: row.finishedAt } : {}),
      status,
      ...(row.errorCode !== undefined ? { errorCode: row.errorCode } : {}),
      chunkCount: row.chunkCount,
      acceptedCount: row.acceptedCount,
      rejectedCount: row.rejectedCount,
      pendingCount: row.pendingCount,
    });
  }
  return { kept, dropped };
}

function keepMessages(
  rows: readonly LegacyAiMessage[],
  conversationIds: ReadonlySet<string>,
): { kept: LegacyAiMessage[]; dropped: { id: string; conversationId: string }[] } {
  const kept: LegacyAiMessage[] = [];
  const dropped: { id: string; conversationId: string }[] = [];
  for (const row of rows) {
    if (conversationIds.has(row.conversationId)) kept.push(row);
    else dropped.push({ id: row.id, conversationId: row.conversationId });
  }
  return { kept, dropped };
}

function keepSnapshots(
  rows: readonly LegacyAiTaskSnapshot[],
  taskIds: ReadonlySet<string>,
): { kept: LegacyAiTaskSnapshot[]; dropped: { id: string; taskId: string }[] } {
  const kept: LegacyAiTaskSnapshot[] = [];
  const dropped: { id: string; taskId: string }[] = [];
  for (const row of rows) {
    if (taskIds.has(row.taskId)) kept.push(row);
    else dropped.push({ id: row.id, taskId: row.taskId });
  }
  return { kept, dropped };
}

function keepAssetLinks(
  rows: readonly LegacyLexemeAssetLink[],
  lexemeIds: ReadonlySet<string>,
  assetIds: ReadonlySet<string>,
): {
  kept: LegacyLexemeAssetLink[];
  dropped: { id: string; lexemeId: string; assetId: string; reason: 'missing-target' }[];
} {
  const kept: LegacyLexemeAssetLink[] = [];
  const dropped: { id: string; lexemeId: string; assetId: string; reason: 'missing-target' }[] = [];
  for (const row of rows) {
    if (lexemeIds.has(row.lexemeId) && assetIds.has(row.assetId)) kept.push(row);
    else
      dropped.push({
        id: row.id,
        lexemeId: row.lexemeId,
        assetId: row.assetId,
        reason: 'missing-target',
      });
  }
  return { kept, dropped };
}

function keepOwned<T extends { id: string; textId: string }>(
  rows: readonly T[],
  projectId: string | undefined,
): { kept: T[]; dropped: { id: string; textId: string }[] } {
  const kept: T[] = [];
  const dropped: { id: string; textId: string }[] = [];
  for (const row of rows) {
    if (projectId !== undefined && row.textId === projectId) kept.push(row);
    else dropped.push({ id: row.id, textId: row.textId });
  }
  return { kept, dropped };
}

function keepByLanguage<T extends { id: string; languageId: string }>(
  rows: readonly T[],
  languageIds: ReadonlySet<string>,
): { kept: T[]; dropped: { id: string; languageId: string }[] } {
  const kept: T[] = [];
  const dropped: { id: string; languageId: string }[] = [];
  for (const row of rows) {
    if (languageIds.has(row.languageId)) kept.push(row);
    else dropped.push({ id: row.id, languageId: row.languageId });
  }
  return { kept, dropped };
}

function pickById<T extends { id: string }>(
  ids: readonly string[],
  rows: readonly T[],
): { kept: T[]; missing: string[] } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept: T[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row === undefined) missing.push(id);
    else kept.push(row);
  }
  return { kept, missing };
}

function snapshotDefinitions(
  layers: readonly PlannedLayer[],
  units: readonly PlannedUnit[],
  catalog: {
    languages: readonly LegacyLanguage[];
    displayNames: readonly LegacyLanguageDisplayName[];
    aliases: readonly LegacyLanguageAlias[];
    orthographies: readonly LegacyOrthography[];
    speakers: readonly { id: string; name: string }[];
  },
): { definitions: PlannedDefinitions; missingDefinitions: PlannedMissingDefinition[] } {
  const languagePick = pickById(
    referencedIds(layers.map((layer) => layer.languageId)),
    catalog.languages,
  );
  const orthographyPick = pickById(
    referencedIds(layers.map((layer) => layer.orthographyId)),
    catalog.orthographies,
  );
  const speakerPick = pickById(
    referencedIds(units.map((unit) => unit.speakerId)),
    catalog.speakers,
  );
  const keptLanguageIds = new Set(languagePick.kept.map((language) => language.id));
  return {
    definitions: {
      languages: languagePick.kept.map((language) => ({ id: language.id, name: language.name })),
      displayNames: catalog.displayNames
        .filter((row) => keptLanguageIds.has(row.languageId))
        .map(({ id, languageId, locale, value }) => ({ id, languageId, locale, value })),
      aliases: catalog.aliases
        .filter((row) => keptLanguageIds.has(row.languageId))
        .map(({ id, languageId, alias }) => ({ id, languageId, alias })),
      orthographies: orthographyPick.kept.map((row) => ({
        id: row.id,
        name: row.name,
        ...(row.languageId !== undefined ? { languageId: row.languageId } : {}),
      })),
      speakers: speakerPick.kept.map((speaker) => ({ id: speaker.id, name: speaker.name })),
    },
    missingDefinitions: [
      ...languagePick.missing.map((id) => ({ kind: 'language' as const, id })),
      ...orthographyPick.missing.map((id) => ({ kind: 'orthography' as const, id })),
      ...speakerPick.missing.map((id) => ({ kind: 'speaker' as const, id })),
    ],
  };
}

function plannedSourceRefs(
  sourceIds: readonly string[] | undefined,
  sources: readonly LegacySourceRecord[],
  audioId: string | null,
  includeUnlinked: boolean,
): { sourceIds: string[]; missingSourceIds: string[] } {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const kept: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const id of sourceIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const source = byId.get(id);
    if (source === undefined) {
      if (includeUnlinked) missing.push(id);
      continue;
    }
    if (source.mediaId !== undefined) {
      if (audioIdOf(source.mediaId) === audioId) kept.push(source.id);
      continue;
    }
    if (includeUnlinked) kept.push(source.id);
  }
  return { sourceIds: kept, missingSourceIds: missing };
}

function plannedLexemeLinks(
  links: readonly LegacyLexemeLink[],
  tokenIds: ReadonlySet<string>,
  morphemeIds: ReadonlySet<string>,
  lexemeIds: ReadonlySet<string>,
): { links: PlannedLexemeLink[]; dropped: DroppedLexemeLink[]; handled: string[] } {
  const kept: PlannedLexemeLink[] = [];
  const dropped: DroppedLexemeLink[] = [];
  const handled: string[] = [];
  for (const link of links) {
    const inGroup =
      link.targetType === 'token' ? tokenIds.has(link.targetId) : morphemeIds.has(link.targetId);
    if (!inGroup) continue;
    handled.push(link.id);
    if (!lexemeIds.has(link.lexemeId)) {
      dropped.push({
        id: link.id,
        targetId: link.targetId,
        lexemeId: link.lexemeId,
        reason: 'missing-lexeme',
      });
      continue;
    }
    kept.push({
      id: link.id,
      targetType: link.targetType,
      targetId: link.targetId,
      lexemeId: link.lexemeId,
    });
  }
  return { links: kept, dropped, handled };
}

/** 文稿引用的来源挂在这份文稿没有的录音上，所以不进任何一份 `.jyd`。 */
export interface DroppedSourceRef {
  documentId: string;
  sourceId: string;
  mediaId: string;
  reason: 'other-audio';
}

/** 同一个锚点、轨道或层链接进了不止一份 `.jyd` 时，第一份保留原 id，其余换成新 id。 */
export interface CopiedId {
  manuscriptId: string;
  kind: 'anchor' | 'track' | 'layer-link';
  fromId: string;
  toId: string;
}

function renameCopiedIds(manuscripts: PlannedManuscript[]): CopiedId[] {
  const copied: CopiedId[] = [];
  const seen: Record<CopiedId['kind'], Set<string>> = {
    anchor: new Set(),
    track: new Set(),
    'layer-link': new Set(),
  };
  const rename = (kind: CopiedId['kind'], manuscriptId: string, id: string): string => {
    if (!seen[kind].has(id)) {
      seen[kind].add(id);
      return id;
    }
    let toId = `${id}--${manuscriptId}`;
    for (let n = 2; seen[kind].has(toId); n += 1) toId = `${id}--${manuscriptId}-${n}`;
    seen[kind].add(toId);
    copied.push({ manuscriptId, kind, fromId: id, toId });
    return toId;
  };
  for (const manuscript of manuscripts) {
    const anchorIds = new Map<string, string>();
    manuscript.anchors = manuscript.anchors.map((anchor) => {
      const id = rename('anchor', manuscript.id, anchor.id);
      anchorIds.set(anchor.id, id);
      return { ...anchor, id };
    });
    manuscript.units = manuscript.units.map((unit) => ({
      ...unit,
      ...(unit.startAnchorId !== undefined
        ? { startAnchorId: anchorIds.get(unit.startAnchorId) ?? unit.startAnchorId }
        : {}),
      ...(unit.endAnchorId !== undefined
        ? { endAnchorId: anchorIds.get(unit.endAnchorId) ?? unit.endAnchorId }
        : {}),
    }));
    manuscript.tracks = manuscript.tracks.map((track) => ({
      ...track,
      id: rename('track', manuscript.id, track.id),
    }));
    manuscript.layerLinks = manuscript.layerLinks.map((link) => ({
      ...link,
      id: rename('layer-link', manuscript.id, link.id),
    }));
  }
  return copied;
}

export interface SplitDroppedUnit {
  id: string;
  reason: 'no-audio';
}

export interface PendingSplit {
  documentId: string;
  audioIds: string[];
  /** 拆开后不进任何一份文稿的语段：自己和上级都没有音频。 */
  droppedUnits: SplitDroppedUnit[];
  /** 拆开后父子分在两份文稿里、会被断开的链接。 */
  droppedLinks: DroppedLink[];
}

/**
 * 按录音拆开一份文稿。没有 mediaId 的语段沿父链找到最近一条音频，跟着那一组走；
 * 一直找不到的是纯文本语段，拆开时不进任何一组。
 */
function splitDocument<T extends LegacyUnit>(
  units: readonly T[],
  audioIds: readonly string[],
): {
  groups: { audioId: string; units: T[] }[];
  droppedUnits: SplitDroppedUnit[];
  droppedLinks: DroppedLink[];
} {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const resolved = new Map<string, string | null>();
  const resolve = (unit: T): string | null => {
    const seen = new Set<string>();
    let current: T | undefined = unit;
    while (current !== undefined && !seen.has(current.id)) {
      const known = resolved.get(current.id);
      if (known !== undefined) return known;
      const own = audioIdOf(current.mediaId);
      if (own !== null) return own;
      seen.add(current.id);
      current = current.parentUnitId === undefined ? undefined : byId.get(current.parentUnitId);
    }
    return null;
  };
  for (const unit of units) resolved.set(unit.id, resolve(unit));
  const droppedLinks: DroppedLink[] = [];
  for (const unit of units) {
    if (unit.parentUnitId === undefined || !byId.has(unit.parentUnitId)) continue;
    const own = resolved.get(unit.id) ?? null;
    if (own !== null && own !== (resolved.get(unit.parentUnitId) ?? null)) {
      droppedLinks.push({ unitId: unit.id, parentUnitId: unit.parentUnitId });
    }
  }
  return {
    groups: audioIds.map((audioId) => ({
      audioId,
      units: units.filter((unit) => resolved.get(unit.id) === audioId),
    })),
    droppedUnits: units
      .filter((unit) => resolved.get(unit.id) === null)
      .map((unit) => ({ id: unit.id, reason: 'no-audio' as const })),
    droppedLinks,
  };
}

export function planLegacyMigration(
  library: LegacyLibrary,
  options: { confirmSplit?: boolean } = {},
): LegacyMigrationPlan {
  const documentOfLayer = new Map(library.layers.map((layer) => [layer.id, layer.documentId]));
  const placed = library.units.flatMap((unit) => {
    const manuscriptId = documentOfLayer.get(unit.layerId);
    return manuscriptId === undefined ? [] : [{ ...unit, manuscriptId }];
  });
  const crossed = crossManuscriptParentLinks(placed);
  if (crossed.length > 0)
    return { status: 'rejected', reason: 'cross-manuscript-parent', links: crossed };
  if ((library.speakers?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'speakers-without-project' };
  }
  if (
    library.project === undefined &&
    ((library.languages?.length ?? 0) > 0 ||
      (library.orthographies?.length ?? 0) > 0 ||
      (library.displayNames?.length ?? 0) > 0 ||
      (library.aliases?.length ?? 0) > 0)
  ) {
    return { status: 'rejected', reason: 'definitions-without-project' };
  }
  if ((library.sourceRecords?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'sources-without-project' };
  }
  if ((library.lexemes?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'lexemes-without-project' };
  }
  if ((library.phonemes?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'phonemes-without-project' };
  }
  if ((library.abbreviations?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'abbreviations-without-project' };
  }
  if ((library.tagDefinitions?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'tags-without-project' };
  }
  if ((library.bibliographicSources?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'bibliography-without-project' };
  }
  if ((library.locations?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'locations-without-project' };
  }
  if ((library.grammarDocs?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'grammar-without-project' };
  }
  if ((library.orthographyBridges?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'bridges-without-project' };
  }
  if ((library.customFields?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'custom-fields-without-project' };
  }
  if ((library.catalogHistory?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'catalog-history-without-project' };
  }
  if ((library.lexemeAssets?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'lexeme-assets-without-project' };
  }
  if ((library.lexemeAssetLinks?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'lexeme-asset-links-without-project' };
  }
  if ((library.structuralRules?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'structural-rules-without-project' };
  }
  if (
    library.project === undefined &&
    ((library.conversations?.length ?? 0) > 0 ||
      (library.aiMessages?.length ?? 0) > 0 ||
      (library.aiTasks?.length ?? 0) > 0 ||
      (library.aiTaskSnapshots?.length ?? 0) > 0 ||
      (library.projectMemories?.length ?? 0) > 0 ||
      (library.agentArtifacts?.length ?? 0) > 0 ||
      (library.aiSourceSets?.length ?? 0) > 0 ||
      (library.sessionMemories?.length ?? 0) > 0)
  ) {
    return { status: 'rejected', reason: 'ai-without-project' };
  }
  if ((library.modelRuns?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'model-runs-without-project' };
  }
  if ((library.notes?.length ?? 0) > 0 && library.project === undefined) {
    return { status: 'rejected', reason: 'notes-without-project' };
  }

  const projectId = library.project?.id;
  const ownedLanguages = keepOwned(library.languages ?? [], projectId);
  const ownedOrthographies = keepOwned(library.orthographies ?? [], projectId);
  const ownedLanguageIds = new Set(ownedLanguages.kept.map((language) => language.id));
  const displayNameRows = keepOwned(library.displayNames ?? [], projectId);
  const ownedDisplayNames = keepByLanguage(displayNameRows.kept, ownedLanguageIds);
  const aliasRows = keepOwned(library.aliases ?? [], projectId);
  const ownedAliases = keepByLanguage(aliasRows.kept, ownedLanguageIds);
  const ownedSources = keepOwned(library.sourceRecords ?? [], projectId);
  const ownedLexemes = keepOwned(library.lexemes ?? [], projectId);
  const ownedPhonemes = keepOwned(library.phonemes ?? [], projectId);
  const ownedAbbreviations = keepOwned(library.abbreviations ?? [], projectId);
  const ownedTags = keepOwned(library.tagDefinitions ?? [], projectId);
  const ownedBibliography = keepOwned(library.bibliographicSources ?? [], projectId);
  const ownedLocations = keepOwned(library.locations ?? [], projectId);
  const ownedGrammar = keepOwned(library.grammarDocs ?? [], projectId);
  const grammarDocs = plannedGrammarDocs(ownedGrammar.kept);
  const ownedBridges = keepOwned(library.orthographyBridges ?? [], projectId);
  const ownedCustomFields = keepOwned(library.customFields ?? [], projectId);
  const ownedCatalogHistory = keepOwned(library.catalogHistory ?? [], projectId);
  const ownedLexemeAssets = keepOwned(library.lexemeAssets ?? [], projectId);
  const ownedLexemeAssetLinkRows = keepOwned(library.lexemeAssetLinks ?? [], projectId);
  const ownedStructuralRules = keepByProjectId(library.structuralRules ?? [], projectId);
  const ownedConversations = keepConversations(library.conversations ?? [], projectId);
  const ownedMessages = keepMessages(
    library.aiMessages ?? [],
    new Set(ownedConversations.kept.map((conversation) => conversation.id)),
  );
  const ownedSessionMemories = keepSessionMemories(
    library.sessionMemories ?? [],
    new Set(ownedConversations.kept.map((conversation) => conversation.id)),
  );
  const ownedModelRuns = keepModelRuns(library.modelRuns ?? [], projectId);
  const aiTasks = library.project === undefined ? [] : [...(library.aiTasks ?? [])];
  const ownedSnapshots = keepSnapshots(
    library.aiTaskSnapshots ?? [],
    new Set(aiTasks.map((task) => task.id)),
  );
  const ownedProjectMemories = keepByProjectId(library.projectMemories ?? [], projectId);
  const agentArtifacts = library.project === undefined ? [] : [...(library.agentArtifacts ?? [])];
  const ownedSourceSets = keepByProjectId(library.aiSourceSets ?? [], projectId);
  const keptLexemeIds = new Set(ownedLexemes.kept.map((lexeme) => lexeme.id));
  const keptAssetIds = new Set(ownedLexemeAssets.kept.map((asset) => asset.id));
  const assignedAssetLinks = keepAssetLinks(
    ownedLexemeAssetLinkRows.kept,
    keptLexemeIds,
    keptAssetIds,
  );
  const speakers = (library.speakers ?? []).flatMap((speaker) =>
    projectId !== undefined && speaker.textId === projectId
      ? [{ id: speaker.id, textId: speaker.textId, name: speaker.name }]
      : [],
  );
  const droppedSpeakers = (library.speakers ?? [])
    .filter((speaker) => projectId === undefined || speaker.textId !== projectId)
    .map((speaker) => ({ id: speaker.id, textId: speaker.textId }));
  const catalog = {
    languages: ownedLanguages.kept,
    displayNames: ownedDisplayNames.kept,
    aliases: ownedAliases.kept,
    orthographies: ownedOrthographies.kept,
    speakers,
  };

  const confirmSplit = options.confirmSplit === true;
  const pending: PendingSplit[] = [];
  const splitDroppedUnits = new Set<string>();
  const libraryAudioIds = new Set(library.audios.map((audio) => audio.id));
  const missingAudios: { manuscriptId: string; audioId: string }[] = [];
  const manuscripts: PlannedManuscript[] = [];
  const droppedLinks: DroppedLink[] = [];
  const droppedMorphemes: { id: string; tokenId: string }[] = [];
  const droppedLexemeLinks: DroppedLexemeLink[] = [];
  const handledLexemeLinks = new Set<string>();
  const fileNames = new Set<string>();

  const ownedSourceById = new Map(ownedSources.kept.map((source) => [source.id, source]));
  const droppedSourceRefs: DroppedSourceRef[] = [];
  for (const document of library.documents) {
    const keptSourceIds = new Set<string>();
    const units = placed.filter((unit) => unit.manuscriptId === document.id);
    const audioIds = unitAudioIds(units);
    const split = audioIds.length > 1 ? splitDocument(units, audioIds) : null;
    if (split !== null && !confirmSplit) {
      pending.push({
        documentId: document.id,
        audioIds,
        droppedUnits: split.droppedUnits,
        droppedLinks: split.droppedLinks,
      });
      continue;
    }
    for (const unit of split?.droppedUnits ?? []) splitDroppedUnits.add(unit.id);
    const groups: { id: string; audioId: string | null; units: typeof units }[] =
      split !== null
        ? split.groups.map((group) => ({
            id: `${document.id}--${group.audioId}`,
            audioId: group.audioId,
            units: group.units,
          }))
        : [
            {
              id: document.id,
              audioId: audioIds[0] ?? null,
              units,
            },
          ];
    for (const group of groups) {
      if (group.audioId !== null && !libraryAudioIds.has(group.audioId)) {
        missingAudios.push({ manuscriptId: group.id, audioId: group.audioId });
      }
      const groupIds = new Set(group.units.map((unit) => unit.id));
      const segmentation = plannedSegmentation(
        library.tokens ?? [],
        library.morphemes ?? [],
        groupIds,
      );
      droppedMorphemes.push(...segmentation.droppedMorphemes);
      const layers = plannedLayers(
        library.layers,
        document.id,
        units,
        group.units,
        audioIds.length <= 1 || group === groups[0],
      );
      const anchors = plannedAnchors(library.anchors ?? [], group.audioId);
      const anchorIds = new Set(anchors.map((anchor) => anchor.id));
      const missingAnchors: { unitId: string; anchorId: string }[] = [];
      const plannedUnits = group.units.map((unit) => {
        const parent = unit.parentUnitId;
        const startAnchorId = keptAnchorId(unit.startAnchorId, anchorIds, unit.id, missingAnchors);
        const endAnchorId = keptAnchorId(unit.endAnchorId, anchorIds, unit.id, missingAnchors);
        const anchorRefs = {
          ...(startAnchorId !== undefined ? { startAnchorId } : {}),
          ...(endAnchorId !== undefined ? { endAnchorId } : {}),
        };
        if (parent !== undefined && !groupIds.has(parent)) {
          droppedLinks.push({ unitId: unit.id, parentUnitId: parent });
          return plannedUnit(unit, undefined, anchorRefs);
        }
        return plannedUnit(unit, parent, anchorRefs);
      });
      const snapshot = snapshotDefinitions(layers, plannedUnits, catalog);
      const sourceRefs = plannedSourceRefs(
        document.sourceIds,
        ownedSources.kept,
        group.audioId,
        audioIds.length <= 1 || group === groups[0],
      );
      const lexemeLinks = plannedLexemeLinks(
        library.lexemeLinks ?? [],
        new Set(segmentation.tokens.map((token) => token.id)),
        new Set(segmentation.morphemes.map((morpheme) => morpheme.id)),
        keptLexemeIds,
      );
      droppedLexemeLinks.push(...lexemeLinks.dropped);
      for (const id of lexemeLinks.handled) handledLexemeLinks.add(id);
      manuscripts.push({
        id: group.id,
        sourceDocumentId: document.id,
        fileName: uniqueName(fileNames, manuscriptFileName(document.name)),
        audioId: group.audioId,
        layers,
        tokens: segmentation.tokens,
        morphemes: segmentation.morphemes,
        units: plannedUnits,
        definitions: snapshot.definitions,
        missingDefinitions: snapshot.missingDefinitions,
        sourceIds: sourceRefs.sourceIds,
        missingSourceIds: sourceRefs.missingSourceIds,
        lexemeLinks: lexemeLinks.links,
        anchors,
        missingAnchors,
        contents: plannedContents(library.contents ?? [], groupIds),
        relations: [],
        notes: [],
        layerLinks: [],
        tracks: [],
        annotations: [],
      });
      for (const id of sourceRefs.sourceIds) keptSourceIds.add(id);
    }
    for (const id of new Set(document.sourceIds ?? [])) {
      const source = ownedSourceById.get(id);
      if (source === undefined || keptSourceIds.has(id)) continue;
      droppedSourceRefs.push({
        documentId: document.id,
        sourceId: id,
        mediaId: source.mediaId ?? '',
        reason: 'other-audio',
      });
    }
  }

  if (pending.length > 0) return { status: 'needs-confirm', documents: pending };

  for (const link of library.lexemeLinks ?? []) {
    if (handledLexemeLinks.has(link.id)) continue;
    droppedLexemeLinks.push({
      id: link.id,
      targetId: link.targetId,
      lexemeId: link.lexemeId,
      reason: 'missing-target',
    });
  }

  const placedAnchorIds = new Set(
    manuscripts.flatMap((manuscript) => manuscript.anchors.map((anchor) => anchor.id)),
  );
  const droppedAnchors = (library.anchors ?? [])
    .filter((anchor) => !placedAnchorIds.has(anchor.id))
    .map((anchor) => ({ id: anchor.id, mediaId: anchor.mediaId }));
  const placedUnitIds = new Set(
    manuscripts.flatMap((manuscript) => manuscript.units.map((unit) => unit.id)),
  );
  const droppedContents = (library.contents ?? [])
    .filter((content) => !placedUnitIds.has(content.unitId))
    .map((content) => ({ id: content.id, unitId: content.unitId }));
  const droppedUnits = library.units
    .filter((unit) => !placedUnitIds.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      layerId: unit.layerId,
      reason: splitDroppedUnits.has(unit.id)
        ? ('no-audio-in-split' as const)
        : ('missing-layer' as const),
    }));
  const droppedTokens = (library.tokens ?? [])
    .filter((token) => !placedUnitIds.has(token.unitId))
    .map((token) => ({ id: token.id, unitId: token.unitId }));
  for (const morpheme of library.morphemes ?? []) {
    if (!placedUnitIds.has(morpheme.unitId)) {
      droppedMorphemes.push({ id: morpheme.id, tokenId: morpheme.tokenId });
    }
  }
  const droppedRelations = assignUnitRelations(library.relations ?? [], manuscripts);
  const droppedLayerLinks = assignLayerLinks(library.layerLinks ?? [], manuscripts);
  const droppedTracks = assignTracks(library.tracks ?? [], manuscripts);
  const droppedAnnotations = assignAnnotations(library.annotations ?? [], manuscripts);
  const ownedNotes = keepOwned(library.notes ?? [], projectId);
  const assignedNotes = assignNotes(ownedNotes.kept, manuscripts, projectId, {
    languages: ownedLanguageIds,
    speakers: new Set(speakers.map((speaker) => speaker.id)),
    orthographies: new Set(ownedOrthographies.kept.map((orthography) => orthography.id)),
    lexemes: keptLexemeIds,
  });

  const audios = library.audios.map((audio) => ({
    audioId: audio.id,
    fileName: uniqueName(fileNames, audioFileName(audio.filename)),
    sha256: sha256(audio.bytes),
    bytes: audio.bytes,
  }));

  const copiedIds = renameCopiedIds(manuscripts);

  return {
    status: 'ready',
    audios,
    manuscripts,
    droppedLinks,
    droppedUnits,
    missingAudios,
    droppedTokens,
    droppedMorphemes,
    project: library.project ?? null,
    speakers,
    droppedSpeakers,
    languages: ownedLanguages.kept,
    displayNames: ownedDisplayNames.kept,
    aliases: ownedAliases.kept,
    orthographies: ownedOrthographies.kept,
    sourceRecords: ownedSources.kept,
    droppedSourceRecords: ownedSources.dropped,
    lexemes: ownedLexemes.kept,
    droppedLexemes: ownedLexemes.dropped,
    phonemes: ownedPhonemes.kept,
    droppedPhonemes: ownedPhonemes.dropped,
    abbreviations: ownedAbbreviations.kept,
    droppedAbbreviations: ownedAbbreviations.dropped,
    tagDefinitions: ownedTags.kept,
    droppedTagDefinitions: ownedTags.dropped,
    bibliographicSources: ownedBibliography.kept,
    droppedBibliographicSources: ownedBibliography.dropped,
    locations: ownedLocations.kept,
    droppedLocations: ownedLocations.dropped,
    grammarDocs: grammarDocs.kept,
    droppedGrammarDocs: ownedGrammar.dropped,
    droppedGrammarParents: grammarDocs.droppedParents,
    orthographyBridges: ownedBridges.kept,
    droppedOrthographyBridges: ownedBridges.dropped,
    customFields: ownedCustomFields.kept,
    droppedCustomFields: ownedCustomFields.dropped,
    catalogHistory: ownedCatalogHistory.kept,
    droppedCatalogHistory: ownedCatalogHistory.dropped,
    lexemeAssets: ownedLexemeAssets.kept,
    droppedLexemeAssets: ownedLexemeAssets.dropped,
    lexemeAssetLinks: assignedAssetLinks.kept,
    droppedLexemeAssetLinks: [
      ...ownedLexemeAssetLinkRows.dropped.map((row) => ({
        id: row.id,
        textId: row.textId,
        reason: 'wrong-project' as const,
      })),
      ...assignedAssetLinks.dropped,
    ],
    structuralRules: ownedStructuralRules.kept,
    droppedStructuralRules: ownedStructuralRules.dropped,
    conversations: ownedConversations.kept,
    droppedConversations: ownedConversations.dropped,
    aiMessages: ownedMessages.kept,
    droppedAiMessages: ownedMessages.dropped,
    aiTasks,
    aiTaskSnapshots: ownedSnapshots.kept,
    droppedAiTaskSnapshots: ownedSnapshots.dropped,
    projectMemories: ownedProjectMemories.kept,
    droppedProjectMemories: ownedProjectMemories.dropped,
    agentArtifacts,
    aiSourceSets: ownedSourceSets.kept,
    droppedAiSourceSets: ownedSourceSets.dropped,
    sessionMemories: ownedSessionMemories.kept,
    droppedSessionMemories: ownedSessionMemories.dropped,
    modelRuns: ownedModelRuns.kept,
    droppedModelRuns: ownedModelRuns.dropped,
    droppedLexemeLinks,
    droppedAnchors,
    droppedContents,
    droppedRelations,
    notes: assignedNotes.projectNotes,
    droppedNotes: ownedNotes.dropped,
    droppedNoteTargets: assignedNotes.droppedTargets,
    droppedLayerLinks,
    droppedTracks,
    droppedAnnotations,
    droppedSourceRefs,
    copiedIds,
    droppedDefinitions: [
      ...ownedLanguages.dropped.map((row) => ({
        kind: 'language' as const,
        id: row.id,
        ref: row.textId,
      })),
      ...ownedOrthographies.dropped.map((row) => ({
        kind: 'orthography' as const,
        id: row.id,
        ref: row.textId,
      })),
      ...displayNameRows.dropped.map((row) => ({
        kind: 'display-name' as const,
        id: row.id,
        ref: row.textId,
      })),
      ...aliasRows.dropped.map((row) => ({
        kind: 'alias' as const,
        id: row.id,
        ref: row.textId,
      })),
      ...ownedDisplayNames.dropped.map((row) => ({
        kind: 'display-name' as const,
        id: row.id,
        ref: row.languageId,
      })),
      ...ownedAliases.dropped.map((row) => ({
        kind: 'alias' as const,
        id: row.id,
        ref: row.languageId,
      })),
    ],
  };
}
