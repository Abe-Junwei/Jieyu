/**
 * 主库表与本地库的唯一登记处（rev5 6.3 / 7.5）| Single registry for main-DB tables and local DBs
 *
 * “目录表清单”和 JYB 数据分类表合并在这里：写入校验、删除项目、项目快照、JYB 分类都从这里派生。
 * 新增主库表必须在这里登记分类，否则类型检查（Record 完整性）与 `tableRegistry.test.ts` 都会失败。
 * Catalog-table list and JYB data classification live together; new tables must be registered here.
 */
import type { JIEYU_BASELINE_STORES } from './engine';

export type JieyuMainTableName = keyof typeof JIEYU_BASELINE_STORES;

/** rev5 7.5 数据分类 | rev5 7.5 data classes */
export type JieyuDataClass =
  | 'project_content'
  | 'project_catalog'
  | 'project_ai'
  | 'derived'
  | 'audit_log'
  | 'credential'
  | 'user_preference'
  | 'collab_state'
  | 'recovery'
  | 'private_log';

export type JieyuTableRegistration = {
  dataClass: JieyuDataClass;
  /** 目录表的项目归属字段 | Project ownership field of catalog tables */
  ownerField?: 'textId' | 'projectId';
};

export const JIEYU_MAIN_TABLE_REGISTRY: Record<JieyuMainTableName, JieyuTableRegistration> = {
  // 项目内容 | project content
  texts: { dataClass: 'project_content' },
  media_items: { dataClass: 'project_content' },
  layer_units: { dataClass: 'project_content' },
  layer_unit_contents: { dataClass: 'project_content' },
  unit_relations: { dataClass: 'project_content' },
  unit_tokens: { dataClass: 'project_content' },
  unit_morphemes: { dataClass: 'project_content' },
  token_lexeme_links: { dataClass: 'project_content' },
  anchors: { dataClass: 'project_content' },
  layer_links: { dataClass: 'project_content' },
  tier_definitions: { dataClass: 'project_content' },
  tier_annotations: { dataClass: 'project_content' },
  user_notes: { dataClass: 'project_content' },
  segment_meta: { dataClass: 'project_content' },
  track_entities: { dataClass: 'project_content' },
  // 项目目录（顺序即删除 / 快照裁剪顺序）| project catalog (order = prune order)
  speakers: { dataClass: 'project_catalog', ownerField: 'textId' },
  lexemes: { dataClass: 'project_catalog', ownerField: 'textId' },
  lexeme_assets: { dataClass: 'project_catalog', ownerField: 'textId' },
  lexeme_asset_links: { dataClass: 'project_catalog', ownerField: 'textId' },
  languages: { dataClass: 'project_catalog', ownerField: 'textId' },
  language_display_names: { dataClass: 'project_catalog', ownerField: 'textId' },
  language_aliases: { dataClass: 'project_catalog', ownerField: 'textId' },
  language_catalog_history: { dataClass: 'project_catalog', ownerField: 'textId' },
  custom_field_definitions: { dataClass: 'project_catalog', ownerField: 'textId' },
  orthographies: { dataClass: 'project_catalog', ownerField: 'textId' },
  orthography_bridges: { dataClass: 'project_catalog', ownerField: 'textId' },
  locations: { dataClass: 'project_catalog', ownerField: 'textId' },
  bibliographic_sources: { dataClass: 'project_catalog', ownerField: 'textId' },
  grammar_docs: { dataClass: 'project_catalog', ownerField: 'textId' },
  abbreviations: { dataClass: 'project_catalog', ownerField: 'textId' },
  phonemes: { dataClass: 'project_catalog', ownerField: 'textId' },
  tag_definitions: { dataClass: 'project_catalog', ownerField: 'textId' },
  structural_rule_profiles: { dataClass: 'project_catalog', ownerField: 'projectId' },
  // 项目级 AI 记忆与历史 | project AI memory & history
  ai_conversations: { dataClass: 'project_ai' },
  ai_messages: { dataClass: 'project_ai' },
  ai_session_memories: { dataClass: 'project_ai' },
  project_ai_memories: { dataClass: 'project_ai' },
  ai_tasks: { dataClass: 'project_ai' },
  ai_task_snapshots: { dataClass: 'project_ai' },
  agent_artifacts: { dataClass: 'project_ai' },
  ai_source_sets: { dataClass: 'project_ai' },
  // 派生数据 | derived
  embeddings: { dataClass: 'derived' },
  segment_quality_snapshots: { dataClass: 'derived' },
  scope_stats_snapshots: { dataClass: 'derived' },
  speaker_profile_snapshots: { dataClass: 'derived' },
  translation_status_snapshots: { dataClass: 'derived' },
  language_asset_overviews: { dataClass: 'derived' },
  // 审计日志 | audit logs
  audit_logs: { dataClass: 'audit_log' },
  mcp_tool_call_audits: { dataClass: 'audit_log' },
  // 安全信任决定，按凭据处理（不进 JYB）| trust decisions are treated like credentials
  external_mcp_trust: { dataClass: 'credential' },
};

