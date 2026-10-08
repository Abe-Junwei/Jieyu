/**
 * Dexie 数据库引擎 | Dexie database engine
 *
 * 绿场基线（Batch 2A）：主库 `jieyu` 只声明 `version(1)`，结构与旧库 v54 最终形态等价。
 * 冻结点（D14）之前不写 upgrader；切片加字段时可直接抬升版本号并重置开发数据。
 * Greenfield baseline (Batch 2A): main DB `jieyu` declares only `version(1)`, structurally
 * equivalent to the former v54 final shape. No upgraders before the freeze point (D14).
 */
import Dexie, { type Table } from 'dexie';
import type {
  TextDocType,
  MediaItemDocType,
  LayerUnitDocType,
  UnitTokenDocType,
  UnitMorphemeDocType,
  AnchorDocType,
  LexemeDocType,
  TokenLexemeLinkDocType,
  LexemeAssetDocType,
  LexemeAssetLinkDocType,
  AiTaskDoc,
  EmbeddingDoc,
  AiConversationDoc,
  AiMessageDoc,
  AiSessionMemoryDoc,
  ProjectAiMemoryDoc,
  McpToolCallAuditDoc,
  ExternalMcpTrustDoc,
  AgentArtifactDoc,
  LanguageDocType,
  LanguageDisplayNameDocType,
  LanguageAliasDocType,
  LanguageCatalogHistoryDocType,
  CustomFieldDefinitionDocType,
  SpeakerDocType,
  OrthographyDocType,
  OrthographyBridgeDocType,
  LocationDocType,
  BibliographicSourceDocType,
  GrammarDocDocType,
  AbbreviationDocType,
  StructuralRuleProfileAssetDocType,
  PhonemeDocType,
  TagDefinitionDocType,
  LayerUnitContentDocType,
  UnitRelationDocType,
  LayerLinkDocType,
  TierDefinitionDocType,
  TierAnnotationDocType,
  AuditLogDocType,
  UserNoteDocType,
  SegmentMetaDocType,
  SegmentQualitySnapshotDocType,
  ScopeStatsSnapshotDocType,
  SpeakerProfileSnapshotDocType,
  TranslationStatusSnapshotDocType,
  LanguageAssetOverviewDocType,
  AiTaskSnapshotDocType,
  TrackEntityDocType,
  SourceRecordDocType,
  AiSourceSetDoc,
  JieyuCollections,
} from './types';
import {
  validateTextDoc,
  validateMediaItemDoc,
  validateUnitTokenDoc,
  validateUnitMorphemeDoc,
  validateAnchorDoc,
  validateLexemeDoc,
  validateTokenLexemeLinkDoc,
  validateLexemeAssetDoc,
  validateLexemeAssetLinkDoc,
  validateAiTaskDoc,
  validateEmbeddingDoc,
  validateAiConversationDoc,
  validateAiMessageDoc,
  validateAiSessionMemoryDoc,
  validateProjectAiMemoryDoc,
  validateMcpToolCallAuditDoc,
  validateExternalMcpTrustDoc,
  validateAgentArtifactDoc,
  validateLanguageDoc,
  validateLanguageDisplayNameDoc,
  validateLanguageAliasDoc,
  validateLanguageCatalogHistoryDoc,
  validateCustomFieldDefinitionDoc,
  validateSpeakerDoc,
  validateOrthographyDoc,
  validateOrthographyBridgeDoc,
  validateLocationDoc,
  validateBibliographicSourceDoc,
  validateGrammarDoc,
  validateAbbreviationDoc,
  validateStructuralRuleProfileAssetDoc,
  validatePhonemeDoc,
  validateTagDefinitionDoc,
  validateLayerDoc,
  validateLayerUnitDoc,
  validateLayerUnitContentDoc,
  validateUnitRelationDoc,
  validateLayerLinkDoc,
  validateTierDefinitionDoc,
  validateTierAnnotationDoc,
  validateAuditLogDoc,
  validateUserNoteDoc,
  validateSegmentMetaDoc,
  validateSegmentQualitySnapshotDoc,
  validateScopeStatsSnapshotDoc,
  validateSpeakerProfileSnapshotDoc,
  validateTranslationStatusSnapshotDoc,
  validateLanguageAssetOverviewDoc,
  validateAiTaskSnapshotDoc,
  validateTrackEntityDoc,
  validateSourceRecordDoc,
  validateAiSourceSetDoc,
} from './schemas';
import { DexieCollectionAdapter, TierBackedLayerCollectionAdapter } from './adapter';
import { markBackupDirtySinceLastExport } from '../utils/backupExportReminderState';
import {
  createWriteValidationMiddleware,
  type JieyuTableValidators,
} from './writeValidationMiddleware';
import { withCatalogOwnershipRules } from './catalogOwnership';

