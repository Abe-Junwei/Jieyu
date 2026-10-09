/**
 * JYB：整库备份与还原（rev5 D1、D7、7.5；第 3 批第三个切片）。
 * JYB: whole-database backup and restore (rev5 D1, D7, 7.5; batch 3, third slice).
 *
 * 包结构 | Layout
 *   mimetype                    application/vnd.jieyu.jyb（不压缩，第一个条目）
 *   META-INF/manifest.json      与项目包同一套清单（7.2），`package: jyb`、`kind: library`
 *   data/library.json           `{ schemaVersion, exportedAt, dbName, projects: [{ id, collections }] }`
 *                               （加密时为 data/library.enc）；每个项目的行已按项目切好
 *   media/<id>、attachments/<id> 带音频时的原始字节（与 JYM 相同）
 *
 * - 带哪些表由 `tableRegistry` 派生：分类表里进 JYB 的数据类。凭据、审计日志、派生数据、协作状态、
 *   恢复快照都不在包里（T53）。
 * - 项目 AI 记忆与历史按项目切分进包（用户决定 2026-10-09，7.5）；只有 JYB 的导入 / 还原保留它们，
 *   JYT / JYM 仍按 JY-04 丢弃。
 * - 用户偏好放在 `data/library.json` 的 `settings` 条目里（白名单、去密钥）；只在整库还原时、用户
 *   勾选后写回。
 * - 导出时写明带不带音频（D1）；默认带音频（用户决定 2026-10-09）。
 * - 逐项目导入（默认）：选中的项目作为新项目加入，全部 id 重新生成，记录 restoredFrom（T30）。
 * - 灾难恢复（整库还原）：只在本机没有项目，或者本机和包里的项目都从未协作过时提供（D7、T34）；
 *   界面二次确认；先做整库快照，失败就中止；会丢本机字节时中止（4.2-7）；保留原 id。
 */
import type { ImportResult } from '../db/types';
import type { JieyuDatabase } from '../db/engine';
import { ProjectOverwriteBlockedError, SnapshotFormatError } from '../db/snapshotFormatError';
import {
  isProjectNeverCollaborated,
  listCollaboratedIds,
} from '../collaboration/cloud/projectCollaborationHistory';
import {
  JIEYU_DATA_CLASS_IN_JYB,
  JIEYU_MAIN_TABLE_REGISTRY,
  PROJECT_AI_TABLES,
  type JieyuDataClass,
  type JieyuMainTableName,
} from '../db/tableRegistry';
import {
  PROJECT_AI_PROJECT_ID_OWNED,
  countProjectAiRows,
  projectAiCollectionsFor,
} from './jybProjectAi';
import {
  applyUserPreferences,
  collectUserPreferences,
  readCurrentUserPreferences,
  readPackagedUserPreferences,
  type PackagedUserPreferences,
  type UserPreferenceEntry,
} from './userPreferencesBackup';
import { listUnresolvedSystemRefs } from '../annotation/systemStructuralRuleProfiles';
import {
  createArchiveDecryptor,
  parseJsonWithGuard,
  readArchiveMimetype,
  toJsonBytes,
  toText,
  unzipWithGuard,
  type ArchiveSource,
  type JieyuArchiveEncryptionMetadata,
  type JieyuArchiveEncryptionOptions,
  type JieyuArchiveImportPolicy,
} from './projectArchiveContainer';
import { blobBytes } from './zipBlob';
import {
  collectArchiveProjectDocuments,
  collectArchiveSystemRefs,
} from './archiveProjectDocuments';
import {
  JYM_PACKAGE_POLICY,
  MANIFEST_PATH,
  PROJECT_PACKAGE_FORMAT_VERSION,
  ProjectPackageTooLargeError,
  appVersion,
  assemblePackage,
  attachIncludedBytes,
  checkFileTable,
  collectOmittedEntities,
  dropOrphanRows,
  findBytesAtRisk,
  findIdenticalLocalBytes,
  invalidPackage,
  manifestSchema,
  omittedBytesSummary,
  packIncludedBytes,
  prepareRestoreAsNew,
  readIncludedBytes,
  readLegacyManifestOrNull,
  stripInlineMediaBytes,
  type InboundBytes,
  type PackageDataPaths,
  type PackageEntity,
  type PackedByteFile,
  type ProjectPackageManifest,
  type SkippedOrphanRows,
  rowsOf,
  byteGuardTables,
} from './projectPackageService';
import type { ProjectCollections } from './projectPackageIdRemap';

export const JYB_MIMETYPE = 'application/vnd.jieyu.jyb';
const JYB_DATA_PATHS: PackageDataPaths = {
  plain: 'data/library.json',
  encrypted: 'data/library.enc',
};

/**
 * JYB 上限：字节部分与 JYM 相同（按 Blob 流式处理，见 JYM_PACKAGE_POLICY）；条目更多。数据 JSON 受导入上限
 * 约束（32 MiB），导出时同样检查（7.4-8 对称）。
 * JYB limits: bytes as for JYM (streamed as Blobs, see JYM_PACKAGE_POLICY); more entries. The data JSON is bound by
 * the import limit (32 MiB), checked on export too (7.4-8 symmetric).
 */