/** 是否进入 JYB（第 3 批实现，T53 验证）| Included in JYB (batch 3, verified by T53) */
export const JIEYU_DATA_CLASS_IN_JYB: Record<JieyuDataClass, boolean> = {
  project_content: true,
  project_catalog: true,
  project_ai: true,
  user_preference: true,
  derived: false,
  audit_log: false,
  credential: false,
  collab_state: false,
  recovery: false,
  private_log: false,
};

/** 8.1 重置策略 | 8.1 reset policy */
export type JieyuLocalDbResetPolicy = 'main' | 'prompt_delete' | 'keep';

export type JieyuLocalDbRegistration = {
  dataClass: JieyuDataClass | 'legacy_main';
  resetPolicy: JieyuLocalDbResetPolicy;
};

/** 应用使用或曾经使用的全部 IndexedDB 库 | Every IndexedDB database the app uses or used */
export const JIEYU_LOCAL_DB_REGISTRY = {
  jieyu: { dataClass: 'project_content', resetPolicy: 'main' },
  jieyudb_v2: { dataClass: 'legacy_main', resetPolicy: 'prompt_delete' },
  jieyu_pre_migration_backups: { dataClass: 'recovery', resetPolicy: 'prompt_delete' },
  jieyu_recovery: { dataClass: 'recovery', resetPolicy: 'prompt_delete' },
  'jieyu-project-memory': { dataClass: 'project_ai', resetPolicy: 'prompt_delete' },
  jieyu_collab_client_state: { dataClass: 'collab_state', resetPolicy: 'prompt_delete' },
  'jieyu-voice-sessions': { dataClass: 'private_log', resetPolicy: 'keep' },
  'jieyu-user-behavior': { dataClass: 'private_log', resetPolicy: 'keep' },
  'jieyu-acoustic-analysis': { dataClass: 'derived', resetPolicy: 'keep' },
} as const satisfies Record<string, JieyuLocalDbRegistration>;

export type JieyuLocalDbName = keyof typeof JIEYU_LOCAL_DB_REGISTRY;

function tablesWhere(
  predicate: (registration: JieyuTableRegistration) => boolean,
): JieyuMainTableName[] {
  return (Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]).filter((name) =>
    predicate(JIEYU_MAIN_TABLE_REGISTRY[name]),
  );
}

/** 全部项目目录表 | All project catalog tables */
export const PROJECT_CATALOG_TABLES: readonly JieyuMainTableName[] = tablesWhere(
  (r) => r.dataClass === 'project_catalog',
);

/** 以 `textId` 记录归属的目录表（删除项目、快照裁剪用）| Catalog tables owned via `textId` */
export const PROJECT_CATALOG_TEXT_ID_TABLES: readonly JieyuMainTableName[] = tablesWhere(
  (r) => r.dataClass === 'project_catalog' && r.ownerField === 'textId',
);

/** 8.1：提示后删除的库 | 8.1: databases deleted after the user confirms */
export const LEGACY_RESET_DB_NAMES: readonly JieyuLocalDbName[] = (
  Object.keys(JIEYU_LOCAL_DB_REGISTRY) as JieyuLocalDbName[]
).filter((name) => JIEYU_LOCAL_DB_REGISTRY[name].resetPolicy === 'prompt_delete');