/**
 * IndexedDB 物理库名（D10）。旧库 `jieyudb_v2` 不再打开，由启动时的旧数据提示负责删除。
 * Physical IndexedDB name (D10). Legacy `jieyudb_v2` is never opened; the legacy-data prompt deletes it.
 */
export const JIEYU_DEXIE_DB_NAME = 'jieyu' as const;

/**
 * 须与 `JieyuDexie` 构造器内唯一的 `this.version(…)` 号一致。
 * Must match the single `this.version(…)` declared in `JieyuDexie`.
 */
export const JIEYU_DEXIE_TARGET_SCHEMA_VERSION = 1;

/**
 * 基线 stores（与旧 v54 最终结构等价；物理表 `orthography_transforms` 更名为 `orthography_bridges`）。
 * Baseline stores (≡ former v54 final shape; physical `orthography_transforms` renamed to `orthography_bridges`).
 */
export const JIEYU_BASELINE_STORES = {
  abbreviations: 'id, abbreviation',
  agent_artifacts: 'id, kind, uri, createdAt, adoptionItemId',
  ai_conversations: 'id, textId, updatedAt, archived',
  ai_messages: 'id, conversationId, [conversationId+createdAt], status, updatedAt',
  ai_session_memories: 'conversationId, updatedAt',
  ai_source_sets: 'id, status, boundSessionId, updatedAt',
  ai_task_snapshots: 'id, taskId, taskType, status, targetId, updatedAt',
  ai_tasks: 'id, taskType, status, targetId, createdAt, updatedAt',
  anchors: 'id, mediaId, [mediaId+time], time',
  audit_logs:
    'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp], requestId, [collection+field+requestId]',
  bibliographic_sources: 'id, citationKey',
  custom_field_definitions: 'id, sortOrder, updatedAt',
  embeddings: 'id, sourceType, sourceId, [sourceType+model], model, contentHash, createdAt',
  external_mcp_trust: 'id, origin, enabled, updatedAt',
  grammar_docs: 'id, updatedAt, parentId',
  language_aliases:
    'id, languageId, normalizedAlias, aliasType, locale, [languageId+normalizedAlias], [normalizedAlias+languageId], [languageId+aliasType], updatedAt',
  language_asset_overviews:
    'id, languageId, displayName, aliasCount, orthographyCount, bridgeCount, updatedAt',
  language_catalog_history: 'id, languageId, action, createdAt, [languageId+createdAt]',
  language_display_names:
    'id, languageId, locale, role, [languageId+locale], [languageId+role], [languageId+locale+role], [locale+value], updatedAt',
  languages:
    'id, languageCode, canonicalTag, iso6393, sourceType, reviewStatus, visibility, family, macrolanguage, updatedAt',
  layer_links:
    'id, transcriptionLayerKey, hostTranscriptionLayerId, layerId, [layerId+hostTranscriptionLayerId]',
  layer_unit_contents:
    'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
  layer_units:
    'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
  lexeme_asset_links: 'id, lexemeId, assetId, [lexemeId+assetId], createdAt',
  lexeme_assets:
    'id, kind, mimeType, displayName, languageCode, byteSize, refCount, createdAt, updatedAt',
  lexemes: 'id, updatedAt',
  locations: 'id, country, region',
  mcp_tool_call_audits: 'id, timestamp, toolName, outcome, [toolName+timestamp]',
  media_items: 'id, textId, createdAt',
  orthographies: 'id, languageId',
  orthography_bridges:
    'id, sourceOrthographyId, targetOrthographyId, [sourceOrthographyId+targetOrthographyId], engine, status, updatedAt',
  phonemes: 'id, languageId, type',
  project_ai_memories: 'id, projectId, [projectId+updatedAt], createdAt, updatedAt',
  scope_stats_snapshots:
    'id, scopeType, scopeKey, textId, mediaId, layerId, speakerId, [scopeType+scopeKey], [textId+scopeType], updatedAt',
  segment_meta:
    'id, segmentId, unitKind, textId, mediaId, layerId, hostUnitId, effectiveSpeakerId, effectiveSelfCertainty, annotationStatus, *noteCategoryKeys, [layerId+mediaId], [textId+layerId], [layerId+updatedAt], updatedAt',
  segment_quality_snapshots:
    'id, segmentId, textId, mediaId, layerId, severity, [layerId+mediaId], [textId+layerId], [layerId+severity], updatedAt',
  speaker_profile_snapshots: 'id, textId, speakerId, [textId+speakerId], updatedAt',
  speakers: 'id, updatedAt',
  structural_rule_profiles: 'id, scope, languageId, projectId, enabled, priority, updatedAt',
  tag_definitions: 'id, key',
  texts: 'id, updatedAt, languageCode',
  tier_annotations:
    'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime, startAnchorId, endAnchorId',
  tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
  token_lexeme_links: 'id, [targetType+targetId], lexemeId, [lexemeId+targetType]',
  track_entities: 'id, textId, mediaId, [textId+mediaId]',
  // 2B-D：导入来源（rev5 4.1），冻结点之前直接写进基线 | 2B-D import sources, added to the pre-freeze baseline
  source_records: 'id, textId, [textId+externalDocId], [textId+sha256], importBatchId, mediaId',
  translation_status_snapshots:
    'id, unitId, textId, mediaId, layerId, status, [layerId+mediaId], [textId+layerId], updatedAt',
  unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
  unit_relations:
    'id, textId, sourceUnitId, targetUnitId, relationType, unitId, [unitId+relationType], [sourceUnitId+relationType], [targetUnitId+relationType]',
  unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  user_notes: 'id, [targetType+targetId], [targetId+targetIndex], updatedAt',
} as const satisfies Record<string, string>;

