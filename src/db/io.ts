/**
 * 数据库导入导出 | Database import/export
 *
 * JSON 格式快照的导出与导入，支持冲突策略与数据校验。
 * 导出不包含离线 `audioBlob`（仅结构化 + `details` 中 `audioExportOmitted` 标记）。
 * 入站行不带字节时一律保留本机字节或中止（见 `ioInboundBytePreservation`）。
 */
import type { Table } from 'dexie';
import type {
  ImportConflictStrategy,
  ImportResult,
  JieyuCollections,
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  LexemeDocType,
  PhonemeDocType,
  ProvenanceEnvelope,
  TierAnnotationDocType,
  TokenLexemeLinkDocType,
  UnitMorphemeDocType,
  UnitRelationDocType,
  UnitTokenDocType,
  UserNoteDocType,
} from './types';
import { db, getDb, type JieyuDatabase } from './engine';
import { ZodError } from 'zod';
import { createLogger } from '../observability/logger';
import { isCollectionDroppedOnImport, type ImportDropOptions } from './tableRegistry';
import { withTransaction } from './withTransaction';
import {
  LEGACY_MAIN_DB_NAME,
  SnapshotFormatError,
  type SnapshotInvalidCollection,
} from './snapshotFormatError';
import { withLexemeNestedIds } from './lexemeNestedIds';
import { dropOrphanRows } from './dropOrphanRows';
import { JIEYU_PARENT_CONSISTENCY_RULES } from './ownershipImmutabilityMiddleware';
import {
  InboundByteConflictError,
  isInboundByteCollection,
  MEDIA_AUDIO_EXPORT_OMITTED_BYTE_SIZE_KEY,
  MEDIA_AUDIO_EXPORT_OMITTED_KEY,
  MEDIA_AUDIO_EXPORT_OMITTED_MIME_TYPE_KEY,
  normalizeInboundMediaByteState,
  preserveLocalBytesForInbound,
  type InboundByteConflict,
} from './ioInboundBytePreservation';

const log = createLogger('dbIo');

/**
 * 导入导出快照必须正好是这个版本（D9：不兼容旧格式）。5 = 2A/2B 之后的结构（RD-1）。
 * Import/export JSON snapshots must use this exact `schemaVersion` (D9: no older/newer formats).
 * 5 = the structure after 2A/2B (RD-1).
 */
export const SNAPSHOT_SCHEMA_VERSION = 5;
export const SNAPSHOT_IMPORT_MAX_JSON_BYTES = 32 * 1024 * 1024;
const SNAPSHOT_IMPORT_MAX_JSON_DEPTH = 64;
const SNAPSHOT_IMPORT_MAX_JSON_NODES = 500_000;
type ValidationModule = typeof import('./ioImportValidation');
let validationModulePromise: Promise<ValidationModule> | null = null;

function loadValidationModule(): Promise<ValidationModule> {
  if (!validationModulePromise) {
    validationModulePromise = import('./ioImportValidation');
  }
  return validationModulePromise;
}

/**
 * 去掉媒体行的音频 Blob 并写省略标记与指纹（入站时据此保留或核对本机字节）。就地修改。
 * Strip a media row's audio Blob and write the omission marker and fingerprint (inbound uses them
 * to keep or check local bytes). Mutates the row.
 */
export function markMediaBytesOmitted(item: Record<string, unknown>): void {
  const details = item['details'] as Record<string, unknown> | undefined;
  const audioBlob = details?.['audioBlob'];
  if (!details || !(audioBlob instanceof Blob)) return;
  const copy = { ...details };
  delete copy['audioBlob'];
  copy[MEDIA_AUDIO_EXPORT_OMITTED_KEY] = true;
  // 记录被省略字节的指纹，供入站时校验本机字节是否同一份 | Fingerprint for inbound checks
  copy[MEDIA_AUDIO_EXPORT_OMITTED_BYTE_SIZE_KEY] = audioBlob.size;
  if (audioBlob.type.length > 0) copy[MEDIA_AUDIO_EXPORT_OMITTED_MIME_TYPE_KEY] = audioBlob.type;
  item['details'] = copy;
}