export const JYB_PACKAGE_POLICY: JieyuArchiveImportPolicy = {
  ...JYM_PACKAGE_POLICY,
  maxEntryCount: 16_384,
  maxJsonNodes: 600_000,
};

/** 整库快照在覆盖前快照库里的键 | Key of whole-database snapshots in the pre-overwrite snapshot store */
export const LIBRARY_SNAPSHOT_KEY = '*library*';

/**
 * 进 JYB 的数据类：分类表允许的类（7.5）。项目 AI 也在内（用户决定 2026-10-09）；凭据、审计不在。
 * Data classes a JYB carries (7.5), project AI included (user decision 2026-10-09).
 */
export function isDataClassPackagedInJyb(dataClass: JieyuDataClass): boolean {
  return JIEYU_DATA_CLASS_IN_JYB[dataClass];
}

const MAIN_TABLE_NAMES = Object.keys(JIEYU_MAIN_TABLE_REGISTRY) as JieyuMainTableName[];

/** JYB 带的主库表（T53）| Main tables a JYB carries (T53) */
export const JYB_MAIN_TABLES: readonly JieyuMainTableName[] = MAIN_TABLE_NAMES.filter((name) =>
  isDataClassPackagedInJyb(JIEYU_MAIN_TABLE_REGISTRY[name].dataClass),
);
export const JYB_SKIPPED_COLLECTIONS: ReadonlySet<string> = new Set(
  MAIN_TABLE_NAMES.filter((name) => !JYB_MAIN_TABLES.includes(name)),
);

type Row = Record<string, unknown>;
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');
type ProjectSnapshotModule = typeof import('../db/projectScopedSnapshot');
type OverwriteSnapshotModule = typeof import('../db/projectOverwriteSnapshotStore');
type Dexie = Awaited<ReturnType<DbEngineModule['getDb']>>['dexie'];

interface LibraryData {
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  projects: Array<{ id: string; collections: ProjectCollections }>;
  /** 用户偏好（7.5 的单独 settings 条目）| User preferences (7.5 separate settings entry) */
  settings?: PackagedUserPreferences;
}

const PROJECT_AI_TABLE_SET: ReadonlySet<string> = new Set(PROJECT_AI_TABLES);

// ─── 导出 | Export ───────────────────────────────────────────────────────────

export interface JybExportOptions {
  /**
   * 带不带受管音频与附件字节，清单里如实写明（D1）。默认带（用户决定 2026-10-09）。
   * With or without managed audio / attachment bytes, stated in the manifest (D1); default: with.
   */
  includeMedia?: boolean;
  /** 带不带用户偏好，默认带 | Whether to carry user preferences (default: yes) */
  includePreferences?: boolean;
  encryption?: JieyuArchiveEncryptionOptions;
  /** 覆盖容量上限（测试用）| Override the size limits (tests) */
  policy?: Partial<JieyuArchiveImportPolicy>;
  /**
   * 从别的库导出（原始快照转换器的临时库）；默认主库。
   * Export another database (the raw-snapshot converter's temp DB); defaults to the main DB.
   */
  source?: JieyuDatabase;
}

/** 本机字节的总大小（读字节之前先检查上限）| Total size of local bytes, checked before any read */
function localByteTotal(collections: ProjectCollections): number {
  let total = 0;
  for (const row of rowsOf(collections, 'media_items')) {
    const blob = (row.details as Row | undefined)?.audioBlob;
    if (blob instanceof Blob && row.byteLocation === 'managed') total += blob.size;
  }
  for (const row of rowsOf(collections, 'lexeme_assets')) {
    if (row.blob instanceof Blob) total += row.blob.size;
  }
  return total;
}

/**
 * 导出整库为 JYB。所有行在一个只读事务里读出（JY-13）。
 * Export the whole database as a JYB; all rows are read in one read-only transaction (JY-13).
 */
/** 整库 JYB 的整包字节（测试与小库用）| Whole-JYB bytes (tests, small libraries) */
export async function exportDatabaseToJyb(options: JybExportOptions = {}): Promise<Uint8Array> {
  return blobBytes(await exportDatabaseToJybBlob(options));
}

/**
 * 整库导出成 JYB Blob；字节文件引用库里的 Blob，整包不进内存（4b 流式处理）。
 * Export the whole library as a JYB Blob; byte files reference the stored Blobs (4b streaming).
 */