export class JieyuDexie extends Dexie {
  texts!: Table<TextDocType, string>;
  media_items!: Table<MediaItemDocType, string>;
  unit_tokens!: Table<UnitTokenDocType, string>;
  unit_morphemes!: Table<UnitMorphemeDocType, string>;
  anchors!: Table<AnchorDocType, string>;
  lexemes!: Table<LexemeDocType, string>;
  token_lexeme_links!: Table<TokenLexemeLinkDocType, string>;
  lexeme_assets!: Table<LexemeAssetDocType, string>;
  lexeme_asset_links!: Table<LexemeAssetLinkDocType, string>;
  ai_tasks!: Table<AiTaskDoc, string>;
  embeddings!: Table<EmbeddingDoc, string>;
  ai_conversations!: Table<AiConversationDoc, string>;
  ai_messages!: Table<AiMessageDoc, string>;
  ai_session_memories!: Table<AiSessionMemoryDoc, string>;
  project_ai_memories!: Table<ProjectAiMemoryDoc, string>;
  mcp_tool_call_audits!: Table<McpToolCallAuditDoc, string>;
  external_mcp_trust!: Table<ExternalMcpTrustDoc, string>;
  agent_artifacts!: Table<AgentArtifactDoc, string>;
  languages!: Table<LanguageDocType, string>;
  language_display_names!: Table<LanguageDisplayNameDocType, string>;
  language_aliases!: Table<LanguageAliasDocType, string>;
  language_catalog_history!: Table<LanguageCatalogHistoryDocType, string>;
  custom_field_definitions!: Table<CustomFieldDefinitionDocType, string>;
  speakers!: Table<SpeakerDocType, string>;
  orthographies!: Table<OrthographyDocType, string>;
  orthography_bridges!: Table<OrthographyBridgeDocType, string>;
  locations!: Table<LocationDocType, string>;
  bibliographic_sources!: Table<BibliographicSourceDocType, string>;
  grammar_docs!: Table<GrammarDocDocType, string>;
  abbreviations!: Table<AbbreviationDocType, string>;
  structural_rule_profiles!: Table<StructuralRuleProfileAssetDocType, string>;
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
  segment_meta!: Table<SegmentMetaDocType, string>;
  segment_quality_snapshots!: Table<SegmentQualitySnapshotDocType, string>;
  scope_stats_snapshots!: Table<ScopeStatsSnapshotDocType, string>;
  speaker_profile_snapshots!: Table<SpeakerProfileSnapshotDocType, string>;
  translation_status_snapshots!: Table<TranslationStatusSnapshotDocType, string>;
  language_asset_overviews!: Table<LanguageAssetOverviewDocType, string>;
  ai_task_snapshots!: Table<AiTaskSnapshotDocType, string>;
  track_entities!: Table<TrackEntityDocType, string>;
  source_records!: Table<SourceRecordDocType, string>;
  ai_source_sets!: Table<AiSourceSetDoc, string>;