/** 去掉附件行的 Blob 并标为省略。就地修改 | Strip an attachment row's Blob and mark it omitted (mutates) */
export function markAssetBytesOmitted(item: Record<string, unknown>): void {
  if (!(item['blob'] instanceof Blob)) return;
  delete item['blob'];
  item['blobExportOmitted'] = true;
}

/**
 * 任何导出都不读的集合：凭据、AI 记忆与历史、审计日志（与 JY-04 的导入丢弃是同一组数据类）。
 * 整库 JSON、JYB、项目包都不会带出 API 信任决定或 AI 内容。
 * Collections no export ever reads: credentials, AI memory and history, audit logs (the same data
 * classes JY-04 drops on import). No whole-DB JSON, JYB or project package carries them.
 */
function isNeverExported(collectionName: string, includeProjectAi: boolean): boolean {
  return isCollectionDroppedOnImport(collectionName, { keepProjectAi: includeProjectAi });
}

export async function exportDatabaseAsJson(options?: {
  /** 不读取这些集合（项目快照用来跳过 AI / 向量等大表，JY-15）| Collections not read at all (JY-15) */
  skipCollections?: ReadonlySet<string>;
  /**
   * 保留媒体 / 附件的 Blob（JYM 打包字节用；Blob 与行出自同一个只读事务）。默认去掉并打省略标记。
   * Keep media / attachment Blobs (JYM packs the bytes; Blobs come from the same read-only
   * transaction as the rows). By default they are stripped and marked omitted.
   */
  retainByteBlobs?: boolean;
  /**
   * 读出项目 AI 记忆与历史（只有 JYB 与整库快照使用；凭据、审计仍然不读）。
   * Read project AI memory and history (JYB and whole-library snapshots only; never credentials or audit).
   */
  includeProjectAi?: boolean;
  /**
   * 从别的库读（原始快照转换器的临时库）；默认主库。
   * Read from another database (the raw-snapshot converter's temp DB); defaults to the main DB.
   */
  source?: JieyuDatabase;
}): Promise<{
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: Record<string, unknown[]>;
}> {
  // 使用 rxDb 避免遮蔽模块级 Dexie db | Use rxDb to avoid shadowing module-level Dexie db
  const rxDb = options?.source ?? (await getDb());
  const skip = options?.skipCollections;
  // JY-13：所有集合在同一个只读事务里读出，导出期间的自动保存不会让快照前后不一致。
  // JY-13: every collection is read in one read-only transaction, so an autosave during the export
  // cannot produce a half-old, half-new snapshot.
  const entries = await withTransaction(
    rxDb,
    'r',
    rxDb.dexie.tables,
    () =>
      Promise.all(
        Object.entries(rxDb.collections)
          .filter(
            ([name]) =>
              !isNeverExported(name, options?.includeProjectAi === true) &&
              (skip === undefined || !skip.has(name)),
          )
          .map(async ([name, collection]) => {
            const docs = await collection.find().exec();
            return [name, docs.map((doc) => doc.toJSON())] as const;
          }),
      ),
    { label: 'exportDatabaseAsJson' },
  );

  const collections = Object.fromEntries(entries) as Record<string, unknown[]>;

  // Omit offline audio blobs from JSON (keeps exports bounded); re-attach audio via the app.
  if (options?.retainByteBlobs !== true) {
    for (const item of (collections['media_items'] ?? []) as Array<Record<string, unknown>>) {
      markMediaBytesOmitted(item);
    }
    for (const item of (collections['lexeme_assets'] ?? []) as Array<Record<string, unknown>>) {
      markAssetBytesOmitted(item);
    }
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dbName: rxDb.name,
    collections,
  };
}

import { markBackupCompleted } from '../utils/backupExportTimestamp';

/** Collections included in runtime crash-recovery snapshots (transcription core). */
export const RECOVERY_EXPORT_COLLECTIONS = [
  'texts',
  'media_items',
  'layers',
  'layer_links',
  'layer_units',
  'layer_unit_contents',
  'segment_meta',
  'unit_relations',
  'unit_tokens',
  'unit_morphemes',
  'speakers',
  'user_notes',
  'anchors',
] as const;

