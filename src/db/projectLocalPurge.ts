/**
 * 删除本机项目数据的唯一入口（rev5 N6 本地部分，T21）。
 * The single entry for removing a project's local rows (rev5 N6, local part; T21).
 *
 * 两种模式共用同一套「哪些行属于这个项目」的判断：
 * - `delete-project`：删除项目。主库中与该项目相关的行全部删除，包括 AI 对话 / 记忆 / 任务、
 *   派生缓存、嵌入、审计日志里指向这些行的记录。
 * - `replace-content`：协同项目快照导入前的清空。只删快照会重新写入的那些数据类（项目内容、目录），
 *   本机的 AI 记录、嵌入与审计日志保留。
 * Both modes share one definition of "rows owned by this project". `delete-project` removes every
 * main-DB row tied to the project (AI conversations / memories / tasks, derived caches, embeddings,
 * audit entries for the deleted rows); `replace-content` (before a project snapshot import) only
 * removes the data classes the snapshot writes back.
 *
 * 不覆盖（无法归属到项目，或不属于主库）：`agent_artifacts`、`mcp_tool_call_audits`、
 * `external_mcp_trust`；其他 IndexedDB 库、协作队列与 localStorage 留给 2C。
 * Not covered (cannot be attributed to a project, or not in the main DB): agent_artifacts,
 * mcp_tool_call_audits, external_mcp_trust; other IndexedDB databases, the collaboration queue and
 * localStorage are left for 2C.
 *
 * 必须在包含 `projectPurgeStores(dexie, mode)` 全部表的读写事务里调用。
 * Must run inside a read-write transaction over all of `projectPurgeStores(dexie, mode)`.
 */
import type { Table } from 'dexie';
import type { JieyuDatabase } from './engine';
import type { UserNoteDocType } from './types';
import {
  JIEYU_MAIN_TABLE_REGISTRY,
  PROJECT_CATALOG_TEXT_ID_TABLES,
  type JieyuDataClass,
  type JieyuMainTableName,
} from './tableRegistry';

type JieyuDexieHandle = JieyuDatabase['dexie'];

export type ProjectPurgeMode = 'delete-project' | 'replace-content';

/** 无法归属到项目的主库表 | Main-DB tables that cannot be attributed to a project */
export const PROJECT_PURGE_UNATTRIBUTABLE_TABLES: ReadonlySet<JieyuMainTableName> = new Set([
  'agent_artifacts',
  'mcp_tool_call_audits',
  'external_mcp_trust',
]);

/** 快照导入前清空时保留的数据类 | Data classes kept when clearing before a snapshot import */
const KEPT_ON_REPLACE_CONTENT: ReadonlySet<JieyuDataClass> = new Set<JieyuDataClass>([
  'project_ai',
  'audit_log',
  'credential',
]);
/** 快照导入前清空时保留的派生表（快照不含它们，留给各自的失效逻辑）| Derived tables kept on replace */
const DERIVED_KEPT_ON_REPLACE_CONTENT: ReadonlySet<JieyuMainTableName> = new Set([
  'embeddings',
  'language_asset_overviews',
]);

/** 该模式会触及的表（从表登记处派生）| Tables touched in this mode (derived from the registry) */
export function projectPurgeTableNames(mode: ProjectPurgeMode): JieyuMainTableName[] {
  return (Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[]).filter((name) => {
    if (PROJECT_PURGE_UNATTRIBUTABLE_TABLES.has(name)) return false;
    if (mode === 'delete-project') return true;
    const { dataClass } = JIEYU_MAIN_TABLE_REGISTRY[name];
    return !KEPT_ON_REPLACE_CONTENT.has(dataClass) && !DERIVED_KEPT_ON_REPLACE_CONTENT.has(name);
  });
}

export function projectPurgeStores(
  dexie: JieyuDexieHandle,
  mode: ProjectPurgeMode,
): Array<Table<any, any, any>> {
  return projectPurgeTableNames(mode).map((name) => dexie.table(name));
}

/** 判断备注是否属于项目所需的行集合 | Row-id sets used to attribute notes to a project */
export type ProjectOwnedIds = {
  projectId: string;
  unitIds: ReadonlySet<string>;
  tokenIds: ReadonlySet<string>;
  morphemeIds: ReadonlySet<string>;
  contentIds: ReadonlySet<string>;
  annotationIds: ReadonlySet<string>;
  lexemeIds: ReadonlySet<string>;
  layerIds: ReadonlySet<string>;
};

/**
 * 备注归属（R-SCOPED-NOTES）：快照导出与删除项目共用。
 * Note ownership (R-SCOPED-NOTES), shared by snapshot export and project deletion.
 */