  constructor(name: string) {
    super(name);
    this.version(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).stores(JIEYU_BASELINE_STORES);
    // 4.4 统一写入校验：所有经 Dexie 的写入（含 table.put/bulkPut/update/modify）逐行校验。
    // 4.4 unified write validation for every Dexie write path.
    // 2B-B：目录行必须带项目归属，且不接受 `system.*` ID。| Catalog ownership + no `system.*` ids.
    this.use(createWriteValidationMiddleware(withCatalogOwnershipRules(JIEYU_TABLE_VALIDATORS)));
  }
}

/** 每张主库表的同步 zod 校验器（4.4）。新增表必须登记，否则类型检查失败。 */
export const JIEYU_TABLE_VALIDATORS: JieyuTableValidators<keyof typeof JIEYU_BASELINE_STORES> = {
  abbreviations: validateAbbreviationDoc,
  agent_artifacts: validateAgentArtifactDoc,
  ai_conversations: validateAiConversationDoc,
  ai_messages: validateAiMessageDoc,
  ai_session_memories: validateAiSessionMemoryDoc,
  ai_source_sets: validateAiSourceSetDoc,
  ai_task_snapshots: validateAiTaskSnapshotDoc,
  ai_tasks: validateAiTaskDoc,
  anchors: validateAnchorDoc,
  audit_logs: validateAuditLogDoc,
  bibliographic_sources: validateBibliographicSourceDoc,
  custom_field_definitions: validateCustomFieldDefinitionDoc,
  embeddings: validateEmbeddingDoc,
  external_mcp_trust: validateExternalMcpTrustDoc,
  grammar_docs: validateGrammarDoc,
  language_aliases: validateLanguageAliasDoc,
  language_asset_overviews: validateLanguageAssetOverviewDoc,
  language_catalog_history: validateLanguageCatalogHistoryDoc,
  language_display_names: validateLanguageDisplayNameDoc,
  languages: validateLanguageDoc,
  layer_links: validateLayerLinkDoc,
  layer_unit_contents: validateLayerUnitContentDoc,
  layer_units: validateLayerUnitDoc,
  lexeme_asset_links: validateLexemeAssetLinkDoc,
  lexeme_assets: validateLexemeAssetDoc,
  lexemes: validateLexemeDoc,
  locations: validateLocationDoc,
  mcp_tool_call_audits: validateMcpToolCallAuditDoc,
  media_items: validateMediaItemDoc,
  orthographies: validateOrthographyDoc,
  orthography_bridges: validateOrthographyBridgeDoc,
  phonemes: validatePhonemeDoc,
  project_ai_memories: validateProjectAiMemoryDoc,
  scope_stats_snapshots: validateScopeStatsSnapshotDoc,
  segment_meta: validateSegmentMetaDoc,
  segment_quality_snapshots: validateSegmentQualitySnapshotDoc,
  speaker_profile_snapshots: validateSpeakerProfileSnapshotDoc,
  speakers: validateSpeakerDoc,
  structural_rule_profiles: validateStructuralRuleProfileAssetDoc,
  tag_definitions: validateTagDefinitionDoc,
  texts: validateTextDoc,
  tier_annotations: validateTierAnnotationDoc,
  tier_definitions: validateTierDefinitionDoc,
  token_lexeme_links: validateTokenLexemeLinkDoc,
  track_entities: validateTrackEntityDoc,
  source_records: validateSourceRecordDoc,
  translation_status_snapshots: validateTranslationStatusSnapshotDoc,
  unit_morphemes: validateUnitMorphemeDoc,
  unit_relations: validateUnitRelationDoc,
  unit_tokens: validateUnitTokenDoc,
  user_notes: validateUserNoteDoc,
};