export async function exportRecoveryDatabaseAsJson(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: Record<string, unknown[]>;
}> {
  const full = await exportDatabaseAsJson();
  const collections: Record<string, unknown[]> = {};
  for (const name of RECOVERY_EXPORT_COLLECTIONS) {
    const rows = full.collections[name];
    if (Array.isArray(rows)) {
      collections[name] = rows;
    }
  }
  return {
    schemaVersion: full.schemaVersion,
    exportedAt: full.exportedAt,
    dbName: full.dbName,
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
  // 重置备份提醒倒计时 | Reset backup reminder countdown
  markBackupCompleted();
}

const knownCollectionNames = [
  'texts',
  'media_items',
  'unit_tokens',
  'unit_morphemes',
  'anchors',
  'lexemes',
  'token_lexeme_links',
  'lexeme_assets',
  'lexeme_asset_links',
  'ai_tasks',
  'embeddings',
  'ai_conversations',
  'ai_messages',
  'languages',
  'language_display_names',
  'language_aliases',
  'language_catalog_history',
  'custom_field_definitions',
  'speakers',
  'orthographies',
  'orthography_bridges',
  'locations',
  'bibliographic_sources',
  'grammar_docs',
  'abbreviations',
  'structural_rule_profiles',
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
  'segment_meta',
  'segment_quality_snapshots',
  'scope_stats_snapshots',
  'speaker_profile_snapshots',
  'translation_status_snapshots',
  'language_asset_overviews',
  'ai_task_snapshots',
  'track_entities',
  'source_records',
  'annotation_documents',
  'ai_session_memories',
  'project_ai_memories',
  'mcp_tool_call_audits',
  'external_mcp_trust',
  'agent_artifacts',
  'ai_source_sets',
] as const;

type KnownCollectionName = (typeof knownCollectionNames)[number];

const tableByCollection: Partial<Record<KnownCollectionName, Table<{ id: string }, string>>> = {
  texts: db.texts,
  media_items: db.media_items,
  unit_tokens: db.unit_tokens,
  unit_morphemes: db.unit_morphemes,
  anchors: db.anchors,
  lexemes: db.lexemes,
  token_lexeme_links: db.token_lexeme_links,
  lexeme_assets: db.lexeme_assets,
  lexeme_asset_links: db.lexeme_asset_links,
  ai_tasks: db.ai_tasks,
  embeddings: db.embeddings,
  ai_conversations: db.ai_conversations,
  ai_messages: db.ai_messages,
  languages: db.languages,
  language_display_names: db.language_display_names,
  language_aliases: db.language_aliases,
  language_catalog_history: db.language_catalog_history,
  custom_field_definitions: db.custom_field_definitions,
  speakers: db.speakers,
  orthographies: db.orthographies,
  orthography_bridges: db.orthography_bridges,
  locations: db.locations,
  bibliographic_sources: db.bibliographic_sources,
  grammar_docs: db.grammar_docs,
  abbreviations: db.abbreviations,
  structural_rule_profiles: db.structural_rule_profiles,
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
  segment_meta: db.segment_meta,
  segment_quality_snapshots: db.segment_quality_snapshots,
  scope_stats_snapshots: db.scope_stats_snapshots,
  speaker_profile_snapshots: db.speaker_profile_snapshots,
  translation_status_snapshots: db.translation_status_snapshots,
  language_asset_overviews: db.language_asset_overviews,
  ai_task_snapshots: db.ai_task_snapshots,
  track_entities: db.track_entities,
  source_records: db.source_records,
  annotation_documents: db.annotation_documents,
  ai_session_memories: db.ai_session_memories,
  project_ai_memories: db.project_ai_memories,
  mcp_tool_call_audits: db.mcp_tool_call_audits,
  external_mcp_trust: db.external_mcp_trust,
  agent_artifacts: db.agent_artifacts,
  ai_source_sets: db.ai_source_sets,
};

function ensureImportProvenance<
  T extends { provenance?: ProvenanceEnvelope | undefined; createdAt?: string | undefined },
>(doc: T, fallbackCreatedAt: string): T {
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

function ensureSnapshotJsonSizeWithinLimit(raw: string): void {
  const sizeBytes = new TextEncoder().encode(raw).byteLength;
  if (sizeBytes > SNAPSHOT_IMPORT_MAX_JSON_BYTES) {
    throw new Error(`Snapshot JSON size exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_BYTES} bytes).`);
  }
}

function validateSnapshotJsonStructure(value: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: node, depth } = current;

    if (depth > SNAPSHOT_IMPORT_MAX_JSON_DEPTH) {
      throw new Error(`Snapshot JSON depth exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_DEPTH}).`);
    }
    if (node === null || typeof node !== 'object') continue;

    nodeCount += 1;
    if (nodeCount > SNAPSHOT_IMPORT_MAX_JSON_NODES) {
      throw new Error(
        `Snapshot JSON node count exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_NODES}).`,
      );
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      const record = node as Record<string, unknown>;
      stack.push({ value: record[key], depth: depth + 1 });
    }
  }
}