export async function exportDatabaseToJybBlob(options: JybExportOptions = {}): Promise<Blob> {
  const includeMedia = options.includeMedia !== false;
  const policy: JieyuArchiveImportPolicy = { ...JYB_PACKAGE_POLICY, ...options.policy };
  const [dbIo, scoped, engine] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectScopedSnapshot') as Promise<ProjectSnapshotModule>,
    import('../db/engine') as Promise<DbEngineModule>,
  ]);
  const full = await dbIo.exportDatabaseAsJson({
    skipCollections: JYB_SKIPPED_COLLECTIONS,
    retainByteBlobs: includeMedia,
    includeProjectAi: true,
    ...(options.source ? { source: options.source } : {}),
  });
  const contentCollections: ProjectCollections = Object.fromEntries(
    Object.entries(full.collections).filter(([name]) => !PROJECT_AI_TABLE_SET.has(name)),
  );

  const projects: LibraryData['projects'] = [];
  const packagedIds = new Map<string, Set<string>>();
  for (const text of rowsOf(full.collections, 'texts')) {
    const id = String(text.id);
    const collections = scoped.filterCollectionsForProject(contentCollections, id);
    for (const name of Object.keys(collections)) {
      if (JYB_SKIPPED_COLLECTIONS.has(name)) delete collections[name];
    }
    Object.assign(collections, projectAiCollectionsFor(full.collections, id, collections));
    stripInlineMediaBytes(collections);
    for (const [name, rows] of Object.entries(collections)) {
      const ids = packagedIds.get(name) ?? new Set<string>();
      for (const row of rows as Row[]) ids.add(String(row.id));
      packagedIds.set(name, ids);
    }
    projects.push({ id, collections });
  }
  // 不属于任何项目的行不进包，在清单里计数 | Rows owned by no project are left out and counted
  let unownedRows = 0;
  for (const [name, rows] of Object.entries(full.collections)) {
    if (JYB_SKIPPED_COLLECTIONS.has(name)) continue;
    const ids = packagedIds.get(name);
    unownedRows += (rows as Row[]).filter((row) => !ids?.has(String(row.id))).length;
  }

  if (includeMedia) {
    const total = projects.reduce((sum, p) => sum + localByteTotal(p.collections), 0);
    if (total > policy.maxArchiveBytes) {
      throw new ProjectPackageTooLargeError(total, policy.maxArchiveBytes);
    }
  }
  const entities: PackageEntity[] = [];
  const byteFiles: PackedByteFile[] = [];
  for (const project of projects) {
    const own = collectOmittedEntities(project.collections);
    if (includeMedia) {
      byteFiles.push(...(await packIncludedBytes(project.collections, own, dbIo, policy)));
    }
    entities.push(...own);
  }

  const data: LibraryData = {
    schemaVersion: full.schemaVersion,
    exportedAt: full.exportedAt,
    dbName: full.dbName,
    projects,
    ...(options.includePreferences !== false ? { settings: await collectUserPreferences() } : {}),
  };
  const dataBytes = toJsonBytes(data);
  if (dataBytes.byteLength > dbIo.SNAPSHOT_IMPORT_MAX_JSON_BYTES) {
    throw new ProjectPackageTooLargeError(
      dataBytes.byteLength,
      dbIo.SNAPSHOT_IMPORT_MAX_JSON_BYTES,
    );
  }

  // 没进包的数据类按行数记在清单里 | Data classes left out, with their row counts
  const db = options.source ?? (await engine.getDb());
  const excludedClasses = new Map<JieyuDataClass, number>();
  for (const name of JYB_SKIPPED_COLLECTIONS) {
    const dataClass = JIEYU_MAIN_TABLE_REGISTRY[name as JieyuMainTableName].dataClass;
    const count = await db.dexie.table(name).count();
    excludedClasses.set(dataClass, (excludedClasses.get(dataClass) ?? 0) + count);
  }

  const allCollections: ProjectCollections = {};
  for (const project of projects) {
    for (const [name, rows] of Object.entries(project.collections)) {
      allCollections[name] = [...(allCollections[name] ?? []), ...rows];
    }
  }
  const documents = collectArchiveProjectDocuments({ collections: allCollections });
  const manifestProjects: ProjectPackageManifest['projects'] = rowsOf(allCollections, 'texts').map(
    (text) => {
      const doc = documents.find((item) => item.id === text.id);
      return {
        id: String(text.id),
        ...(text.title !== undefined ? { title: text.title as Record<string, string> } : {}),
        ...(text.restoredFrom !== undefined
          ? { restoredFrom: text.restoredFrom as { projectId: string } }
          : {}),
        ...(doc?.defaultDocumentId !== undefined
          ? { defaultDocumentId: doc.defaultDocumentId }
          : {}),
        // 导出设备上的协作判定随包走，换设备做灾难恢复时也能看到（D7、REV5-N4）
        // This device's collaboration verdict travels with the package (D7, REV5-N4)
        collaborated: !isProjectNeverCollaborated(String(text.id)),
        documents: doc?.documents ?? [],
      };
    },
  );

  return assemblePackage({
    kind: 'jyb',
    mimetype: JYB_MIMETYPE,
    dataBytes,
    dataPaths: JYB_DATA_PATHS,
    entities,
    byteFiles,
    policy,
    ...(options.encryption ? { encryption: options.encryption } : {}),
    manifest: {
      package: 'jyb',
      formatVersion: PROJECT_PACKAGE_FORMAT_VERSION,
      appVersion: appVersion(),
      created: full.exportedAt,
      kind: 'library',
      digestAlgorithm: 'sha256',
      media: includeMedia ? 'included' : 'excluded',
      dataSchemaVersion: full.schemaVersion,
      projects: manifestProjects,
      systemRefs: collectArchiveSystemRefs({ collections: allCollections }),
      excluded: [
        ...omittedBytesSummary(entities, includeMedia ? 'no-local-bytes' : 'media-excluded'),
        ...[...excludedClasses.entries()]
          .filter(([, count]) => count > 0)
          .map(([dataClass, count]) => ({
            kind: `data-class:${dataClass}`,
            count,
            reason: 'never-packaged',
          })),
        ...(unownedRows > 0
          ? [{ kind: 'unowned-rows', count: unownedRows, reason: 'not-owned-by-any-project' }]
          : []),
      ],
    },
  });
}