type GlobalWithJieyuDb = typeof globalThis & {
  __jieyuDbPromise__?: Promise<JieyuDatabase>;
  __jieyuDexie__?: JieyuDexie;
};

const globalWithDb = globalThis as GlobalWithJieyuDb;

function getOrCreateDexie(): JieyuDexie {
  if (!globalWithDb.__jieyuDexie__) {
    globalWithDb.__jieyuDexie__ = new JieyuDexie(JIEYU_DEXIE_DB_NAME);
  }
  return globalWithDb.__jieyuDexie__;
}

export type JieyuDatabase = {
  name: string;
  dexie: JieyuDexie;
  collections: JieyuCollections;
  close: () => Promise<void>;
};

const BACKUP_REMINDER_HOOK_TABLES = [
  'layer_units',
  'layer_unit_contents',
  'tier_annotations',
] as const;

function registerIndexedDbMutationBackupHooks(dexie: JieyuDexie): void {
  const tagged = dexie as unknown as { __jieyuBackupHooksRegistered?: boolean };
  if (tagged.__jieyuBackupHooksRegistered === true) {
    return;
  }
  tagged.__jieyuBackupHooksRegistered = true;
  const onMutate = () => {
    markBackupDirtySinceLastExport();
  };
  for (const tableName of BACKUP_REMINDER_HOOK_TABLES) {
    const table = dexie.table(tableName);
    table.hook('creating', onMutate);
    table.hook('updating', onMutate);
    table.hook('deleting', onMutate);
  }
}

class JieyuDatabaseOpenError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly recoveryHint: 'corrupted' | 'blocked' | 'unknown',
  ) {
    super(message);
    this.name = 'JieyuDatabaseOpenError';
  }
}

function dispatchDatabaseOpenFailureEvent(reason: JieyuDatabaseOpenError): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jieyu:db-open-failed', { detail: reason }));
    }
  } catch {
    // 事件派发失败不应阻断错误抛出 | Event dispatch failure must not swallow the DB error
  }
}