export function noteBelongsToProject(
  note: Pick<UserNoteDocType, 'targetType' | 'targetId' | 'parentTargetId'>,
  owned: ProjectOwnedIds,
): boolean {
  const targetId = note.targetId;
  switch (note.targetType) {
    case 'text':
      return targetId === owned.projectId;
    case 'unit':
      return owned.unitIds.has(targetId);
    case 'token':
      return owned.tokenIds.has(targetId);
    case 'morpheme':
      return owned.morphemeIds.has(targetId);
    case 'translation':
      return owned.contentIds.has(targetId);
    case 'annotation':
      return owned.annotationIds.has(targetId);
    case 'lexeme':
      return owned.lexemeIds.has(targetId);
    case 'sense':
      return note.parentTargetId !== undefined && owned.lexemeIds.has(note.parentTargetId);
    case 'tier_annotation': {
      if (owned.annotationIds.has(targetId)) return true;
      const [unitPart, layerPart] = targetId.split('::');
      return (
        (unitPart !== undefined && owned.unitIds.has(unitPart)) ||
        (layerPart !== undefined && owned.layerIds.has(layerPart))
      );
    }
    default:
      return false;
  }
}

function idSet(rows: ReadonlyArray<{ id: string }>): Set<string> {
  return new Set(rows.map((row) => row.id));
}

/**
 * 删除项目在主库中的行；返回被删行的 id（含项目 id）。
 * Remove the project's main-DB rows; returns the deleted row ids (including the project id).
 */
export async function purgeProjectRows(
  dexie: JieyuDexieHandle,
  textId: string,
  mode: ProjectPurgeMode,
): Promise<Set<string>> {
  const projectId = textId.trim();
  if (projectId.length === 0) throw new Error('purgeProjectRows requires a non-empty textId');
  const deleted = new Set<string>([projectId]);
  const remember = (ids: Iterable<string>) => {
    for (const id of ids) deleted.add(id);
  };

  // —— 收集归属 | collect ownership ——
  const units = await dexie.layer_units.where('textId').equals(projectId).toArray();
  const unitIds = idSet(units);
  const tokens = await dexie.unit_tokens.where('textId').equals(projectId).toArray();
  const morphemes = await dexie.unit_morphemes.where('textId').equals(projectId).toArray();
  const tokenIds = idSet(tokens);
  const morphemeIds = idSet(morphemes);
  const tiers = await dexie.tier_definitions.where('textId').equals(projectId).toArray();
  const layerIds = idSet(tiers);
  const media = await dexie.media_items.where('textId').equals(projectId).toArray();
  const mediaIds = idSet(media);
  const contents = [
    ...(await dexie.layer_unit_contents.where('textId').equals(projectId).toArray()),
    ...(unitIds.size > 0
      ? await dexie.layer_unit_contents
          .where('unitId')
          .anyOf([...unitIds])
          .toArray()
      : []),
  ];
  const contentIds = idSet(contents);
  const annotations =
    layerIds.size > 0
      ? await dexie.tier_annotations
          .where('tierId')
          .anyOf([...layerIds])
          .toArray()
      : [];
  const annotationIds = idSet(annotations);
  const lexemeIds = idSet(await dexie.lexemes.filter((row) => row.textId === projectId).toArray());
  const owned: ProjectOwnedIds = {
    projectId,
    unitIds,
    tokenIds,
    morphemeIds,
    contentIds,
    annotationIds,
    lexemeIds,
    layerIds,
  };

  // —— 备注与词条链接 | notes and lexeme links ——
  const notes = await dexie.user_notes
    .filter((note) => noteBelongsToProject(note, owned))
    .toArray();
  remember(notes.map((note) => note.id));
  await dexie.user_notes.bulkDelete(notes.map((note) => note.id));

  const linkTargets: Array<[string, string]> = [
    ...[...tokenIds].map((id) => ['token', id] as [string, string]),
    ...[...morphemeIds].map((id) => ['morpheme', id] as [string, string]),
  ];
  const lexemeLinks = [
    ...(linkTargets.length > 0
      ? await dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).toArray()
      : []),
    ...(lexemeIds.size > 0
      ? await dexie.token_lexeme_links
          .where('lexemeId')
          .anyOf([...lexemeIds])
          .toArray()
      : []),
  ];
  remember(lexemeLinks.map((row) => row.id));
  await dexie.token_lexeme_links.bulkDelete(lexemeLinks.map((row) => row.id));

  // —— 单元图 | unit graph ——
  remember(contentIds);
  await dexie.layer_unit_contents.bulkDelete([...contentIds]);
  const relations = await dexie.unit_relations.where('textId').equals(projectId).toArray();
  remember(relations.map((row) => row.id));
  await dexie.unit_relations.bulkDelete(relations.map((row) => row.id));
  remember(tokenIds);
  await dexie.unit_tokens.bulkDelete([...tokenIds]);
  remember(morphemeIds);
  await dexie.unit_morphemes.bulkDelete([...morphemeIds]);
  remember(unitIds);
  await dexie.layer_units.bulkDelete([...unitIds]);

  // —— 层、链接、轨道 | layers, links, tracks ——
  remember(annotationIds);
  await dexie.tier_annotations.bulkDelete([...annotationIds]);
  if (layerIds.size > 0) {
    const layerLinks = await dexie.layer_links
      .filter((link) => layerIds.has(link.hostTranscriptionLayerId) || layerIds.has(link.layerId))
      .toArray();
    remember(layerLinks.map((row) => row.id));
    await dexie.layer_links.bulkDelete(layerLinks.map((row) => row.id));
  }
  remember(layerIds);
  await dexie.tier_definitions.bulkDelete([...layerIds]);
  if (mediaIds.size > 0) {
    const anchors = await dexie.anchors
      .where('mediaId')
      .anyOf([...mediaIds])
      .toArray();
    remember(anchors.map((row) => row.id));
    await dexie.anchors.bulkDelete(anchors.map((row) => row.id));
  }
  remember(mediaIds);
  await dexie.media_items.bulkDelete([...mediaIds]);

  // —— 带 textId 的其他内容与派生表 | other textId content and derived tables ——
  for (const name of [
    'segment_meta',
    'segment_quality_snapshots',
    'speaker_profile_snapshots',
    'translation_status_snapshots',
    'track_entities',
    'source_records',
    'annotation_documents',
  ] as const) {
    const table = dexie.table<{ id: string }, string>(name);
    const ids = (await table.where('textId').equals(projectId).primaryKeys()) as string[];
    remember(ids);
    await table.bulkDelete(ids);
  }
  const scopeStats = await dexie.scope_stats_snapshots
    .filter((row) => row.textId === projectId || row.scopeKey === projectId)
    .toArray();
  remember(scopeStats.map((row) => row.id));
  await dexie.scope_stats_snapshots.bulkDelete(scopeStats.map((row) => row.id));

  // —— 目录 | catalog ——
  const languageIds = new Set<string>();
  for (const name of PROJECT_CATALOG_TEXT_ID_TABLES) {
    const table = dexie.table<{ id: string; textId?: string }, string>(name);
    const stale = await table.filter((row) => row.textId === projectId).toArray();
    if (name === 'languages') for (const row of stale) languageIds.add(row.id);
    remember(stale.map((row) => row.id));
    await table.bulkDelete(stale.map((row) => row.id));
  }
  const profiles = await dexie.structural_rule_profiles
    .filter((row) => row.projectId === projectId)
    .toArray();
  remember(profiles.map((row) => row.id));
  await dexie.structural_rule_profiles.bulkDelete(profiles.map((row) => row.id));

  if (mode === 'delete-project') {
    await purgeProjectAiAndDerived(dexie, projectId, { deleted, mediaIds, layerIds, languageIds });
  }

  await dexie.texts.delete(projectId);
  return deleted;
}

