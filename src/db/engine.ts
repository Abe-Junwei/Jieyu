/**
 * Dexie 数据库引擎 | Dexie database engine
 *
 * 绿场基线（Batch 2A）：主库 `jieyu` 只声明 `version(1)`，结构与旧库 v54 最终形态等价。
 * 冻结点（D14）之前不写 upgrader；切片加字段时可直接抬升版本号并重置开发数据。
 * Greenfield baseline (Batch 2A): main DB `jieyu` declares only `version(1)`, structurally
 * equivalent to the former v54 final shape. No upgraders before the freeze point (D14).
 */
import Dexie, { type DexieOptions, type Table } from 'dexie';
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
  AnnotationDocumentDocType,
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
  validateAnnotationDocumentDoc,
  validateAiSourceSetDoc,
} from './schemas';
import { DexieCollectionAdapter, TierBackedLayerCollectionAdapter } from './adapter';
import { markBackupDirtySinceLastExport } from '../utils/backupExportReminderState';
import {
  createWriteValidationMiddleware,
  type JieyuTableValidators,
} from './writeValidationMiddleware';
import { withCatalogOwnershipRules } from './catalogOwnership';
import { createOwnershipImmutabilityMiddleware } from './ownershipImmutabilityMiddleware';
import { createLexemeNestedIdsMiddleware } from './lexemeNestedIdsMiddleware';
import { JIEYU_OWNERSHIP_IMMUTABLE_FIELDS } from './ownershipImmutabilityRules';
import { JIEYU_BASELINE_STORES } from './baselineStores';
import {
  applyJieyuSchemaVersions,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION as SCHEMA_TARGET,
  JIEYU_SCHEMA_VERSIONS,
  type JieyuSchemaVersion,
} from './migration/schemaVersions';
import { JIEYU_DATA_FROZEN } from '../config/dataFreeze';
import { resolveMigrationPolicy } from './migration/migrationPolicy';
import { JieyuMigrationGateError, openThroughMigrationGate } from './migration/migrationGate';
import { publishMigrationGateStatus } from './migration/migrationGateStatus';
import {
  createUpgradeGuardedFactory,
  defaultChannelFactory,
  installStaleConnectionHandlers,
  UpgradeGuard,
} from './migration/upgradeCoordinator';

/**
 * IndexedDB 物理库名（D10）。旧库 `jieyudb_v2` 不再打开，由启动时的旧数据提示负责删除。
 * Physical IndexedDB name (D10). Legacy `jieyudb_v2` is never opened; the legacy-data prompt deletes it.
 */
export const JIEYU_DEXIE_DB_NAME = 'jieyu' as const;

export {
  JIEYU_BASELINE_STORES,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
} from './migration/schemaVersions';

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
  annotation_documents!: Table<AnnotationDocumentDocType, string>;
  ai_source_sets!: Table<AiSourceSetDoc, string>;

  /**
   * `versions` 只给原始快照转换器的测试用（合成账本）；主库永远用 `JIEYU_SCHEMA_VERSIONS`。
   * `versions` exists for raw-snapshot converter tests (synthetic ledgers); the main DB always uses
   * `JIEYU_SCHEMA_VERSIONS`.
   */
  constructor(
    name: string,
    options?: DexieOptions,
    versions: readonly JieyuSchemaVersion[] = JIEYU_SCHEMA_VERSIONS,
  ) {
    super(name, options);
    // 4a：版本声明集中在 schemaVersions 账本（分级、冻结检查都从那里读）。
    // 4a: version declarations live in the schemaVersions ledger (tiering + freeze check read it).
    applyJieyuSchemaVersions(this, versions);
    // 4.4 统一写入校验：所有经 Dexie 的写入（含 table.put/bulkPut/update/modify）逐行校验。
    // 4.4 unified write validation for every Dexie write path.
    // 2B-B：目录行必须带项目归属，且不接受 `system.*` ID。| Catalog ownership + no `system.*` ids.
    this.use(createWriteValidationMiddleware(withCatalogOwnershipRules(JIEYU_TABLE_VALIDATORS)));
    // JY-23：词条嵌套 id 由独立中间件显式补齐（level 11，位于 zod 校验之上）；校验器本身无副作用。
    // JY-23: lexeme nested ids are filled by a dedicated middleware above zod; validators stay pure.
    this.use(createLexemeNestedIdsMiddleware());
    // 2B-G / JY-03：已有行的项目归属与父引用不可改写（level 1，位于 hooks 与 zod 校验之下）。
    // 2B-G / JY-03: existing rows keep their project and parent refs (level 1, below hooks and zod).
    this.use(createOwnershipImmutabilityMiddleware(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS));
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
  annotation_documents: validateAnnotationDocumentDoc,
  translation_status_snapshots: validateTranslationStatusSnapshotDoc,
  unit_morphemes: validateUnitMorphemeDoc,
  unit_relations: validateUnitRelationDoc,
  unit_tokens: validateUnitTokenDoc,
  user_notes: validateUserNoteDoc,
};