async function _createDb(): Promise<JieyuDatabase> {
  const dexie = getOrCreateDexie();
  try {
    await dexie.open();
  } catch (err) {
    let recoveryHint: JieyuDatabaseOpenError['recoveryHint'] = 'unknown';
    let message = 'Unable to open the local database; stored data may be corrupted.';
    if (err instanceof DOMException) {
      if (err.name === 'AbortError' || err.name === 'UnknownError') {
        recoveryHint = 'corrupted';
        message =
          'The database file may be corrupted or unsupported by this browser version. Export a backup before resetting.';
      }
    } else if (err instanceof Error) {
      if (err.message.includes('blocked')) {
        recoveryHint = 'blocked';
        message = 'The database is blocked by another tab. Close other Jieyu windows and refresh.';
      }
    }
    const openError = new JieyuDatabaseOpenError(message, err, recoveryHint);
    dispatchDatabaseOpenFailureEvent(openError);
    delete globalWithDb.__jieyuDbPromise__;
    throw openError;
  }
  registerIndexedDbMutationBackupHooks(dexie);

  const collections: JieyuCollections = {
    texts: new DexieCollectionAdapter(dexie.texts, validateTextDoc),
    media_items: new DexieCollectionAdapter(dexie.media_items, validateMediaItemDoc),
    unit_tokens: new DexieCollectionAdapter(dexie.unit_tokens, validateUnitTokenDoc),
    unit_morphemes: new DexieCollectionAdapter(dexie.unit_morphemes, validateUnitMorphemeDoc),
    anchors: new DexieCollectionAdapter(dexie.anchors, validateAnchorDoc),
    lexemes: new DexieCollectionAdapter(dexie.lexemes, validateLexemeDoc),
    token_lexeme_links: new DexieCollectionAdapter(
      dexie.token_lexeme_links,
      validateTokenLexemeLinkDoc,
    ),
    lexeme_assets: new DexieCollectionAdapter(dexie.lexeme_assets, validateLexemeAssetDoc),
    lexeme_asset_links: new DexieCollectionAdapter(
      dexie.lexeme_asset_links,
      validateLexemeAssetLinkDoc,
    ),
    ai_tasks: new DexieCollectionAdapter(dexie.ai_tasks, validateAiTaskDoc),
    embeddings: new DexieCollectionAdapter(dexie.embeddings, validateEmbeddingDoc),
    ai_conversations: new DexieCollectionAdapter(dexie.ai_conversations, validateAiConversationDoc),
    ai_messages: new DexieCollectionAdapter(dexie.ai_messages, validateAiMessageDoc),
    ai_session_memories: new DexieCollectionAdapter(
      dexie.ai_session_memories,
      validateAiSessionMemoryDoc,
    ),
    project_ai_memories: new DexieCollectionAdapter(
      dexie.project_ai_memories,
      validateProjectAiMemoryDoc,
    ),
    mcp_tool_call_audits: new DexieCollectionAdapter(
      dexie.mcp_tool_call_audits,
      validateMcpToolCallAuditDoc,
    ),
    external_mcp_trust: new DexieCollectionAdapter(
      dexie.external_mcp_trust,
      validateExternalMcpTrustDoc,
    ),
    agent_artifacts: new DexieCollectionAdapter(dexie.agent_artifacts, validateAgentArtifactDoc),
    languages: new DexieCollectionAdapter(dexie.languages, validateLanguageDoc),
    language_display_names: new DexieCollectionAdapter(
      dexie.language_display_names,
      validateLanguageDisplayNameDoc,
    ),
    language_aliases: new DexieCollectionAdapter(dexie.language_aliases, validateLanguageAliasDoc),
    language_catalog_history: new DexieCollectionAdapter(
      dexie.language_catalog_history,
      validateLanguageCatalogHistoryDoc,
    ),
    custom_field_definitions: new DexieCollectionAdapter(
      dexie.custom_field_definitions,
      validateCustomFieldDefinitionDoc,
    ),
    speakers: new DexieCollectionAdapter(dexie.speakers, validateSpeakerDoc),
    orthographies: new DexieCollectionAdapter(dexie.orthographies, validateOrthographyDoc),
    orthography_bridges: new DexieCollectionAdapter(
      dexie.orthography_bridges,
      validateOrthographyBridgeDoc,
    ),
    locations: new DexieCollectionAdapter(dexie.locations, validateLocationDoc),
    bibliographic_sources: new DexieCollectionAdapter(
      dexie.bibliographic_sources,
      validateBibliographicSourceDoc,
    ),
    grammar_docs: new DexieCollectionAdapter(dexie.grammar_docs, validateGrammarDoc),
    abbreviations: new DexieCollectionAdapter(dexie.abbreviations, validateAbbreviationDoc),
    structural_rule_profiles: new DexieCollectionAdapter(
      dexie.structural_rule_profiles,
      validateStructuralRuleProfileAssetDoc,
    ),
    phonemes: new DexieCollectionAdapter(dexie.phonemes, validatePhonemeDoc),
    tag_definitions: new DexieCollectionAdapter(dexie.tag_definitions, validateTagDefinitionDoc),
    layers: new TierBackedLayerCollectionAdapter(dexie.tier_definitions, validateLayerDoc),
    layer_units: new DexieCollectionAdapter(dexie.layer_units, validateLayerUnitDoc),
    layer_unit_contents: new DexieCollectionAdapter(
      dexie.layer_unit_contents,
      validateLayerUnitContentDoc,
    ),
    unit_relations: new DexieCollectionAdapter(dexie.unit_relations, validateUnitRelationDoc),
    layer_links: new DexieCollectionAdapter(dexie.layer_links, validateLayerLinkDoc),
    tier_definitions: new DexieCollectionAdapter(dexie.tier_definitions, validateTierDefinitionDoc),
    tier_annotations: new DexieCollectionAdapter(dexie.tier_annotations, validateTierAnnotationDoc),
    audit_logs: new DexieCollectionAdapter(dexie.audit_logs, validateAuditLogDoc),
    user_notes: new DexieCollectionAdapter(dexie.user_notes, validateUserNoteDoc),
    segment_meta: new DexieCollectionAdapter(dexie.segment_meta, validateSegmentMetaDoc),
    segment_quality_snapshots: new DexieCollectionAdapter(
      dexie.segment_quality_snapshots,
      validateSegmentQualitySnapshotDoc,
    ),
    scope_stats_snapshots: new DexieCollectionAdapter(
      dexie.scope_stats_snapshots,
      validateScopeStatsSnapshotDoc,
    ),
    speaker_profile_snapshots: new DexieCollectionAdapter(
      dexie.speaker_profile_snapshots,
      validateSpeakerProfileSnapshotDoc,
    ),
    translation_status_snapshots: new DexieCollectionAdapter(
      dexie.translation_status_snapshots,
      validateTranslationStatusSnapshotDoc,
    ),
    language_asset_overviews: new DexieCollectionAdapter(
      dexie.language_asset_overviews,
      validateLanguageAssetOverviewDoc,
    ),
    ai_task_snapshots: new DexieCollectionAdapter(
      dexie.ai_task_snapshots,
      validateAiTaskSnapshotDoc,
    ),
    track_entities: new DexieCollectionAdapter(dexie.track_entities, validateTrackEntityDoc),
    source_records: new DexieCollectionAdapter(dexie.source_records, validateSourceRecordDoc),
    ai_source_sets: new DexieCollectionAdapter(dexie.ai_source_sets, validateAiSourceSetDoc),
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

/**
 * 测试 / 开发场景：关闭 `getDb()` 缓存的 `JieyuDatabase` 与底层 Dexie，并清空单例 Promise。下一次 `getDb()` 会重新 `_createDb()`；`import { db } from '…/db'` 仍指向同一 Dexie 单例，测试里通常应再 `await db.open()`。生产路径勿调用。
 * Tests/dev: clear `getDb` memo + close underlying Dexie. Next `getDb()` rebuilds `JieyuDatabase`; the `db` import remains the same Dexie instance; call `await db.open()` in tests as needed. Do not use in production.
 */
export async function resetJieyuDatabaseSingletonForTests(): Promise<void> {
  if (globalWithDb.__jieyuDbPromise__) {
    try {
      const jieyu = await globalWithDb.__jieyuDbPromise__;
      await jieyu.close();
    } catch {
      // ignore: rejected init or double-close
    }
    delete globalWithDb.__jieyuDbPromise__;
  }
  const dexie = getOrCreateDexie();
  if (dexie.isOpen()) {
    try {
      dexie.close();
    } catch {
      // ignore
    }
  }
}

export const db = getOrCreateDexie();