function normalizeImportedDoc(
  collectionName: KnownCollectionName,
  doc: unknown,
  fallbackCreatedAt: string,
): unknown {
  if (doc === null || doc === undefined || typeof doc !== 'object') return doc;

  switch (collectionName) {
    case 'unit_tokens':
      return ensureImportProvenance(
        { ...(doc as Record<string, unknown>) } as unknown as UnitTokenDocType,
        fallbackCreatedAt,
      );
    case 'unit_morphemes':
      return ensureImportProvenance(
        { ...(doc as Record<string, unknown>) } as unknown as UnitMorphemeDocType,
        fallbackCreatedAt,
      );
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
      // JY-23：导入时显式补齐嵌套 id（校验器不再原地补）| Fill nested ids explicitly (validator is pure)
      return withLexemeNestedIds(ensureImportProvenance(doc as LexemeDocType, fallbackCreatedAt));
    case 'token_lexeme_links':
      return ensureImportProvenance(doc as TokenLexemeLinkDocType, fallbackCreatedAt);
    case 'phonemes':
      return ensureImportProvenance(doc as PhonemeDocType, fallbackCreatedAt);
    case 'media_items':
      return normalizeInboundMediaByteState(doc as Record<string, unknown>);
    default:
      return doc;
  }
}

async function pruneOrphanUserNotes(): Promise<number> {
  const notes = await db.user_notes.toArray();
  if (notes.length === 0) return 0;

  const unitIds = new Set<string>();
  const textIds = new Set<string>();
  const lexemeIds = new Set<string>();
  const annotationIds = new Set<string>();
  const tokenIds = new Set<string>();
  const morphemeIds = new Set<string>();

  for (const note of notes) {
    if (note.targetType === 'unit') unitIds.add(note.targetId);
    if (note.targetType === 'text') textIds.add(note.targetId);
    if (note.targetType === 'lexeme') lexemeIds.add(note.targetId);
    if (note.targetType === 'tier_annotation' && !note.targetId.includes('::'))
      annotationIds.add(note.targetId);
    if (note.targetType === 'token') tokenIds.add(note.targetId);
    if (note.targetType === 'morpheme') morphemeIds.add(note.targetId);
  }

  // JY-05：只看目标行是否存在；segment 行和缺 unitType 的单元同样可挂 'unit' 备注
  // JY-05: existence only; notes may target segment rows and units stored without unitType
  const existingUnitIds = new Set(
    (await db.layer_units.bulkGet([...unitIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );
  const existingTextIds = new Set(
    (await db.texts.bulkGet([...textIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );
  const existingLexemeIds = new Set(
    (await db.lexemes.bulkGet([...lexemeIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );
  const existingAnnotationIds = new Set(
    (await db.tier_annotations.bulkGet([...annotationIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );
  const existingTokenIds = new Set(
    (await db.unit_tokens.bulkGet([...tokenIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );
  const existingMorphemeIds = new Set(
    (await db.unit_morphemes.bulkGet([...morphemeIds])).flatMap((d) =>
      d?.id !== undefined && d.id.length > 0 ? [d.id] : [],
    ),
  );

  const orphanIds: string[] = [];
  for (const note of notes) {
    if (note.targetType === 'unit' && !existingUnitIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'text' && !existingTextIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'lexeme' && !existingLexemeIds.has(note.targetId))
      orphanIds.push(note.id);
    if (
      note.targetType === 'tier_annotation' &&
      !note.targetId.includes('::') &&
      !existingAnnotationIds.has(note.targetId)
    ) {
      orphanIds.push(note.id);
    }
    if (note.targetType === 'token' && !existingTokenIds.has(note.targetId))
      orphanIds.push(note.id);
    if (note.targetType === 'morpheme' && !existingMorphemeIds.has(note.targetId))
      orphanIds.push(note.id);
  }

  if (orphanIds.length > 0) {
    await db.user_notes.bulkDelete(orphanIds);
  }

  return orphanIds.length;
}

/**
 * 在导入写事务内、写入之前执行的步骤（例如协作 restore 的按项目清理）。
 * A step that runs inside the import write transaction before any write (e.g. collab prune).
 * 本机字节会在该步骤之前读出并保留。| Local bytes are read and kept before this step runs.
 */
export interface ImportPreWriteStep {
  tables: readonly Table<any, any, any>[];
  run: () => Promise<void>;
}

/** 只取字段路径和原因，不带行内容 | Field path and reason only, never row content */
function describeValidationIssue(error: unknown): string {
  const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> } | null)
    ?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0]!;
    const path =
      Array.isArray(first.path) && first.path.length > 0 ? first.path.join('.') : '(row)';
    return `${path}: ${first.message ?? 'invalid'}`;
  }
  return error instanceof Error ? error.message.slice(0, 200) : 'invalid';
}

/**
 * RD-1：版本闸门。旧库（jieyudb_v2）导出或更早的快照版本给出明确的“旧版本”错误，其他版本不符给出
 * “不支持的版本”；不做任何转换（D9）。
 * RD-1: version gate. Exports of the old database (jieyudb_v2) or older snapshot versions get a
 * clear "legacy" error; any other mismatch is "unsupported version". Nothing is converted (D9).
 */
export function assertSupportedSnapshotVersion(raw: unknown): void {
  const record = (raw !== null && typeof raw === 'object' ? raw : {}) as {
    schemaVersion?: unknown;
    dbName?: unknown;
  };
  const schemaVersion = typeof record.schemaVersion === 'number' ? record.schemaVersion : null;
  const dbName = typeof record.dbName === 'string' ? record.dbName : null;
  if (
    dbName === LEGACY_MAIN_DB_NAME ||
    (schemaVersion !== null && schemaVersion < SNAPSHOT_SCHEMA_VERSION)
  ) {
    throw new SnapshotFormatError({
      code: 'legacy-database',
      message: `Snapshot comes from the database before the data reset (dbName=${dbName ?? '?'}, schemaVersion=${schemaVersion ?? '?'}); this version does not import it.`,
      schemaVersion,
      dbName,
    });
  }
  if (schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotFormatError({
      code: 'unsupported-version',
      message: `Unsupported snapshot schemaVersion=${String(record.schemaVersion)}; only schemaVersion=${SNAPSHOT_SCHEMA_VERSION} (current app export) is accepted.`,
      schemaVersion,
      dbName,
    });
  }
}

type PreparedCollection = {
  collectionName: KnownCollectionName;
  received: number;
  normalizedDocs: unknown[];
};

/**
 * 写入前的整体预检：版本、结构、逐条记录校验（RD-1）。预览和导入共用，结论一致。
 * 有任何不合格的行就抛出 `invalid-records`，并按集合列出行数。
 * Whole pre-check before any write: version, structure and every record (RD-1). Shared by preview
 * and import so both reach the same verdict. Any invalid row throws `invalid-records` with per-
 * collection counts.
 */
export async function prepareSnapshotImport(
  parsedRaw: unknown,
  importStartedAt: string,
  dropOptions?: ImportDropOptions,
): Promise<{
  preparedCollections: PreparedCollection[];
  ignoredCollections: string[];
  droppedCollections: Array<{ name: string; rows: number }>;
}> {
  validateSnapshotJsonStructure(parsedRaw);
  assertSupportedSnapshotVersion(parsedRaw);
  const validation = await loadValidationModule();
  let snapshot: Awaited<ReturnType<typeof validation.parseDatabaseSnapshot>>;
  try {
    snapshot = validation.parseDatabaseSnapshot(parsedRaw);
  } catch (error) {
    // REV5-N5：外壳 ZodError 改成可读的 SnapshotFormatError | Surface ZodError as SnapshotFormatError
    if (error instanceof ZodError) {
      const problems = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
      });
      throw new SnapshotFormatError({
        code: 'invalid-package',
        message: `Snapshot envelope is invalid: ${problems.length > 0 ? problems.join('; ') : error.message}`,
        problems,
      });
    }
    throw error;
  }

  if ('unit_texts' in snapshot.collections) {
    throw new Error(
      'Legacy collection "unit_texts" is no longer supported; import a LayerUnit snapshot.',
    );
  }

  const cols = snapshot.collections as Record<string, unknown[]>;
  if (!Array.isArray(cols['layer_units'])) cols['layer_units'] = [];
  if (!Array.isArray(cols['layer_unit_contents'])) cols['layer_unit_contents'] = [];

  const legacyUnits = cols['units'];
  if (Array.isArray(legacyUnits) && legacyUnits.length > 0) {
    throw new Error(
      'Legacy snapshot key "units" is not supported; import layer_units + layer_unit_contents from a current app export.',
    );
  }
  if ('units' in cols) {
    delete cols['units'];
  }

  const preparedCollections: PreparedCollection[] = [];
  const ignoredCollections: string[] = [];
  const droppedCollections: Array<{ name: string; rows: number }> = [];
  const invalidCollections: SnapshotInvalidCollection[] = [];

  for (const [name, docs] of Object.entries(snapshot.collections)) {
    // JY-04：凭据 / AI 记忆 / 审计日志类集合一律丢弃，且不清空本机同名表；日志只记表名和行数
    // JY-04: drop credential / AI-memory / audit-log collections (local tables are not cleared);
    // the warning records the table name and row count only, never row content
    if (isCollectionDroppedOnImport(name, dropOptions)) {
      droppedCollections.push({ name, rows: Array.isArray(docs) ? docs.length : 0 });
      continue;
    }
    if (!knownCollectionNames.includes(name as KnownCollectionName)) {
      ignoredCollections.push(name);
      continue;
    }

    const collectionName = name as KnownCollectionName;
    const normalizedDocs = docs.map((doc) =>
      normalizeImportedDoc(collectionName, doc, importStartedAt),
    );

    let invalid = 0;
    let firstIssue: string | null = null;
    for (const doc of normalizedDocs) {
      const candidate = doc as { id?: unknown } | null;
      if (typeof candidate?.id !== 'string' || candidate.id.trim() === '') {
        invalid += 1;
        firstIssue ??= 'id: missing non-empty id';
        continue;
      }
      try {
        validation.validateCollectionDoc(collectionName, doc);
      } catch (error) {
        invalid += 1;
        firstIssue ??= describeValidationIssue(error);
      }
    }
    if (invalid > 0) {
      invalidCollections.push({
        collection: collectionName,
        invalid,
        firstIssue: firstIssue ?? '',
      });
      continue;
    }

    preparedCollections.push({ collectionName, received: docs.length, normalizedDocs });
  }

  if (invalidCollections.length > 0) {
    const total = invalidCollections.reduce((sum, item) => sum + item.invalid, 0);
    throw new SnapshotFormatError({
      code: 'invalid-records',
      message: `Snapshot has ${total} invalid record(s): ${invalidCollections
        .map((item) => `${item.collection} ×${item.invalid} (${item.firstIssue})`)
        .join('; ')}`,
      schemaVersion: snapshot.schemaVersion,
      dbName: snapshot.dbName ?? null,
      invalidCollections,
    });
  }

  return { preparedCollections, ignoredCollections, droppedCollections };
}

export async function importDatabaseFromJson(
  input: unknown,
  options?: {
    strategy?: ImportConflictStrategy;
    preWrite?: ImportPreWriteStep;
    /** 只有 JYB 入口传 true（见 `ImportDropOptions`）| Only JYB entry points pass true */
    keepProjectAi?: boolean;
  },
): Promise<ImportResult> {
  const strategy = options?.strategy ?? 'upsert';
  let parsedRaw: unknown;
  try {
    if (typeof input === 'string') {
      ensureSnapshotJsonSizeWithinLimit(input);
      parsedRaw = JSON.parse(input);
    } else {
      const serialized = JSON.stringify(input);
      ensureSnapshotJsonSizeWithinLimit(serialized);
      parsedRaw = input;
    }
  } catch (e) {
    if (
      e instanceof Error &&
      /Snapshot JSON (size|depth|node count) exceeds limit/i.test(e.message)
    ) {
      throw e;
    }
    throw new Error(
      `Invalid JSON input: ${e instanceof Error ? e.message : 'unknown parse error'}`,
    );
  }
  const importedAt = new Date().toISOString();
  const prepared = await prepareSnapshotImport(parsedRaw, importedAt, {
    keepProjectAi: options?.keepProjectAi === true,
  });
  const preparedCollections = prepared.preparedCollections;

  const result: ImportResult = {
    importedAt,
    strategy,
    collections: {},
    ignoredCollections: [...prepared.ignoredCollections],
    droppedCollections: [...prepared.droppedCollections],
  };
  for (const dropped of prepared.droppedCollections) {
    if (dropped.rows > 0) {
      log.warn('Dropped collection from imported snapshot by data class', {
        table: dropped.name,
        rows: dropped.rows,
      });
    }
  }

  const dbInstance = await getDb();

  // GAP-1：父表先于子表写入，归属一致性检查才能在同一事务里读到本次导入的父行
  // GAP-1: write parent tables before their children so the parent-ownership check sees the
  // parents of this import (stable sort; all other collections keep the snapshot order)
  const childWriteRank: Partial<Record<KnownCollectionName, number>> = {
    unit_tokens: 1,
    unit_morphemes: 2,
    token_lexeme_links: 3,
  };
  preparedCollections.sort(
    (a, b) => (childWriteRank[a.collectionName] ?? 0) - (childWriteRank[b.collectionName] ?? 0),
  );

  // ADR-0006: One `rw` Dexie transaction whose scope is the dynamic union of `tier_definitions` plus every
  // Dexie `Table` in `tableByCollection`. The callback only touches stores in that list; `layers` uses
  // RxDB (`dbInstance.collections.layers`), not additional IDB stores on this transaction.
  const txTablesByName = new Map<string, Table<any, any>>();
  for (const table of [
    dbInstance.dexie.tier_definitions as Table<any, any>,
    ...Object.values(tableByCollection)
      .filter((table): table is Table<{ id: string }, string> => Boolean(table))
      .map((table) => table as Table<any, any>),
    ...(options?.preWrite?.tables ?? []),
  ]) {
    txTablesByName.set(table.name, table);
  }
  const txTables = [...txTablesByName.values()];
  const txTablesTuple = txTables as [Table<any, any>, ...Table<any, any>[]];
  const transactionAny = dbInstance.dexie.transaction as (...args: any[]) => Promise<void>;

  await transactionAny.apply(dbInstance.dexie, [
    'rw',
    ...txTablesTuple,
    async () => {
      // N2：在任何删除/替换之前读出本机字节，入站缺字节时保留或整体中止。
      // N2: read local bytes before any prune/replace; inbound rows without bytes keep them or abort.
      if (strategy !== 'skip-existing') {
        const conflicts: InboundByteConflict[] = [];
        for (const prepared of preparedCollections) {
          if (!isInboundByteCollection(prepared.collectionName)) continue;
          const table = tableByCollection[prepared.collectionName];
          if (!table) continue;
          const kept = await preserveLocalBytesForInbound(
            prepared.collectionName,
            prepared.normalizedDocs,
            table as Table<any, any>,
          );
          conflicts.push(...kept.conflicts);
          prepared.normalizedDocs = kept.docs;
        }
        if (conflicts.length > 0) {
          throw new InboundByteConflictError(conflicts);
        }
      }

      if (options?.preWrite) {
        await options.preWrite.run();
      }

      // BF1N3-1：父行既不在包里、也不在本机库里的行丢掉（replace-all 会清空的表不算本机；放在 preWrite 之后，被项目清理删掉的父行也不算）
      // BF1N3-1: drop rows whose parent is neither in the snapshot nor in the local DB
      // (tables replace-all is about to clear do not count as local). Runs after preWrite (PF-1),
      // so local parents a project-scoped prune just deleted do not count either.
      const inbound = Object.fromEntries(
        preparedCollections.map((p) => [p.collectionName, p.normalizedDocs as unknown[]]),
      );
      const inboundIds = new Map<string, Set<string>>();
      const inInbound = (table: string, id: string) => {
        if (!inboundIds.has(table)) {
          const rows = (inbound[table] ?? []) as Array<{ id?: unknown }>;
          inboundIds.set(table, new Set(rows.map((row) => String(row.id))));
        }
        return inboundIds.get(table)!.has(id);
      };
      const missing = new Map<string, Set<string>>();
      // B5-5：`layers` 别名与 tier_definitions 是同一张表，它的文稿引用也查本机 | the `layers` alias is the
      // same table as tier_definitions, so its document refs are looked up locally too
      const layerRule = JIEYU_PARENT_CONSISTENCY_RULES.tier_definitions;
      const ruleEntries = [
        ...Object.entries(JIEYU_PARENT_CONSISTENCY_RULES),
        ...(layerRule ? [['layers', layerRule] as const] : []),
      ];
      for (const [name, rule] of ruleEntries) {
        for (const row of (inbound[name] ?? []) as Array<Record<string, unknown>>) {
          for (const ref of rule.extract(row).parents) {
            if (inInbound(ref.table, ref.key)) continue;
            if (strategy === 'replace-all' && inbound[ref.table]) continue;
            if (!missing.has(ref.table)) missing.set(ref.table, new Set());
            missing.get(ref.table)!.add(ref.key);
          }
        }
      }
      const localParentIds = new Map<string, Set<string>>();
      for (const [table, keys] of missing) {
        const ids = [...keys];
        const found = await tableByCollection[table as KnownCollectionName]?.bulkGet(ids);
        localParentIds.set(table, new Set(ids.filter((_, i) => found?.[i] !== undefined)));
      }
      const orphans = dropOrphanRows(inbound, localParentIds);
      if (orphans.skipped.length > 0 || orphans.detachedDocumentRefs > 0) {
        for (const prepared of preparedCollections) {
          prepared.normalizedDocs = (orphans.collections[prepared.collectionName] ??
            prepared.normalizedDocs) as typeof prepared.normalizedDocs;
        }
        if (orphans.skipped.length > 0) result.skippedOrphanRows = orphans.skipped;
        log.warn('Dropped orphan rows from JSON import', {
          skipped: orphans.skipped,
          detachedDocumentRefs: orphans.detachedDocumentRefs,
        });
      }

      for (const prepared of preparedCollections) {
        const { collectionName, normalizedDocs, received } = prepared;
        const resultCollectionName = collectionName as keyof JieyuCollections;

        if (collectionName === 'layers') {
          const collection = dbInstance.collections.layers;
          let written = 0;
          let skipped = 0;

          if (strategy === 'replace-all') {
            const existing = await collection.find().exec();
            for (const row of existing) {
              await collection.remove(row.primary);
            }
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

          result.collections[resultCollectionName] = {
            received,
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

        let written = 0;
        let skipped = 0;

        if (strategy === 'replace-all') {
          await table.clear();
        }

        if (strategy === 'skip-existing') {
          const existingDocs = await table.bulkGet(
            normalizedDocs.map((doc) => (doc as { id: string }).id),
          );
          const toInsert = normalizedDocs.filter((_, index) => !existingDocs[index]);
          skipped = normalizedDocs.length - toInsert.length;
          if (toInsert.length > 0) {
            await table.bulkPut(toInsert as Array<{ id: string }>);
          }
          written = toInsert.length;
        } else {
          if (normalizedDocs.length > 0) {
            await table.bulkPut(normalizedDocs as Array<{ id: string }>);
          }
          written = normalizedDocs.length;
        }

        result.collections[resultCollectionName] = {
          received,
          written,
          skipped,
        };
      }

      await pruneOrphanUserNotes();
    },
  ]);

  return result;
}