export async function downloadDatabaseJyb(
  baseName: string,
  options: JybExportOptions = {},
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadDatabaseJyb can only run in browser context');
  }
  const url = URL.createObjectURL(await exportDatabaseToJybBlob(options));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.jyb`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  // 重置备份提醒倒计时 | Reset the backup reminder countdown
  const { markBackupCompleted } = await import('../utils/backupExportTimestamp');
  markBackupCompleted();
}

// ─── 入站检查 | Inbound checks ─────────────────────────────────────────────────

interface InspectedLibrary {
  manifest: ProjectPackageManifest;
  data: LibraryData;
  bytesByEntity: Map<string, InboundBytes>;
  preferences: { entries: UserPreferenceEntry[]; ignoredKeys: string[] };
  /** 项目 id → 父行不在本项目包里、已丢弃的行（BF1-N3）| Project id → dropped orphan rows */
  skippedOrphanRows: Map<string, SkippedOrphanRows>;
}

export interface JybReadOptions {
  password?: string;
  policy?: Partial<JieyuArchiveImportPolicy>;
}

/** 是否 JYB（看 mimetype）| Whether the bytes are a JYB (by mimetype) */
export async function isJybPackage(archiveBytes: ArchiveSource): Promise<boolean> {
  return (await readArchiveMimetype(archiveBytes, JYB_PACKAGE_POLICY)) === JYB_MIMETYPE;
}

function checkLibraryScope(
  manifest: ProjectPackageManifest,
  data: LibraryData,
  problems: string[],
): void {
  const declaredProjects = manifest.projects.map((p) => p.id);
  const dataProjects = data.projects.map((p) => p.id);
  if (
    new Set(dataProjects).size !== dataProjects.length ||
    declaredProjects.length !== dataProjects.length ||
    declaredProjects.some((id) => !dataProjects.includes(id))
  ) {
    problems.push('projects[] does not match the projects in the data');
  }
  const seen = new Map<string, string>();
  const expected: string[] = [];
  for (const project of data.projects) {
    const texts = rowsOf(project.collections, 'texts');
    if (texts.length !== 1 || texts[0]?.id !== project.id) {
      problems.push(`project ${project.id}: the data must hold exactly this one project`);
    }
    for (const [name, rows] of Object.entries(project.collections)) {
      if (!Array.isArray(rows)) {
        problems.push(`project ${project.id}: ${name} is not a list`);
        continue;
      }
      if (JYB_SKIPPED_COLLECTIONS.has(name)) {
        problems.push(`project ${project.id}: ${name} must not be in a JYB`);
      }
      let foreign = 0;
      for (const row of rowsOf(project.collections, name)) {
        const owner =
          name === 'structural_rule_profiles' || PROJECT_AI_PROJECT_ID_OWNED.has(name)
            ? row.projectId
            : row.textId;
        if (typeof owner === 'string' && owner !== project.id) foreign += 1;
        const key = `${name}:${String(row.id)}`;
        const other = seen.get(key);
        if (other !== undefined && other !== project.id) {
          problems.push(`${key} appears in projects ${other} and ${project.id}`);
        }
        seen.set(key, project.id);
      }
      if (foreign > 0) {
        problems.push(
          `project ${project.id}: ${name}: ${foreign} row(s) belong to another project`,
        );
      }
    }
    expected.push(...collectOmittedEntities(project.collections).map((e) => `${e.type}:${e.id}`));
    const mediaById = new Map(
      rowsOf(project.collections, 'media_items').map((row) => [String(row.id), row]),
    );
    for (const entity of manifest.entities) {
      if (entity.type !== 'media' || entity.bytes !== 'included') continue;
      const row = mediaById.get(entity.id);
      if (row !== undefined && row.byteLocation !== 'managed') {
        problems.push(`media ${entity.id} is "included" but its row is not managed`);
      }
    }
  }
  const declared = manifest.entities.map((entity) => `${entity.type}:${entity.id}`);
  const missing = expected.filter((key) => !declared.includes(key));
  const extra = declared.filter((key) => !expected.includes(key));
  if (missing.length > 0) problems.push(`entities[] misses ${missing.length} byte-bearing row(s)`);
  if (extra.length > 0) problems.push(`entities[] lists ${extra.length} row(s) not in the data`);
}

/**
 * 写入前的全部检查（7.4-1）：mimetype、清单、版本、路径、哈希（含解密后的原始内容）、引用、
 * 一致性规则、项目归属和每一条记录。
 * Every pre-write check (7.4-1).
 */
async function inspectJyb(
  archiveBytes: ArchiveSource,
  options: JybReadOptions | undefined,
  dbIo: DbIoModule,
): Promise<InspectedLibrary> {
  const policy: JieyuArchiveImportPolicy = { ...JYB_PACKAGE_POLICY, ...options?.policy };
  const entryNames: string[] = [];
  const files = await unzipWithGuard(archiveBytes, policy, (name) => entryNames.push(name));
  const mimetypeBytes = await files.read('mimetype');
  const mimetype = mimetypeBytes ? toText(mimetypeBytes).trim() : null;
  if (mimetype !== JYB_MIMETYPE) {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Not a JYB backup (mimetype ${mimetype ?? '(missing)'})`,
    });
  }
  const manifestBytes = await files.read(MANIFEST_PATH);
  const rawManifest = readLegacyManifestOrNull(manifestBytes);
  if (!rawManifest) throw invalidPackage('jyb', [`missing or unreadable ${MANIFEST_PATH}`]);
  if (
    rawManifest.formatVersion !== PROJECT_PACKAGE_FORMAT_VERSION ||
    rawManifest.package !== 'jyb' ||
    rawManifest.kind !== 'library'
  ) {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Unsupported JYB formatVersion=${String(rawManifest.formatVersion)}`,
    });
  }
  const parsed = manifestSchema.safeParse(
    parseJsonWithGuard<unknown>(manifestBytes!, policy, 'manifest'),
  );
  if (!parsed.success) {
    throw invalidPackage(
      'jyb',
      parsed.error.issues
        .slice(0, 20)
        .map((issue) => `manifest ${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const manifest = parsed.data;
  if (manifest.dataSchemaVersion !== dbIo.SNAPSHOT_SCHEMA_VERSION) {
    dbIo.assertSupportedSnapshotVersion({ schemaVersion: manifest.dataSchemaVersion });
  }

  const problems: string[] = [];
  await checkFileTable('jyb', manifest, files, entryNames, problems, JYB_DATA_PATHS);
  if (problems.length > 0) throw invalidPackage('jyb', problems);

  const decryptor = manifest.encryption
    ? await createArchiveDecryptor(
        manifest.encryption as JieyuArchiveEncryptionMetadata,
        options?.password,
      )
    : null;
  const dataPath = manifest.encryption ? JYB_DATA_PATHS.encrypted : JYB_DATA_PATHS.plain;
  const storedData = (await files.read(dataPath))!;
  const dataBytes = decryptor ? await decryptor.decryptData(storedData) : storedData;
  const data = parseJsonWithGuard<LibraryData>(dataBytes, policy, 'library data');
  if (!Array.isArray(data?.projects)) throw invalidPackage('jyb', ['data has no projects list']);
  // 版本 + 逐条记录校验，与导入同一套（RD-1）| Version + per-record checks shared with import
  dbIo.assertSupportedSnapshotVersion(data);
  for (const project of data.projects) {
    await dbIo.prepareSnapshotImport(
      {
        schemaVersion: data.schemaVersion,
        exportedAt: data.exportedAt,
        dbName: data.dbName,
        collections: project.collections,
      },
      new Date().toISOString(),
      { keepProjectAi: true },
    );
  }
  checkLibraryScope(manifest, data, problems);
  const bytesByEntity = await readIncludedBytes(
    manifest,
    files,
    decryptor ? (bytes) => decryptor.decryptFile(bytes) : null,
    problems,
  );
  if (problems.length > 0) throw invalidPackage('jyb', problems);
  // 逐项目丢孤儿：父行必须在同一项目里 | Per project: parents must be in the same project
  const skippedOrphanRows = new Map<string, SkippedOrphanRows>();
  data.projects = data.projects.map((project) => {
    const orphans = dropOrphanRows(project.collections);
    skippedOrphanRows.set(project.id, orphans.skipped);
    return { ...project, collections: orphans.collections };
  });
  return {
    manifest,
    data,
    bytesByEntity,
    preferences: readPackagedUserPreferences(data.settings),
    skippedOrphanRows,
  };
}

// ─── 灾难恢复的前提 | Disaster restore preconditions (D7, T34) ────────────────

export type JybDisasterBlockedReason = 'collaborated' | 'local-bytes-would-be-lost';

export interface JybDisasterRestoreOption {
  available: boolean;
  reason?: JybDisasterBlockedReason;
  /** 本机现有项目数（还原会全部替换）| Local projects that the restore would replace */
  localProjectCount: number;
  bytesAtRisk: string[];
}

/** 整库合并（保留原 id），每张 JYB 表都有一项，replace-all 才会清空它 | Merged rows, original ids */
function mergeForDisasterRestore(inspected: InspectedLibrary): ProjectCollections {
  const merged: ProjectCollections = {};
  for (const name of JYB_MAIN_TABLES) merged[name] = [];
  for (const project of inspected.data.projects) {
    const withBytes = attachIncludedBytes(project.collections, inspected.bytesByEntity);
    for (const [name, rows] of Object.entries(withBytes)) {
      merged[name] = [...(merged[name] ?? []), ...rows];
    }
  }
  return merged;
}

async function collaboratedProjectIds(
  dexie: Dexie,
  inspected: InspectedLibrary,
): Promise<string[]> {
  const localIds = ((await dexie.table('texts').toArray()) as Row[]).map((row) => String(row.id));
  const packageIds = inspected.data.projects.map((p) => p.id);
  // 包里标为协作过或没有标记的项目，按协作过处理（REV5-N4）| Flagged or unflagged: collaborated
  const packageFlagged = inspected.manifest.projects
    .filter((project) => project.collaborated !== false)
    .map((project) => project.id);
  return [...new Set([...listCollaboratedIds([...localIds, ...packageIds]), ...packageFlagged])];
}

async function planDisasterRestore(inspected: InspectedLibrary): Promise<{
  option: JybDisasterRestoreOption;
  collections: ProjectCollections;
  identicalLocalBytes: Map<string, number>;
}> {
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const localProjectCount = await db.dexie.table('texts').count();
  const collections = mergeForDisasterRestore(inspected);
  const collaborated = await collaboratedProjectIds(db.dexie, inspected);
  if (collaborated.length > 0) {
    return {
      option: { available: false, reason: 'collaborated', localProjectCount, bytesAtRisk: [] },
      collections,
      identicalLocalBytes: new Map(),
    };
  }
  const identicalLocalBytes = await findIdenticalLocalBytes(
    db.dexie,
    inspected.bytesByEntity,
    true,
  );
  const bytesAtRisk = await findBytesAtRisk(db.dexie, null, collections, identicalLocalBytes);
  return {
    option: {
      available: bytesAtRisk.length === 0,
      ...(bytesAtRisk.length > 0 ? { reason: 'local-bytes-would-be-lost' as const } : {}),
      localProjectCount,
      bytesAtRisk,
    },
    collections,
    identicalLocalBytes,
  };
}

// ─── 预览 | Preview ───────────────────────────────────────────────────────────

export interface JybProjectPreview {
  id: string;
  title?: Record<string, string>;
  incoming: number;
  mediaWithoutBytes: number;
  includedBytesCount: number;
  /** 其中项目 AI 记忆与历史的行数 | Of which project AI memory / history rows */
  aiRows: number;
  skippedOrphanRows: SkippedOrphanRows;
}

export interface JybRestorePreview {
  manifest: ProjectPackageManifest;
  projects: JybProjectPreview[];
  collections: Array<{ name: string; incoming: number }>;
  totalIncoming: number;
  mediaWithoutBytes: number;
  includedBytes: { count: number; totalBytes: number };
  unresolvedSystemRefs: string[];
  disasterRestore: JybDisasterRestoreOption;
  /** 包里的用户偏好（只在整库还原时可选写回）| Packaged user preferences (disaster restore only) */
  preferences: { keys: string[]; ignoredKeys: string[] };
}

function countRows(collections: ProjectCollections): number {
  return Object.entries(collections)
    .filter(([name]) => name !== 'layers')
    .reduce((sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

/** 预览：做完全部写入前检查，不写任何数据 | Preview: every pre-write check, no writes */
export async function previewJybRestore(
  archiveBytes: ArchiveSource,
  options?: JybReadOptions,
): Promise<JybRestorePreview> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectJyb(archiveBytes, options, dbIo);
  const plan = await planDisasterRestore(inspected);
  const entityOwner = new Map<string, string>();
  for (const project of inspected.data.projects) {
    for (const entity of collectOmittedEntities(project.collections)) {
      entityOwner.set(`${entity.type}:${entity.id}`, project.id);
    }
  }
  const projects = inspected.data.projects.map((project) => {
    const own = inspected.manifest.entities.filter(
      (entity) => entityOwner.get(`${entity.type}:${entity.id}`) === project.id,
    );
    const title = rowsOf(project.collections, 'texts')[0]?.title as
      | Record<string, string>
      | undefined;
    return {
      id: project.id,
      ...(title !== undefined ? { title } : {}),
      incoming: countRows(project.collections),
      mediaWithoutBytes: own.filter((e) => e.type === 'media' && e.bytes === 'omitted').length,
      includedBytesCount: own.filter((e) => e.bytes === 'included').length,
      aiRows: countProjectAiRows(project.collections, PROJECT_AI_TABLES),
      skippedOrphanRows: inspected.skippedOrphanRows.get(project.id) ?? [],
    };
  });
  const byName = new Map<string, number>();
  for (const project of inspected.data.projects) {
    for (const [name, rows] of Object.entries(project.collections)) {
      if (name === 'layers' || !Array.isArray(rows)) continue;
      byName.set(name, (byName.get(name) ?? 0) + rows.length);
    }
  }
  const collections = [...byName.entries()]
    .map(([name, incoming]) => ({ name, incoming }))
    .filter((item) => item.incoming > 0)
    .sort((a, b) => b.incoming - a.incoming || a.name.localeCompare(b.name, 'en'));
  const included = [...inspected.bytesByEntity.values()];
  return {
    manifest: inspected.manifest,
    projects,
    collections,
    totalIncoming: collections.reduce((sum, item) => sum + item.incoming, 0),
    mediaWithoutBytes: inspected.manifest.entities.filter(
      (entity) => entity.type === 'media' && entity.bytes === 'omitted',
    ).length,
    includedBytes: {
      count: included.length,
      totalBytes: included.reduce((sum, item) => sum + item.blob.size, 0),
    },
    unresolvedSystemRefs: listUnresolvedSystemRefs(
      inspected.manifest.systemRefs.map((ref) => ref.id),
    ),
    disasterRestore: plan.option,
    preferences: {
      keys: inspected.preferences.entries.map((entry) => entry.key),
      ignoredKeys: inspected.preferences.ignoredKeys,
    },
  };
}

// ─── 逐项目导入（默认）| Per-project import (default, T30) ─────────────────────

export interface JybImportedProject {
  sourceProjectId: string;
  projectId: string;
  title?: Record<string, string>;
  skippedOrphanRows: SkippedOrphanRows;
}

export interface JybProjectImportResult {
  projects: JybImportedProject[];
  importResult: ImportResult;
  skippedLanguageIds: string[];
}

/**
 * 把包里选中的项目（默认全部）作为新项目加入：全部 id 重新生成、记录 restoredFrom，本机现有数据
 * 不动。所有选中项目在一个事务里写入，失败时整体回滚。
 * Add the selected projects (all by default) as new projects: every id regenerated, restoredFrom
 * recorded, local data untouched. Written in one transaction; any failure rolls back.
 */
export async function importJybProjectsAsNew(
  archiveBytes: ArchiveSource,
  options?: JybReadOptions & {
    projectIds?: readonly string[];
    /** 随项目导入 AI 记忆与历史，默认是（7.5）| Import project AI with the project (default yes, 7.5) */
    includeProjectAi?: boolean;
  },
): Promise<JybProjectImportResult> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectJyb(archiveBytes, options, dbIo);
  const wanted = options?.projectIds;
  const selected = inspected.data.projects.filter(
    (project) => wanted === undefined || wanted.includes(project.id),
  );
  if (wanted !== undefined) {
    const unknown = wanted.filter((id) => !inspected.data.projects.some((p) => p.id === id));
    if (unknown.length > 0)
      throw new Error(`JYB does not contain project(s): ${unknown.join(', ')}`);
  }
  if (selected.length === 0) throw new Error('No project selected for import');

  const merged: ProjectCollections = {};
  const imported: JybImportedProject[] = [];
  const takenLanguageIds = new Set<string>();
  const skipped = new Set<string>();
  const includeProjectAi = options?.includeProjectAi !== false;
  for (const project of selected) {
    const collections = includeProjectAi
      ? project.collections
      : Object.fromEntries(
          Object.entries(project.collections).filter(([name]) => !PROJECT_AI_TABLE_SET.has(name)),
        );
    const prepared = await prepareRestoreAsNew({
      kind: 'jyb',
      sourceProjectId: project.id,
      exportedAt: inspected.manifest.created,
      collections,
      bytesByEntity: inspected.bytesByEntity,
      takenLanguageIds,
    });
    for (const row of rowsOf(prepared.collections, 'languages'))
      takenLanguageIds.add(String(row.id));
    for (const id of prepared.skippedLanguageIds) skipped.add(id);
    for (const [name, rows] of Object.entries(prepared.collections)) {
      merged[name] = [...(merged[name] ?? []), ...rows];
    }
    imported.push({
      sourceProjectId: project.id,
      projectId: prepared.projectId,
      ...(prepared.title !== undefined ? { title: prepared.title } : {}),
      skippedOrphanRows: inspected.skippedOrphanRows.get(project.id) ?? [],
    });
  }
  const importResult = await dbIo.importDatabaseFromJson(
    {
      schemaVersion: inspected.data.schemaVersion,
      exportedAt: inspected.data.exportedAt,
      dbName: inspected.data.dbName,
      collections: merged,
    },
    { strategy: 'upsert', keepProjectAi: includeProjectAi },
  );
  return { projects: imported, importResult, skippedLanguageIds: [...skipped].sort() };
}

// ─── 灾难恢复（整库还原）| Disaster restore (whole-database, D7, T34) ─────────

export interface JybDisasterRestoreResult {
  projectIds: string[];
  /** 整库快照的序号 | Sequence number of the whole-database snapshot */
  snapshotSeq: number;
  importResult: ImportResult;
  /** 写回的用户偏好键（没勾选时为空）| Preference keys written back (empty unless opted in) */
  restoredPreferenceKeys: string[];
  /** 全部项目按表合计的孤儿行（BF1N3-2）| Orphan rows across all projects, summed per table */
  skippedOrphanRows: SkippedOrphanRows;
}

/**
 * 灾难恢复：让本机回到备份时的状态，保留原 id。前提与顺序：全部包检查 → 本机与包里的项目都从未
 * 协作过（D7）→ 不会丢本机字节（4.2-7）→ 整库快照（失败就中止）→ 一个事务里再判定一次、清空 JYB
 * 涉及的表（含项目 AI）并写入。二次确认在界面上完成。凭据、审计日志、派生数据不在包里，本机的
 * 这些行保持不动；协作绑定不还原。
 * Disaster restore: bring this device back to the backup, original ids kept. Preconditions and
 * order: package checks → every local and packaged project never collaborated (D7) → no local
 * bytes lost (4.2-7) → whole-database snapshot (abort on failure) → one transaction that re-checks,
 * clears the JYB tables and writes. The double confirm happens in the UI.
 */
export async function disasterRestoreFromJyb(
  archiveBytes: ArchiveSource,
  options?: JybReadOptions & {
    /** 同时写回包里的用户偏好（询问后还原，7.5）；默认否 | Also restore packaged preferences (default no) */
    restorePreferences?: boolean;
  },
): Promise<JybDisasterRestoreResult> {
  const [dbIo, snapshots, engine] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectOverwriteSnapshotStore') as Promise<OverwriteSnapshotModule>,
    import('../db/engine') as Promise<DbEngineModule>,
  ]);
  const inspected = await inspectJyb(archiveBytes, options, dbIo);
  const plan = await planDisasterRestore(inspected);
  if (!plan.option.available) {
    throw new ProjectOverwriteBlockedError({
      reason: plan.option.reason === 'collaborated' ? 'not-allowed' : 'local-bytes-would-be-lost',
      message:
        plan.option.reason === 'collaborated'
          ? 'Disaster restore is only offered when every local and packaged project has never been collaborated on.'
          : `Disaster restore aborted: ${plan.option.bytesAtRisk.length} local recording/attachment byte(s) would be lost.`,
      bytesAtRisk: plan.option.bytesAtRisk,
    });
  }

  let snapshotSeq: number;
  try {
    const before = await dbIo.exportDatabaseAsJson({
      skipCollections: JYB_SKIPPED_COLLECTIONS,
      includeProjectAi: true,
    });
    const restorePreferences = options?.restorePreferences === true;
    snapshotSeq = await snapshots.saveProjectOverwriteSnapshot({
      projectId: LIBRARY_SNAPSHOT_KEY,
      packageKind: 'jyb',
      snapshot: {
        schemaVersion: before.schemaVersion,
        collections: before.collections,
        // 会被覆盖的偏好的旧值，供从快照恢复 | Old values of preferences about to be overwritten
        ...(restorePreferences
          ? {
              preferences: readCurrentUserPreferences(
                inspected.preferences.entries.map((entry) => entry.key),
              ),
            }
          : {}),
      },
    });
  } catch (error) {
    throw new ProjectOverwriteBlockedError({
      reason: 'snapshot-failed',
      message: `Disaster restore aborted: the whole-database snapshot failed (${error instanceof Error ? error.message : String(error)}).`,
      cause: error,
    });
  }

  const db = await engine.getDb();
  const byteTables = byteGuardTables(db.dexie);
  const importResult = await dbIo.importDatabaseFromJson(
    {
      schemaVersion: inspected.data.schemaVersion,
      exportedAt: inspected.data.exportedAt,
      dbName: inspected.data.dbName,
      collections: plan.collections,
    },
    {
      strategy: 'replace-all',
      keepProjectAi: true,
      preWrite: {
        tables: byteTables,
        run: async () => {
          // 快照之后可能又有写入：在写事务里再判定一次 | Re-check inside the write transaction
          const atRisk = await findBytesAtRisk(
            db.dexie,
            null,
            plan.collections,
            plan.identicalLocalBytes,
          );
          const collaborated = await collaboratedProjectIds(db.dexie, inspected);
          if (atRisk.length > 0 || collaborated.length > 0) {
            throw new ProjectOverwriteBlockedError({
              reason: atRisk.length > 0 ? 'local-bytes-would-be-lost' : 'not-allowed',
              message: 'Disaster restore aborted: the database changed after the preview.',
              bytesAtRisk: atRisk,
            });
          }
        },
      },
    },
  );
  const restoredPreferenceKeys =
    options?.restorePreferences === true
      ? await applyUserPreferences(inspected.preferences.entries)
      : [];
  const orphanSums = new Map<string, number>();
  for (const { collection, count } of [...inspected.skippedOrphanRows.values()].flat()) {
    orphanSums.set(collection, (orphanSums.get(collection) ?? 0) + count);
  }
  return {
    projectIds: inspected.data.projects.map((p) => p.id),
    snapshotSeq,
    importResult,
    restoredPreferenceKeys,
    skippedOrphanRows: [...orphanSums].map(([collection, count]) => ({ collection, count })),
  };
}