async function purgeProjectAiAndDerived(
  dexie: JieyuDexieHandle,
  projectId: string,
  scope: {
    deleted: Set<string>;
    mediaIds: ReadonlySet<string>;
    layerIds: ReadonlySet<string>;
    languageIds: ReadonlySet<string>;
  },
): Promise<void> {
  const { deleted } = scope;
  const conversations = await dexie.ai_conversations.where('textId').equals(projectId).toArray();
  const conversationIds = conversations.map((row) => row.id);
  if (conversationIds.length > 0) {
    await dexie.ai_messages.where('conversationId').anyOf(conversationIds).delete();
    await dexie.ai_session_memories.bulkDelete(conversationIds);
    await dexie.ai_conversations.bulkDelete(conversationIds);
  }
  for (const id of conversationIds) deleted.add(id);
  await dexie.project_ai_memories.where('projectId').equals(projectId).delete();
  await dexie.ai_source_sets
    .filter(
      (row) =>
        row.projectId === projectId ||
        (row.mediaId !== undefined && scope.mediaIds.has(row.mediaId)) ||
        (row.layerId !== undefined && scope.layerIds.has(row.layerId)),
    )
    .delete();

  const deletedIds = [...deleted];
  await dexie.ai_tasks.where('targetId').anyOf(deletedIds).delete();
  await dexie.ai_task_snapshots.where('targetId').anyOf(deletedIds).delete();
  await dexie.embeddings.where('sourceId').anyOf(deletedIds).delete();
  if (scope.languageIds.size > 0) {
    await dexie.language_asset_overviews
      .where('languageId')
      .anyOf([...scope.languageIds])
      .delete();
  }
  // 审计日志里指向已删除行的记录也删除（其中有旧值 / 新值）| Audit entries for deleted rows carry old/new values
  await dexie.audit_logs.where('documentId').anyOf(deletedIds).delete();
}