type GlobalWithJieyuDb = typeof globalThis & {
  __jieyuDbPromise__?: Promise<JieyuDatabase>;
  __jieyuDexie__?: JieyuDexie;
  __jieyuUpgradeGuard__?: UpgradeGuard;
};

const globalWithDb = globalThis as GlobalWithJieyuDb;

/** 原生 IDBFactory（与 Dexie 默认依赖一致）| Native IDBFactory (same as Dexie's default dependency) */
function nativeIndexedDb(): IDBFactory {
  const factory = Dexie.dependencies.indexedDB as IDBFactory | undefined;
  if (factory === undefined) throw new Dexie.MissingAPIError('IndexedDB API missing');
  return factory;
}

/** 4a：主库升级守卫，只有迁移闸门放行的升级才能执行 | 4a: only gate-armed upgrades may run */
function getUpgradeGuard(): UpgradeGuard {
  if (!globalWithDb.__jieyuUpgradeGuard__) {
    globalWithDb.__jieyuUpgradeGuard__ = new UpgradeGuard({
      dbName: JIEYU_DEXIE_DB_NAME,
      codeTargetVersion: SCHEMA_TARGET,
      frozen: JIEYU_DATA_FROZEN,
    });
  }
  return globalWithDb.__jieyuUpgradeGuard__;
}

function dataNewerThanAppError(installedVersion: number): JieyuMigrationGateError {
  return new JieyuMigrationGateError({
    reason: 'data-newer-than-app',
    dbName: JIEYU_DEXIE_DB_NAME,
    installedVersion,
    targetVersion: SCHEMA_TARGET,
    message: `Local data is at schema v${installedVersion}, newer than this app (v${SCHEMA_TARGET}). Update the app; the database was not opened.`,
    offerRawExport: resolveMigrationPolicy().rawRecoveryExport,
  });
}

function installMainDbSafetyHandlers(dexie: JieyuDexie): void {
  // 绕过闸门的自动打开也不能使用比代码新的数据 | auto-open must not use data newer than the code
  dexie.on(
    'ready',
    () => {
      const native = dexie.backendDB()?.version ?? 0;
      const installed = Math.floor(native / 10);
      if (installed > SCHEMA_TARGET) {
        const error = dataNewerThanAppError(installed);
        publishMigrationGateStatus({ kind: 'gate-failed', detail: error.detail });
        throw error;
      }
    },
    true,
  );
  if (resolveMigrationPolicy().versionChangeHandler) {
    installStaleConnectionHandlers(dexie, {
      onStale: (reason) => publishMigrationGateStatus({ kind: 'stale', reason }),
      channelFactory: (name) =>
        typeof window === 'undefined' ? null : defaultChannelFactory(name),
    });
  }
}

function getOrCreateDexie(): JieyuDexie {
  if (!globalWithDb.__jieyuDexie__) {
    const dexie = new JieyuDexie(JIEYU_DEXIE_DB_NAME, {
      indexedDB: createUpgradeGuardedFactory(nativeIndexedDb, getUpgradeGuard()),
    });
    installMainDbSafetyHandlers(dexie);
    globalWithDb.__jieyuDexie__ = dexie;
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
    // 4a：经过迁移闸门打开（版本检测、分级、快照、多标签页协调）| open through the 4a migration gate
    const outcome = await openThroughMigrationGate({
      dexie,
      dbName: JIEYU_DEXIE_DB_NAME,
      versions: JIEYU_SCHEMA_VERSIONS,
      guard: getUpgradeGuard(),
      factory: nativeIndexedDb(),
      policy: resolveMigrationPolicy(),
    });
    if (outcome.warning !== undefined) {
      publishMigrationGateStatus({ kind: 'warning', warning: outcome.warning });
    }
  } catch (err) {
    if (err instanceof JieyuMigrationGateError) {
      publishMigrationGateStatus({ kind: 'gate-failed', detail: err.detail });
      delete globalWithDb.__jieyuDbPromise__;
      throw err;
    }
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
  return wrapJieyuDexie(dexie);
}

/**
 * 给一个已打开的 `JieyuDexie` 配上集合适配器（主库与原始快照转换器的临时库共用）。
 * Attach the collection adapters to an opened `JieyuDexie` (main DB and the converter's temp DB).
 */
export function wrapJieyuDexie(dexie: JieyuDexie): JieyuDatabase {
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
    annotation_documents: new DexieCollectionAdapter(
      dexie.annotation_documents,
      validateAnnotationDocumentDoc,
    ),
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
