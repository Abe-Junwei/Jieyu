/**
 * 单项目包 JYT / JYM 的公共实现（rev5 D1、7.1–7.4；第 3 批）。
 * Shared implementation of the single-project JYT / JYM packages (rev5 D1, 7.1–7.4; batch 3).
 *
 * 包结构 | Layout
 *   mimetype                    application/vnd.jieyu.jyt | application/vnd.jieyu.jym（不压缩，第一个条目）
 *   META-INF/manifest.json      按条目类型规定的清单（7.2）
 *   data/project.json           项目范围的快照（加密时为 data/project.enc）
 *   media/<id>                  JYM：录音原始字节（不压缩；加密时为密文）
 *   attachments/<id>            JYM：词条附件原始字节
 *
 * - 只含一个项目：内容、标注文档、全部目录行；系统模板只以 systemRefs 出现（7.3）。
 * - JYT 不含任何字节文件，每个媒体 / 附件 / 来源原件实体都是 `bytes: omitted`（D1）。
 * - JYM 默认带受管媒体与附件字节（`bytes: included`，sha256 与大小写在实体上）；选择不带时
 *   `media: excluded`，实体全部 `omitted`，与 JYT 相同。
 * - 都不含 AI 记忆与历史、审计日志、派生数据、凭据、协作状态（7.5 分类表）。
 * - 入站：写入前检查清单、版本、路径、上限、哈希（含解密后的原始内容哈希）、引用、一致性规则和
 *   每一条记录（7.4-1）；默认恢复为新项目，所有 id 重新映射，记录 restoredFrom（7.4-2）；
 *   覆盖当前项目只对从未协作过的项目开放（7.4-3）。
 */
import type { Dexie, Table } from 'dexie';
import { strToU8 } from 'fflate';
import { blobBytes, bytesBlob, zipToBlob, type ZipBlobEntry } from './zipBlob';
import { z } from 'zod';
import type { ImportResult } from '../db/types';
import { ProjectOverwriteBlockedError, SnapshotFormatError } from '../db/snapshotFormatError';
import { isProjectNeverCollaborated } from '../collaboration/cloud/projectCollaborationHistory';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuDataClass } from '../db/tableRegistry';
import { JIEYU_PARENT_CONSISTENCY_RULES } from '../db/ownershipImmutabilityMiddleware';
import { createLogger } from '../observability/logger';
import { listUnresolvedSystemRefs } from '../annotation/systemStructuralRuleProfiles';
import {
  createArchiveDecryptor,
  createArchiveEncryptor,
  normalizeImportPolicy,
  parseJsonWithGuard,
  sha256Hex,
  toJsonBytes,
  readArchiveMimetype,
  toText,
  unzipWithGuard,
  type ArchiveSource,
  type GuardedArchive,
  type JieyuArchiveEncryptionMetadata,
  type JieyuArchiveEncryptionOptions,
  type JieyuArchiveImportPolicy,
} from './projectArchiveContainer';
import {
  collectArchiveProjectDocuments,
  collectArchiveSystemRefs,
} from './archiveProjectDocuments';
import {
  buildProjectIdRemap,
  remapProjectCollections,
  type ProjectCollections,
} from './projectPackageIdRemap';

export type ProjectPackageKind = 'jyt' | 'jym';
/** 含整库备份 JYB 的全部包类型 | Every package kind, whole-database JYB included */
export type PackageKind = ProjectPackageKind | 'jyb';

export const PROJECT_PACKAGE_MIMETYPES: Readonly<Record<ProjectPackageKind, string>> = {
  jyt: 'application/vnd.jieyu.jyt',
  jym: 'application/vnd.jieyu.jym',
};
/** 第 3 批之前的整库 JYT / JYM（只用来给出明确的拒绝）| Pre-batch-3 whole-DB packages (rejected clearly) */
export const LEGACY_PACKAGE_MIMETYPES: Readonly<Record<ProjectPackageKind, string>> = {
  jyt: 'application/x-jieyu-text',
  jym: 'application/x-jieyu-media',
};
export const PROJECT_PACKAGE_FORMAT_VERSION = 1;

const MiB = 1024 * 1024;
/**
 * JYM 带字节，上限比 JYT 大；导出用同一组上限（7.4-8 对称）。包按 Blob 处理（4b 流式处理），
 * 整包不进内存，总量只受 ZIP32 的 4 GiB 限制。
 * JYM carries bytes, so its limits are larger than JYT's; export checks the same limits (7.4-8,
 * symmetric). Packages are handled as Blobs (4b streaming), never whole in memory; the total is only
 * bounded by ZIP32's 4 GiB.
 *
 * shortcut: 单个字节文件仍整份读进内存算 SHA-256（WebCrypto 不能分段），所以每条 1 GiB；
 * 单个录音超过 1 GiB 成为真实需求时，换成分段 SHA-256 再放开。
 * shortcut: one byte file is still read whole for SHA-256 (WebCrypto is not incremental), hence
 * 1 GiB per entry; switch to an incremental SHA-256 when single recordings above 1 GiB are real.
 */
export const JYM_PACKAGE_POLICY: JieyuArchiveImportPolicy = {
  maxArchiveBytes: 4095 * MiB,
  maxEntryCount: 4096,
  maxEntryBytes: 1024 * MiB,
  maxExpandedBytes: 4095 * MiB,
  maxJsonDepth: 64,
  maxJsonNodes: 500_000,
};

function packagePolicy(
  kind: ProjectPackageKind,
  override?: Partial<JieyuArchiveImportPolicy>,
): JieyuArchiveImportPolicy {
  return kind === 'jym' ? { ...JYM_PACKAGE_POLICY, ...override } : normalizeImportPolicy(override);
}

export const MANIFEST_PATH = 'META-INF/manifest.json';
const DATA_PATH = 'data/project.json';
const DATA_ENCRYPTED_PATH = 'data/project.enc';
/** 包内数据文件的路径（明文 / 加密）| Data file paths (plain / encrypted) */
export interface PackageDataPaths {
  plain: string;
  encrypted: string;
}
const PROJECT_DATA_PATHS: PackageDataPaths = { plain: DATA_PATH, encrypted: DATA_ENCRYPTED_PATH };

type EntityType = 'media' | 'attachment' | 'source-original';
const BYTE_DIR: Readonly<Record<EntityType, string>> = {
  media: 'media/',
  attachment: 'attachments/',
  'source-original': 'sources/',
};
type ByteCollection = 'media_items' | 'lexeme_assets' | 'source_records';
const ENTITY_COLLECTION: Readonly<Record<EntityType, ByteCollection>> = {
  media: 'media_items',
  attachment: 'lexeme_assets',
  'source-original': 'source_records',
};

/** 项目包不带的数据类（7.5）| Data classes a project package never carries (7.5) */
const PACKAGE_EXCLUDED_DATA_CLASSES: ReadonlySet<JieyuDataClass> = new Set<JieyuDataClass>([
  'project_ai',
  'audit_log',
  'credential',
  'derived',
  'collab_state',
  'recovery',
  'private_log',
  'user_preference',
]);

const PACKAGE_SKIPPED_COLLECTIONS: ReadonlySet<string> = new Set(
  Object.entries(JIEYU_MAIN_TABLE_REGISTRY)
    .filter(([, registration]) => PACKAGE_EXCLUDED_DATA_CLASSES.has(registration.dataClass))
    .map(([name]) => name),
);

// ─── 清单 | Manifest (rev5 7.2) ──────────────────────────────────────────────

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const isoSchema = z.string().min(1);

const entitySchema = z
  .object({
    type: z.enum(['media', 'attachment', 'source-original']),
    id: z.string().min(1),
    bytes: z.enum(['included', 'omitted']),
    fileRef: z.string().min(1).optional(),
    timelineKind: z.enum(['acoustic', 'placeholder']).optional(),
    byteLocation: z.enum(['managed', 'url', 'none']).optional(),
    availability: z.enum(['available', 'missing']).optional(),
    contentSha256: sha256Schema.optional(),
    contentSize: z.number().int().nonnegative().optional(),
    /** 只在 included 时：恢复成 Blob 用的 MIME | Only when included: MIME of the restored Blob */
    mimeType: z.string().max(255).optional(),
    url: z.string().min(1).optional(),
  })
  .strict();

const fileSchema = z
  .object({
    path: z.string().min(1),
    sha256: sha256Schema,
    size: z.number().int().nonnegative(),
    role: z.enum(['data', 'media', 'attachment', 'source-original']),
  })
  .strict();

const encryptionSchema = z
  .object({
    mode: z.literal('aes-256-gcm'),
    kdf: z.literal('PBKDF2-SHA-256'),
    iterations: z.number().int().positive(),
    saltBase64: z.string().min(1),
    ivBase64: z.string().min(1),
    passwordHint: z.string().optional(),
  })
  .strict();

export const manifestSchema = z
  .object({
    package: z.enum(['jyt', 'jym', 'jyb']),
    formatVersion: z.literal(PROJECT_PACKAGE_FORMAT_VERSION),
    appVersion: z.string().min(1),
    created: isoSchema,
    kind: z.enum(['project', 'library']),
    digestAlgorithm: z.literal('sha256'),
    media: z.enum(['included', 'excluded', 'partial']),
    dataSchemaVersion: z.number().int().positive(),
    projects: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.record(z.string(), z.string()).optional(),
          restoredFrom: z
            .object({ projectId: z.string().min(1) })
            .passthrough()
            .optional(),
          defaultDocumentId: z.string().min(1).optional(),
          /** 只在 JYB：导出设备上是否协作过（不确定按 true）；缺失按协作过（D7、REV5-N4）| JYB only */
          collaborated: z.boolean().optional(),
          documents: z.array(
            z
              .object({
                documentId: z.string().min(1),
                isDefault: z.boolean(),
                layerIds: z.array(z.string()),
                sourceIds: z.array(z.string()),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    entities: z.array(entitySchema),
    files: z.array(fileSchema),
    systemRefs: z.array(z.object({ id: z.string().min(1) }).strict()),
    excluded: z.array(
      z
        .object({
          kind: z.string().min(1),
          count: z.number().int().nonnegative(),
          reason: z.string().min(1),
        })
        .strict(),
    ),
    encryption: encryptionSchema.optional(),
  })
  .strict();

export type ProjectPackageManifest = z.infer<typeof manifestSchema>;
export type PackageEntity = z.infer<typeof entitySchema>;
export type PackageFile = z.infer<typeof fileSchema>;

type Row = Record<string, unknown>;

const log = createLogger('projectPackageService');
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');
type ProjectSnapshotModule = typeof import('../db/projectScopedSnapshot');
type ProjectPurgeModule = typeof import('../db/projectLocalPurge');
type WithTransactionModule = typeof import('../db/withTransaction');
type OverwriteSnapshotModule = typeof import('../db/projectOverwriteSnapshotStore');

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
    ? __APP_VERSION__.trim()
    : 'dev';
}

export function rowsOf(collections: ProjectCollections, name: string): Row[] {
  const rows = collections[name];
  return Array.isArray(rows)
    ? rows.filter((row): row is Row => row !== null && typeof row === 'object')
    : [];
}

/** 导入前读本机字节用的表（P5）| Tables read for local-byte guards before import (P5) */
export function byteGuardTables(dexie: Dexie): Table[] {
  return (['media_items', 'lexeme_assets', 'source_records', 'texts'] as const).map((name) =>
    dexie.table(name),
  );
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
}

export function invalidPackage(kind: PackageKind, problems: string[]): SnapshotFormatError {
  return new SnapshotFormatError({
    code: 'invalid-package',
    message: `Invalid ${kind.toUpperCase()} package: ${problems.join('; ')}`,
    problems,
  });
}

/** 由 id 生成的安全路径（7.2：路径由 ID 生成）| Safe path derived from the id (7.2) */
function bytePathFor(type: EntityType, id: string): string {
  return `${BYTE_DIR[type]}${encodeURIComponent(id).replace(/\./g, '%2E')}`;
}

/**
 * 包超过容量上限（导出与导入对称，7.4-8）。| The package exceeds the size limit (export and import
 * are symmetric, 7.4-8).
 */
export class ProjectPackageTooLargeError extends Error {
  readonly totalBytes: number;
  readonly limitBytes: number;
  constructor(totalBytes: number, limitBytes: number) {
    super(
      `Project package too large: ${totalBytes} bytes exceed the limit of ${limitBytes} bytes; export a JYT (no audio) or a JYM without media instead.`,
    );
    this.name = 'ProjectPackageTooLargeError';
    this.totalBytes = totalBytes;
    this.limitBytes = limitBytes;
  }
}

// ─── 导出 | Export ───────────────────────────────────────────────────────────

/** 包里的媒体 / 附件 / 来源原件实体（全部 omitted 的形态）| Byte-bearing entities, all omitted */
export function collectOmittedEntities(collections: ProjectCollections): PackageEntity[] {
  const entities: PackageEntity[] = [];
  for (const media of rowsOf(collections, 'media_items')) {
    const byteLocation = media.byteLocation as PackageEntity['byteLocation'];
    entities.push({
      type: 'media',
      id: String(media.id),
      bytes: 'omitted',
      timelineKind: media.timelineKind as PackageEntity['timelineKind'],
      ...(byteLocation !== undefined ? { byteLocation } : {}),
      availability: media.availability as PackageEntity['availability'],
      ...(typeof media.contentSha256 === 'string' ? { contentSha256: media.contentSha256 } : {}),
      ...(typeof media.contentSize === 'number' ? { contentSize: media.contentSize } : {}),
      ...(byteLocation === 'url' && str(media.url) !== undefined ? { url: String(media.url) } : {}),
    });
  }
  for (const asset of rowsOf(collections, 'lexeme_assets')) {
    entities.push({
      type: 'attachment',
      id: String(asset.id),
      bytes: 'omitted',
      ...(typeof asset.byteSize === 'number' && Number.isInteger(asset.byteSize)
        ? { contentSize: asset.byteSize }
        : {}),
    });
  }
  for (const source of rowsOf(collections, 'source_records')) {
    if (source.storedBytes !== true) continue;
    entities.push({
      type: 'source-original',
      id: String(source.id),
      bytes: 'omitted',
      ...(typeof source.sha256 === 'string' ? { contentSha256: source.sha256 } : {}),
      ...(typeof source.byteSize === 'number' ? { contentSize: source.byteSize } : {}),
    });
  }
  return entities;
}

/** 去掉内嵌的 data URL 音频并标为省略 | Strip inline audio data URLs and mark them omitted */
export function stripInlineMediaBytes(collections: ProjectCollections): void {
  for (const media of rowsOf(collections, 'media_items')) {
    const details = media.details as Row | undefined;
    if (details && typeof details.audioDataUrl === 'string') {
      delete details.audioDataUrl;
      details.audioExportOmitted = true;
    }
  }
}

export interface PackedByteFile {
  entityKey: string;
  path: string;
  role: EntityType;
  /** 原 Blob 的引用，打包时不复制 | Reference to the original Blob; not copied when zipping */
  blob: Blob;
}

/**
 * JYM：把受管媒体与附件的 Blob 取出成字节文件，行里不留 Blob；没有本机字节的照常省略。
 * 先按 Blob 大小检查上限；之后逐个读一次算哈希，打包时只引用 Blob。
 * JYM: turn managed media / attachment Blobs into byte files and leave no Blob in the rows; rows
 * without local bytes stay omitted. Sizes are checked against the limit before any bytes are read.
 */
export async function packIncludedBytes(
  collections: ProjectCollections,
  entities: PackageEntity[],
  dbIo: DbIoModule,
  policy: JieyuArchiveImportPolicy,
): Promise<PackedByteFile[]> {
  const byKey = new Map(entities.map((entity) => [`${entity.type}:${entity.id}`, entity]));
  const pending: Array<{ key: string; type: EntityType; row: Row; blob: Blob }> = [];
  for (const row of rowsOf(collections, 'media_items')) {
    const details = asRecord(row.details);
    const blob = details.audioBlob;
    if (blob instanceof Blob && row.byteLocation === 'managed') {
      pending.push({ key: `media:${String(row.id)}`, type: 'media', row, blob });
    } else {
      dbIo.markMediaBytesOmitted(row);
    }
  }
  for (const row of rowsOf(collections, 'lexeme_assets')) {
    if (row.blob instanceof Blob) {
      pending.push({
        key: `attachment:${String(row.id)}`,
        type: 'attachment',
        row,
        blob: row.blob,
      });
    }
  }
  const total = pending.reduce((sum, item) => sum + item.blob.size, 0);
  const largest = pending.reduce((max, item) => Math.max(max, item.blob.size), 0);
  if (total > policy.maxExpandedBytes || largest > policy.maxEntryBytes) {
    throw new ProjectPackageTooLargeError(
      total,
      Math.min(policy.maxExpandedBytes, policy.maxArchiveBytes),
    );
  }
  if (pending.length + 3 > policy.maxEntryCount) {
    throw new ProjectPackageTooLargeError(total, policy.maxExpandedBytes);
  }

  const packed: PackedByteFile[] = [];
  for (const item of pending) {
    const sha = await sha256Hex(await blobBytes(item.blob));
    const size = item.blob.size;
    const path = bytePathFor(item.type, String(item.row.id));
    const mimeType = item.blob.type || str(item.row.mimeType);
    const entity = byKey.get(item.key);
    if (entity === undefined) continue;
    entity.bytes = 'included';
    entity.fileRef = path;
    entity.contentSha256 = sha;
    entity.contentSize = size;
    if (mimeType !== undefined) entity.mimeType = mimeType;
    if (item.type === 'media') {
      const details = { ...asRecord(item.row.details) };
      delete details.audioBlob;
      item.row.details = details;
      // 数据行与字节一致 | The data row matches its bytes
      item.row.contentSha256 = sha;
      item.row.contentSize = size;
    } else {
      delete item.row.blob;
      item.row.byteSize = size;
    }
    packed.push({ entityKey: item.key, path, role: item.type, blob: item.blob });
  }
  return packed;
}

export interface ProjectPackageExportOptions {
  encryption?: JieyuArchiveEncryptionOptions;
  /** 只对 JYM：默认 true；false 时 `media: excluded`（D1）| JYM only: default true; false gives `media: excluded` */
  includeMedia?: boolean;
  /** 覆盖容量上限（测试用；默认与导入相同）| Override the size limits (tests; defaults match import) */
  policy?: Partial<JieyuArchiveImportPolicy>;
}

/**
 * 导出一个项目为 JYT / JYM。整个读取在一个只读事务里完成（JY-13）。
 * Export one project as a JYT / JYM; all reads happen in one read-only transaction (JY-13).
 */
export async function exportProjectPackage(
  kind: ProjectPackageKind,
  textId: string,
  options?: ProjectPackageExportOptions,
): Promise<Blob> {
  const projectId = textId.trim();
  if (projectId.length === 0) throw new Error(`export ${kind} requires a project textId`);
  const includeMedia = kind === 'jym' && options?.includeMedia !== false;
  const policy = packagePolicy(kind, options?.policy);
  const [dbIo, scoped] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectScopedSnapshot') as Promise<ProjectSnapshotModule>,
  ]);
  const full = await dbIo.exportDatabaseAsJson({
    skipCollections: PACKAGE_SKIPPED_COLLECTIONS,
    retainByteBlobs: includeMedia,
  });
  const collections = scoped.filterCollectionsForProject(full.collections, projectId);
  for (const name of Object.keys(collections)) {
    if (PACKAGE_SKIPPED_COLLECTIONS.has(name)) delete collections[name];
  }
  const text = rowsOf(collections, 'texts')[0];
  if (text === undefined) throw new Error(`Project ${projectId} does not exist`);
  stripInlineMediaBytes(collections);

  const entities = collectOmittedEntities(collections);
  const byteFiles = includeMedia
    ? await packIncludedBytes(collections, entities, dbIo, policy)
    : [];
  const dataBytes = toJsonBytes({
    schemaVersion: full.schemaVersion,
    exportedAt: full.exportedAt,
    dbName: full.dbName,
    collections,
  });

  const [project] = collectArchiveProjectDocuments({ collections });
  const omittedReason =
    kind === 'jyt' ? 'jyt-carries-no-bytes' : includeMedia ? 'no-local-bytes' : 'media-excluded';
  return assemblePackage({
    kind,
    mimetype: PROJECT_PACKAGE_MIMETYPES[kind],
    dataBytes,
    dataPaths: PROJECT_DATA_PATHS,
    entities,
    byteFiles,
    policy,
    ...(options?.encryption ? { encryption: options.encryption } : {}),
    manifest: {
      package: kind,
      formatVersion: PROJECT_PACKAGE_FORMAT_VERSION,
      appVersion: appVersion(),
      created: full.exportedAt,
      kind: 'project',
      digestAlgorithm: 'sha256',
      media: includeMedia ? 'included' : 'excluded',
      dataSchemaVersion: full.schemaVersion,
      projects: [
        {
          id: projectId,
          ...(text.title !== undefined ? { title: text.title as Record<string, string> } : {}),
          ...(text.restoredFrom !== undefined
            ? { restoredFrom: text.restoredFrom as { projectId: string } }
            : {}),
          ...(project?.defaultDocumentId !== undefined
            ? { defaultDocumentId: project.defaultDocumentId }
            : {}),
          documents: project?.documents ?? [],
        },
      ],
      systemRefs: collectArchiveSystemRefs({ collections }),
      excluded: omittedBytesSummary(entities, omittedReason),
    },
  });
}

/** 省略字节的条目按类型计数（manifest.excluded）| Omitted byte entities counted per type */
export function omittedBytesSummary(
  entities: readonly PackageEntity[],
  reason: string,
): ProjectPackageManifest['excluded'] {
  return (['media', 'attachment', 'source-original'] as const)
    .map((type) => ({
      kind: `${type}-bytes`,
      count: entities.filter((entity) => entity.type === type && entity.bytes === 'omitted').length,
      reason,
    }))
    .filter((item) => item.count > 0);
}

/**
 * 加密（可选）、写 `files[]`、检查容量上限并打成 ZIP Blob；JYT / JYM / JYB 共用。不加密时字节文件
 * 直接引用原 Blob；加密时一次只有一个文件在内存里。
 * Encrypt (optional), fill `files[]`, check the size limit and zip into a Blob; shared by JYT / JYM /
 * JYB. Unencrypted byte files reference the original Blobs; encrypted ones are in memory one at a time.
 */
export async function assemblePackage(input: {
  kind: PackageKind;
  mimetype: string;
  dataBytes: Uint8Array;
  dataPaths: PackageDataPaths;
  entities: PackageEntity[];
  byteFiles: readonly PackedByteFile[];
  policy: JieyuArchiveImportPolicy;
  encryption?: JieyuArchiveEncryptionOptions;
  manifest: Omit<ProjectPackageManifest, 'entities' | 'files' | 'encryption'>;
}): Promise<Blob> {
  const { entities, policy } = input;
  const encryptor = input.encryption ? await createArchiveEncryptor(input.encryption) : null;
  const files: PackageFile[] = [];
  const storedPath = encryptor ? input.dataPaths.encrypted : input.dataPaths.plain;
  const storedData = encryptor ? await encryptor.encryptData(input.dataBytes) : input.dataBytes;
  files.push({
    path: storedPath,
    sha256: await sha256Hex(storedData),
    size: storedData.byteLength,
    role: 'data',
  });
  let totalBytes = storedData.byteLength;
  const storedByteFiles: ZipBlobEntry[] = [];
  for (const file of input.byteFiles) {
    let stored = file.blob;
    let sha256 = String(
      entities.find((entity) => `${entity.type}:${entity.id}` === file.entityKey)?.contentSha256,
    );
    if (encryptor) {
      const encrypted = await encryptor.encryptFile(await blobBytes(file.blob));
      sha256 = await sha256Hex(encrypted);
      stored = bytesBlob(encrypted);
    }
    totalBytes += stored.size;
    files.push({ path: file.path, sha256, size: stored.size, role: file.role });
    storedByteFiles.push({ name: file.path, data: stored });
  }
  if (totalBytes > policy.maxArchiveBytes) {
    throw new ProjectPackageTooLargeError(totalBytes, policy.maxArchiveBytes);
  }

  const manifest: ProjectPackageManifest = {
    ...input.manifest,
    entities,
    files,
    ...(encryptor ? { encryption: encryptor.metadata } : {}),
  };

  // mimetype 放第一条且不压缩，便于识别；字节文件不压缩 | mimetype first and stored; bytes stored
  return zipToBlob([
    { name: 'mimetype', data: strToU8(input.mimetype) },
    { name: MANIFEST_PATH, data: toJsonBytes(manifest), deflate: true },
    { name: storedPath, data: storedData, deflate: true },
    ...storedByteFiles,
  ]);
}

export async function downloadProjectPackage(
  kind: ProjectPackageKind,
  textId: string,
  baseName = 'jieyu-project',
  options?: ProjectPackageExportOptions,
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadProjectPackage can only run in browser context');
  }
  const url = URL.createObjectURL(await exportProjectPackage(kind, textId, options));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.${kind}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * 识别项目包类型（含旧整库 JYT / JYM，用于分派到这里给出明确的拒绝）；不是项目包时为 null。
 * Detect the project package kind (old whole-DB JYT / JYM included, so they get a clear refusal);
 * null when the bytes are not a project package.
 */
export async function detectProjectPackageKind(
  archiveBytes: ArchiveSource,
): Promise<ProjectPackageKind | null> {
  const mimetype = await readArchiveMimetype(archiveBytes, JYM_PACKAGE_POLICY);
  for (const kind of ['jyt', 'jym'] as const) {
    if (
      mimetype === PROJECT_PACKAGE_MIMETYPES[kind] ||
      mimetype === LEGACY_PACKAGE_MIMETYPES[kind]
    ) {
      return kind;
    }
  }
  return null;
}

// ─── 入站检查 | Inbound checks (rev5 7.4-1, T31, T32) ─────────────────────────

/** OCFL 式路径检查 | OCFL-style path safety */
function unsafePathReason(path: string): string | null {
  if (path.length === 0) return 'empty path';
  if (path.startsWith('/') || path.endsWith('/')) return 'leading or trailing slash';
  if (path.includes('\\')) return 'backslash';
  if (/^[a-zA-Z]:/.test(path)) return 'drive letter';
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'control character';
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'empty, "." or ".." segment';
  }
  return null;
}

export function readLegacyManifestOrNull(raw: Uint8Array | undefined): Row | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(toText(raw)) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Row) : null;
  } catch {
    return null;
  }
}

/** 已核对的字节（原始内容）| Verified bytes (original content) */
export interface InboundBytes {
  /** 不加密时是包文件的切片（不复制）| Unencrypted: a slice of the package file (no copy) */
  blob: Blob;
  mimeType?: string;
  sha256: string;
}

interface InspectedPackage {
  kind: ProjectPackageKind;
  manifest: ProjectPackageManifest;
  snapshot: {
    schemaVersion: number;
    exportedAt: string;
    dbName: string;
    collections: ProjectCollections;
  };
  sourceProjectId: string;
  /** `type:id` → 字节（只有 included 的实体）| `type:id` → bytes (included entities only) */
  bytesByEntity: Map<string, InboundBytes>;
  /** 父行不在包里、已从 snapshot 丢弃的行（BF1-N3）| Rows dropped because their parent is not in the package */
  skippedOrphanRows: SkippedOrphanRows;
}

/**
 * 路径、`files[]`、实体与字节文件的一致性（7.2）；JYB 也用。
 * Paths, `files[]`, entities and byte files are consistent (7.2); shared with JYB.
 */
export async function checkFileTable(
  kind: PackageKind,
  manifest: ProjectPackageManifest,
  files: GuardedArchive,
  entryNames: readonly string[],
  problems: string[],
  dataPaths: PackageDataPaths = PROJECT_DATA_PATHS,
): Promise<void> {
  const seen = new Set<string>();
  for (const name of entryNames) {
    if (seen.has(name)) problems.push(`duplicate entry "${name}"`);
    seen.add(name);
    const unsafe = unsafePathReason(name);
    if (unsafe !== null) problems.push(`unsafe path "${name}": ${unsafe}`);
  }

  const listed = new Map<string, PackageFile>();
  for (const file of manifest.files) {
    if (listed.has(file.path)) problems.push(`files[] lists "${file.path}" twice`);
    listed.set(file.path, file);
    const unsafe = unsafePathReason(file.path);
    if (unsafe !== null) problems.push(`unsafe path "${file.path}": ${unsafe}`);
    if (file.role !== 'data' && !file.path.startsWith(BYTE_DIR[file.role])) {
      problems.push(`byte file "${file.path}" is outside ${BYTE_DIR[file.role]}`);
    }
    // 逐个文件读出算哈希，同一时间只有一个文件在内存里 | One file in memory at a time
    const size = files.size(file.path);
    if (size === undefined) {
      problems.push(`files[] entry "${file.path}" is missing from the package`);
      continue;
    }
    if (size !== file.size) problems.push(`size mismatch for "${file.path}"`);
    else if ((await sha256Hex((await files.read(file.path))!)) !== file.sha256)
      problems.push(`sha256 mismatch for "${file.path}"`);
  }
  for (const name of files.names) {
    if (name === 'mimetype' || name === MANIFEST_PATH) continue;
    if (!listed.has(name)) problems.push(`orphan file "${name}" is not listed in files[]`);
  }

  const dataFiles = manifest.files.filter((file) => file.role === 'data');
  const expectedDataPath = manifest.encryption ? dataPaths.encrypted : dataPaths.plain;
  if (dataFiles.length !== 1 || dataFiles[0]?.path !== expectedDataPath) {
    problems.push(`exactly one data file "${expectedDataPath}" is required`);
  }

  // 字节文件必须恰好被一个 included 实体引用（7.2）| Byte files: referenced by exactly one included entity
  const refCount = new Map<string, number>();
  const entityKeys = new Set<string>();
  for (const entity of manifest.entities) {
    const key = `${entity.type}:${entity.id}`;
    if (entityKeys.has(key)) problems.push(`entity ${key} is listed twice`);
    entityKeys.add(key);
    if (entity.type === 'media') {
      if (!entity.timelineKind || !entity.byteLocation || !entity.availability) {
        problems.push(`media entity ${entity.id} lacks timelineKind / byteLocation / availability`);
      }
      if (entity.byteLocation === 'url' && (entity.bytes !== 'omitted' || !entity.url)) {
        problems.push(`url media entity ${entity.id} must be omitted and carry its url`);
      }
    }
    if (entity.bytes === 'included') {
      const file = entity.fileRef ? listed.get(entity.fileRef) : undefined;
      if (!file || file.role === 'data') {
        problems.push(`entity ${key} is "included" without a byte file`);
        continue;
      }
      if (file.role !== entity.type) {
        problems.push(`entity ${key} references a ${file.role} file`);
      }
      if (entity.contentSha256 === undefined || entity.contentSize === undefined) {
        problems.push(`entity ${key} is "included" without contentSha256 / contentSize`);
      }
      refCount.set(file.path, (refCount.get(file.path) ?? 0) + 1);
      // 加密包里文件是密文，原始内容的哈希在解密后核对 | Encrypted: content hash is checked after decryption
      if (
        !manifest.encryption &&
        (file.sha256 !== entity.contentSha256 || file.size !== entity.contentSize)
      ) {
        problems.push(`entity ${key} does not match its byte file`);
      }
    } else {
      if (entity.fileRef !== undefined)
        problems.push(`entity ${key} is "omitted" but references a file`);
      if (entity.mimeType !== undefined)
        problems.push(`entity ${key} is "omitted" but has a mimeType`);
    }
  }
  for (const file of manifest.files) {
    if (file.role === 'data') continue;
    const count = refCount.get(file.path) ?? 0;
    if (count !== 1) problems.push(`byte file "${file.path}" is referenced by ${count} entities`);
  }

  if (kind !== 'jyb' && manifest.projects.length !== 1)
    problems.push(`a ${kind.toUpperCase()} holds exactly one project`);
  const anyIncluded = manifest.entities.some((entity) => entity.bytes === 'included');
  if (kind === 'jyt') {
    // JYT 本身：不含媒体、不含任何字节文件（D1）| JYT itself: no media, no byte files (D1)
    if (manifest.media !== 'excluded') problems.push('a JYT must declare media "excluded"');
    if (manifest.files.some((file) => file.role !== 'data'))
      problems.push('a JYT carries no byte files');
    if (anyIncluded) problems.push('every JYT entity must be "omitted"');
  } else if (manifest.media === 'excluded' && anyIncluded) {
    problems.push(`a ${kind.toUpperCase()} with media "excluded" must not include bytes`);
  }
}

/** 数据与清单一致、所有行都属于这个项目 | Data matches the manifest; every row belongs to the project */
function checkProjectScope(
  manifest: ProjectPackageManifest,
  collections: ProjectCollections,
  problems: string[],
): string {
  const projectId = manifest.projects[0]?.id ?? '';
  const texts = rowsOf(collections, 'texts');
  if (texts.length !== 1 || texts[0]?.id !== projectId) {
    problems.push('the data must hold exactly the one project named in the manifest');
  }
  for (const [name, rows] of Object.entries(collections)) {
    let foreign = 0;
    for (const row of rowsOf(collections, name)) {
      const owner = name === 'structural_rule_profiles' ? row.projectId : row.textId;
      if (typeof owner === 'string' && owner !== projectId) foreign += 1;
    }
    if (foreign > 0) problems.push(`${name}: ${foreign} row(s) belong to another project`);
    if (!Array.isArray(rows)) problems.push(`${name} is not a list`);
  }

  const expected = collectOmittedEntities(collections).map(
    (entity) => `${entity.type}:${entity.id}`,
  );
  const declared = manifest.entities.map((entity) => `${entity.type}:${entity.id}`);
  const missing = expected.filter((key) => !declared.includes(key));
  const extra = declared.filter((key) => !expected.includes(key));
  if (missing.length > 0) problems.push(`entities[] misses ${missing.length} byte-bearing row(s)`);
  if (extra.length > 0) problems.push(`entities[] lists ${extra.length} row(s) not in the data`);

  // included 的媒体行必须是 managed；数据行里不能夹带字节 | Included media rows must be managed
  const mediaById = new Map(rowsOf(collections, 'media_items').map((row) => [String(row.id), row]));
  for (const entity of manifest.entities) {
    if (entity.type !== 'media' || entity.bytes !== 'included') continue;
    const row = mediaById.get(entity.id);
    if (row !== undefined && row.byteLocation !== 'managed') {
      problems.push(`media ${entity.id} is "included" but its row is not managed`);
    }
  }
  return projectId;
}

/** 读出、解密并核对 included 实体的字节 | Read, decrypt and verify the bytes of included entities */
export async function readIncludedBytes(
  manifest: ProjectPackageManifest,
  files: GuardedArchive,
  decryptFile: ((bytes: Uint8Array) => Promise<Uint8Array>) | null,
  problems: string[],
): Promise<Map<string, InboundBytes>> {
  const out = new Map<string, InboundBytes>();
  for (const entity of manifest.entities) {
    if (entity.bytes !== 'included' || entity.fileRef === undefined) continue;
    if (!files.has(entity.fileRef)) continue;
    let blob: Blob;
    let sha256 = String(entity.contentSha256);
    if (decryptFile) {
      const bytes = await decryptFile((await files.read(entity.fileRef))!);
      sha256 = await sha256Hex(bytes);
      blob = bytesBlob(bytes);
    } else {
      // 明文文件的哈希已在 checkFileTable 核对过 | Plain files were hashed in checkFileTable
      blob = (await files.blob(entity.fileRef))!;
    }
    if (sha256 !== entity.contentSha256 || blob.size !== entity.contentSize) {
      problems.push(`content of ${entity.type}:${entity.id} does not match its sha256 / size`);
      continue;
    }
    out.set(`${entity.type}:${entity.id}`, {
      blob,
      sha256,
      ...(entity.mimeType !== undefined ? { mimeType: entity.mimeType } : {}),
    });
  }
  return out;
}

async function inspectProjectPackage(
  archiveBytes: ArchiveSource,
  options:
    | {
        policy?: Partial<JieyuArchiveImportPolicy>;
        password?: string;
        expectedKind?: ProjectPackageKind;
      }
    | undefined,
  dbIo: DbIoModule,
): Promise<InspectedPackage> {
  const sniffed = (await detectProjectPackageKind(archiveBytes)) ?? options?.expectedKind ?? 'jyt';
  const policy = packagePolicy(sniffed, options?.policy);
  const entryNames: string[] = [];
  const files = await unzipWithGuard(archiveBytes, policy, (name) => entryNames.push(name));
  const mimetypeBytes = await files.read('mimetype');
  const mimetype = mimetypeBytes ? toText(mimetypeBytes).trim() : null;
  const manifestBytes = await files.read(MANIFEST_PATH);
  const rawManifest = readLegacyManifestOrNull(manifestBytes);

  const legacyKind = (['jyt', 'jym'] as const).find(
    (kind) => mimetype === LEGACY_PACKAGE_MIMETYPES[kind],
  );
  if (legacyKind !== undefined) {
    // RD-1：旧库导出先报“旧版本”；其余旧格式包报“格式不受支持”（T32）
    // RD-1: old-database exports get the legacy error; any other old package is "unsupported" (T32)
    if (rawManifest) dbIo.assertSupportedSnapshotVersion(rawManifest);
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `This is a whole-database ${legacyKind.toUpperCase()} from before batch 3; it is no longer supported.`,
    });
  }
  const kind = (['jyt', 'jym'] as const).find(
    (candidate) => mimetype === PROJECT_PACKAGE_MIMETYPES[candidate],
  );
  if (kind === undefined || (options?.expectedKind && options.expectedKind !== kind)) {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Unsupported package mimetype: ${mimetype ?? '(missing)'}`,
    });
  }
  if (!rawManifest) throw invalidPackage(kind, [`missing or unreadable ${MANIFEST_PATH}`]);
  if (
    rawManifest.formatVersion !== PROJECT_PACKAGE_FORMAT_VERSION ||
    rawManifest.package !== kind
  ) {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Unsupported ${kind.toUpperCase()} formatVersion=${String(rawManifest.formatVersion)}`,
    });
  }
  const manifestRaw = parseJsonWithGuard<unknown>(manifestBytes!, policy, 'manifest');
  const parsed = manifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw invalidPackage(
      kind,
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
  await checkFileTable(kind, manifest, files, entryNames, problems);
  if (problems.length > 0) throw invalidPackage(kind, problems);

  const decryptor = manifest.encryption
    ? await createArchiveDecryptor(
        manifest.encryption as JieyuArchiveEncryptionMetadata,
        options?.password,
      )
    : null;
  const dataPath = manifest.encryption ? DATA_ENCRYPTED_PATH : DATA_PATH;
  const storedData = (await files.read(dataPath))!;
  const dataBytes = decryptor ? await decryptor.decryptData(storedData) : storedData;
  const snapshot = parseJsonWithGuard<InspectedPackage['snapshot']>(
    dataBytes,
    policy,
    'project data',
  );
  // 版本 + 逐条记录校验，和导入用的是同一套（RD-1）| Version + per-record check shared with import
  await dbIo.prepareSnapshotImport(snapshot, new Date().toISOString());

  const sourceProjectId = checkProjectScope(manifest, snapshot.collections, problems);
  const bytesByEntity = await readIncludedBytes(
    manifest,
    files,
    decryptor ? (bytes) => decryptor.decryptFile(bytes) : null,
    problems,
  );
  if (problems.length > 0) throw invalidPackage(kind, problems);
  // 预览和每条写入路径都用 inspected，孤儿只在这里丢一次 | Preview and every commit path consume this
  const orphans = dropOrphanRows(snapshot.collections);
  return {
    kind,
    manifest,
    snapshot: { ...snapshot, collections: orphans.collections },
    sourceProjectId,
    bytesByEntity,
    skippedOrphanRows: orphans.skipped,
  };
}

/**
 * 把 included 的字节放回数据行（Blob），状态与指纹随字节一起写（4.2-7）。在 id 重新映射之前调用。
 * Put included bytes back into their rows as Blobs, with matching state and fingerprint (4.2-7).
 * Called before ids are remapped.
 */
export function attachIncludedBytes(
  collections: ProjectCollections,
  bytesByEntity: ReadonlyMap<string, InboundBytes>,
): ProjectCollections {
  if (bytesByEntity.size === 0) return collections;
  const next: ProjectCollections = { ...collections };
  next['media_items'] = rowsOf(collections, 'media_items').map((row) => {
    const inbound = bytesByEntity.get(`media:${String(row.id)}`);
    if (inbound === undefined) return row;
    const details = { ...asRecord(row.details) };
    for (const key of [
      'audioExportOmitted',
      'audioExportOmittedByteSize',
      'audioExportOmittedMimeType',
    ]) {
      delete details[key];
    }
    details.audioBlob = new Blob([inbound.blob], { type: inbound.mimeType ?? '' });
    return {
      ...row,
      details,
      byteLocation: 'managed',
      availability: 'available',
      contentSize: inbound.blob.size,
      contentSha256: inbound.sha256,
    };
  });
  next['lexeme_assets'] = rowsOf(collections, 'lexeme_assets').map((row) => {
    const inbound = bytesByEntity.get(`attachment:${String(row.id)}`);
    if (inbound === undefined) return row;
    const copy: Row = {
      ...row,
      blob: new Blob([inbound.blob], { type: inbound.mimeType ?? str(row.mimeType) ?? '' }),
      byteSize: inbound.blob.size,
    };
    delete copy.blobExportOmitted;
    return copy;
  });
  return next;
}

/** 本机已有、属于别的项目的语言行（自然键冲突）| Language rows already present locally (natural-key collisions) */
export async function findCollidingLanguageIds(
  collections: ProjectCollections,
  /** 覆盖时，目标项目自己的语言行会被清掉，不算冲突 | On overwrite the target's own rows are replaced */
  replacedProjectId?: string,
): Promise<string[]> {
  const ids = rowsOf(collections, 'languages')
    .map((row) => str(row.id))
    .filter((id): id is string => id !== undefined);
  if (ids.length === 0) return [];
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const existing = await db.dexie.languages.bulkGet(ids);
  return ids
    .filter((_, index) => {
      const row = existing[index] as Row | undefined;
      if (row === undefined) return false;
      return replacedProjectId === undefined || row.textId !== replacedProjectId;
    })
    .sort();
}

/** 跳过冲突语言及其显示名、别名、历史 | Drop colliding languages with their names, aliases, history */
export function dropCollidingLanguages(
  collections: ProjectCollections,
  skipped: ReadonlySet<string>,
): ProjectCollections {
  if (skipped.size === 0) return collections;
  const next: ProjectCollections = { ...collections };
  next['languages'] = rowsOf(collections, 'languages').filter(
    (row) => !skipped.has(String(row.id)),
  );
  for (const name of ['language_display_names', 'language_aliases', 'language_catalog_history']) {
    if (!Array.isArray(collections[name])) continue;
    next[name] = rowsOf(collections, name).filter((row) => !skipped.has(String(row.languageId)));
  }
  return next;
}

/** 每张表因父行不在包里而跳过的行数 | Rows skipped per table because their parent is not in the package */
export type SkippedOrphanRows = Array<{ collection: string; count: number }>;

/**
 * 丢弃父行不在包里的行（BF1-N3），父行规则与归属中间件同一套；指向包外词条的链接也丢。循环到
 * 不再有新的孤儿（丢掉的句段带走它的子句段、内容、token、morpheme、链接）。在 id 重新映射之前调用。
 * Drop rows whose parent is not in the package (BF1-N3), using the ownership middleware's parent
 * rules; links to lexemes outside the package are dropped too. Repeats until no new orphan appears
 * (a dropped unit takes its segments, contents, tokens, morphemes and links). Call before id remap.
 * shortcut: orphans are dropped, not repaired/re-parented; upgrade if users need to recover rows from damaged backups.
 */
export function dropOrphanRows(collections: ProjectCollections): {
  collections: ProjectCollections;
  skipped: SkippedOrphanRows;
} {
  const rules = Object.entries(JIEYU_PARENT_CONSISTENCY_RULES).filter(([name]) =>
    Array.isArray(collections[name]),
  );
  const counts = new Map<string, number>();
  let next = collections;
  for (;;) {
    const current = next;
    const idSets = new Map<string, Set<string>>();
    const idsOf = (table: string): Set<string> => {
      let ids = idSets.get(table);
      if (ids === undefined) {
        ids = new Set(rowsOf(current, table).map((row) => String(row.id)));
        idSets.set(table, ids);
      }
      return ids;
    };
    const pass: ProjectCollections = { ...current };
    let dropped = 0;
    for (const [name, rule] of rules) {
      const rows = rowsOf(current, name);
      const kept = rows.filter((row) =>
        rule.extract(row).parents.every((ref) => idsOf(ref.table).has(ref.key)),
      );
      if (kept.length === rows.length) continue;
      pass[name] = kept;
      counts.set(name, (counts.get(name) ?? 0) + rows.length - kept.length);
      dropped += rows.length - kept.length;
    }
    if (dropped === 0) break;
    next = pass;
  }
  const skipped = [...counts.entries()]
    .map(([collection, count]) => ({ collection, count }))
    .sort((a, b) => a.collection.localeCompare(b.collection, 'en'));
  if (skipped.length > 0) log.warn('Dropped orphan rows from archive import', { skipped });
  return { collections: next, skipped };
}

/** 覆盖当前项目这一选项的情况（D5、T33）| The "overwrite current project" option (D5, T33) */
export interface ProjectOverwriteOption {
  targetProjectId: string;
  targetTitle?: Record<string, string>;
  /** 包来自这个项目本身：沿用原 id；否则全部重新映射 | Package came from this project: ids kept */
  keepsIds: boolean;
  /** false：覆盖会丢本机字节，不能执行（4.2-7）| false: local bytes would be lost (4.2-7) */
  available: boolean;
  /** 会丢字节的行（collection:id）| Rows whose local bytes would be lost */
  bytesAtRisk: string[];
  skippedLanguageIds: string[];
}

interface OverwritePlan {
  option: ProjectOverwriteOption;
  collections: ProjectCollections;
  /** 包里字节与本机字节相同的行及本机字节大小 | Rows whose package bytes equal the local bytes */
  identicalLocalBytes: Map<string, number>;
}

const BYTE_COLLECTIONS: readonly ByteCollection[] = [
  'media_items',
  'lexeme_assets',
  'source_records',
];

function localBlobOf(collection: ByteCollection, row: Row): Blob | null {
  if (collection === 'media_items') {
    const blob = asRecord(row.details).audioBlob;
    return blob instanceof Blob ? blob : null;
  }
  if (collection === 'lexeme_assets') return row.blob instanceof Blob ? row.blob : null;
  return null;
}

function rowHasLocalBytes(collection: ByteCollection, row: Row): boolean {
  if (localBlobOf(collection, row) !== null) return true;
  if (collection === 'media_items') {
    return row.byteLocation === 'managed' && row.availability === 'available';
  }
  return collection === 'source_records' && row.storedBytes === true;
}

/**
 * 目标项目里带本机字节、覆盖后会丢的行：入站没有同一 id，或者入站带了不同的字节。必须中止。
 * 只读；可在写事务里调用。
 * Target rows holding local bytes that the overwrite would lose: no inbound row with the same id,
 * or the inbound row brings different bytes. Must abort. Reads only; callable inside the write
 * transaction.
 */
export async function findBytesAtRisk(
  dexie: Awaited<ReturnType<DbEngineModule['getDb']>>['dexie'],
  /** null：整库（JYB 灾难恢复）| null: the whole database (JYB disaster restore) */
  targetProjectId: string | null,
  inbound: ProjectCollections,
  identicalLocalBytes: ReadonlyMap<string, number>,
): Promise<string[]> {
  const atRisk: string[] = [];
  for (const collection of BYTE_COLLECTIONS) {
    const inboundById = new Map(rowsOf(inbound, collection).map((row) => [String(row.id), row]));
    const locals = (await dexie
      .table(collection)
      .filter((row: Row) => targetProjectId === null || row.textId === targetProjectId)
      .toArray()) as Row[];
    for (const row of locals) {
      if (!rowHasLocalBytes(collection, row)) continue;
      const key = `${collection}:${String(row.id)}`;
      const incoming = inboundById.get(String(row.id));
      if (incoming === undefined) {
        atRisk.push(key);
        continue;
      }
      if (localBlobOf(collection, incoming) === null) continue; // omitted：本机字节保留 | local bytes kept
      // 入站带字节：只有与本机字节相同才算不丢 | Inbound bytes replace local ones only when identical
      const local = localBlobOf(collection, row);
      if (local !== null && identicalLocalBytes.get(key) !== local.size) atRisk.push(key);
    }
  }
  return atRisk.sort();
}

/** 事务外：哪些本机字节与包里同一 id 的字节完全相同 | Outside any transaction: identical local bytes */
export async function findIdenticalLocalBytes(
  dexie: Awaited<ReturnType<DbEngineModule['getDb']>>['dexie'],
  bytesByEntity: ReadonlyMap<string, InboundBytes>,
  keepsIds: boolean,
): Promise<Map<string, number>> {
  const identical = new Map<string, number>();
  if (!keepsIds) return identical;
  for (const [entityKey, inbound] of bytesByEntity) {
    const [type, ...rest] = entityKey.split(':');
    const id = rest.join(':');
    const collection = ENTITY_COLLECTION[type as EntityType];
    const row = (await dexie.table(collection).get(id)) as Row | undefined;
    const local = row ? localBlobOf(collection, row) : null;
    if (local === null || local.size !== inbound.blob.size) continue;
    const localSha = await sha256Hex(new Uint8Array(await local.arrayBuffer()));
    if (localSha === inbound.sha256) identical.set(`${collection}:${id}`, local.size);
  }
  return identical;
}

/**
 * 覆盖计划；目标不存在、协作过或判定不了时返回 null（T33(b)：不出现覆盖选项）。
 * Plan an overwrite; null when the target is missing, collaborated or unknown (T33(b)).
 */
async function planOverwrite(
  inspected: InspectedPackage,
  targetProjectId: string | undefined,
): Promise<OverwritePlan | null> {
  const target = targetProjectId?.trim() ?? '';
  if (target.length === 0) return null;
  if (!isProjectNeverCollaborated(target)) return null;
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const targetText = (await db.dexie.table('texts').get(target)) as Row | undefined;
  if (targetText === undefined) return null;

  const keepsIds = inspected.sourceProjectId === target;
  const skippedLanguageIds = await findCollidingLanguageIds(inspected.snapshot.collections, target);
  const kept = attachIncludedBytes(
    dropCollidingLanguages(inspected.snapshot.collections, new Set(skippedLanguageIds)),
    inspected.bytesByEntity,
  );
  let collections = kept;
  if (!keepsIds) {
    // 来自别的项目：全部重新映射，项目 id 换成当前项目 | From another project: remap, keep target id
    const remap = buildProjectIdRemap(kept);
    remap.set(inspected.sourceProjectId, target);
    collections = remapProjectCollections(kept, remap);
  }
  const identicalLocalBytes = await findIdenticalLocalBytes(
    db.dexie,
    inspected.bytesByEntity,
    keepsIds,
  );
  const bytesAtRisk = await findBytesAtRisk(db.dexie, target, collections, identicalLocalBytes);
  return {
    option: {
      targetProjectId: target,
      ...(targetText.title !== undefined
        ? { targetTitle: targetText.title as Record<string, string> }
        : {}),
      keepsIds,
      available: bytesAtRisk.length === 0,
      bytesAtRisk,
      skippedLanguageIds,
    },
    collections,
    identicalLocalBytes,
  };
}

export interface ProjectPackageRestorePreview {
  kind: ProjectPackageKind;
  manifest: ProjectPackageManifest;
  sourceProject: { id: string; title?: Record<string, string> };
  collections: Array<{ name: string; incoming: number }>;
  totalIncoming: number;
  /** 恢复后处于缺音状态、需要重新关联的媒体条数 | Media left missing after restore (need relink) */
  mediaWithoutBytes: number;
  /** 带字节恢复的媒体与附件（JYM）| Media and attachments restored with their bytes (JYM) */
  includedBytes: { count: number; totalBytes: number };
  /** 本机已被别的项目使用、恢复时跳过的语言 id | Language ids skipped because another local project owns them */
  skippedLanguageIds: string[];
  skippedOrphanRows: SkippedOrphanRows;
  unresolvedSystemRefs: string[];
  /** 只有当前项目从未协作过时才有（D5、D6）| Present only when the current project never collaborated */
  overwrite?: ProjectOverwriteOption;
}

export interface ProjectPackageReadOptions {
  policy?: Partial<JieyuArchiveImportPolicy>;
  password?: string;
  /** 给出时，包类型不符就拒绝 | When given, a package of another kind is refused */
  expectedKind?: ProjectPackageKind;
}

/** 预览：做完所有写入前检查（含字节哈希），不写任何数据 | Preview: every pre-write check, no writes */
export async function previewProjectPackageRestore(
  archiveBytes: ArchiveSource,
  options?: ProjectPackageReadOptions & {
    /** 当前项目；给出时一并评估能否覆盖它 | Current project; when given, overwrite is assessed */
    overwriteTargetProjectId?: string;
  },
): Promise<ProjectPackageRestorePreview> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectProjectPackage(archiveBytes, options, dbIo);
  const overwritePlan = await planOverwrite(inspected, options?.overwriteTargetProjectId);
  const skippedLanguageIds = await findCollidingLanguageIds(inspected.snapshot.collections);
  const collections = Object.entries(
    dropCollidingLanguages(inspected.snapshot.collections, new Set(skippedLanguageIds)),
  )
    .filter(([name]) => name !== 'layers')
    .map(([name, rows]) => ({ name, incoming: rows.length }))
    .filter((item) => item.incoming > 0)
    .sort((a, b) => b.incoming - a.incoming || a.name.localeCompare(b.name, 'en'));
  const project = inspected.manifest.projects[0]!;
  const included = [...inspected.bytesByEntity.values()];
  return {
    kind: inspected.kind,
    manifest: inspected.manifest,
    sourceProject: { id: project.id, ...(project.title ? { title: project.title } : {}) },
    collections,
    totalIncoming: collections.reduce((sum, item) => sum + item.incoming, 0),
    mediaWithoutBytes: inspected.manifest.entities.filter(
      (entity) => entity.type === 'media' && entity.bytes === 'omitted',
    ).length,
    includedBytes: {
      count: included.length,
      totalBytes: included.reduce((sum, item) => sum + item.blob.size, 0),
    },
    skippedLanguageIds,
    skippedOrphanRows: inspected.skippedOrphanRows,
    unresolvedSystemRefs: listUnresolvedSystemRefs(
      inspected.manifest.systemRefs.map((ref) => ref.id),
    ),
    ...(overwritePlan ? { overwrite: overwritePlan.option } : {}),
  };
}

export interface ProjectPackageRestoreResult {
  kind: ProjectPackageKind;
  projectId: string;
  title?: Record<string, string>;
  sourceProjectId: string;
  importResult: ImportResult;
  skippedLanguageIds: string[];
  skippedOrphanRows: SkippedOrphanRows;
}

/**
 * 恢复为新项目（D5 默认）：全部 id 重新映射，项目记录 restoredFrom；JYM 带的字节写回，其余媒体
 * 处于缺音状态。写入是一个事务，失败时整体回滚。
 * Restore as a new project (D5 default): every id is remapped and the project records
 * restoredFrom; JYM bytes are written back, other media come in as missing. The write is one
 * transaction and rolls back on failure.
 */
export async function restoreProjectPackageAsNew(
  archiveBytes: ArchiveSource,
  options?: ProjectPackageReadOptions,
): Promise<ProjectPackageRestoreResult> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectProjectPackage(archiveBytes, options, dbIo);
  const prepared = await prepareRestoreAsNew({
    kind: inspected.kind,
    sourceProjectId: inspected.sourceProjectId,
    exportedAt: inspected.manifest.created,
    collections: inspected.snapshot.collections,
    bytesByEntity: inspected.bytesByEntity,
  });
  const importResult = await dbIo.importDatabaseFromJson(
    { ...inspected.snapshot, collections: prepared.collections },
    { strategy: 'upsert' },
  );
  return {
    kind: inspected.kind,
    projectId: prepared.projectId,
    ...(prepared.title !== undefined ? { title: prepared.title } : {}),
    sourceProjectId: inspected.sourceProjectId,
    importResult,
    skippedLanguageIds: prepared.skippedLanguageIds,
    skippedOrphanRows: inspected.skippedOrphanRows,
  };
}

/** 一个项目恢复为新项目前的准备结果（还没写入）| One project prepared for restore-as-new (not written) */
export interface PreparedRestoreAsNew {
  projectId: string;
  title?: Record<string, string>;
  collections: ProjectCollections;
  skippedLanguageIds: string[];
}

/**
 * 恢复为新项目的准备：跳过冲突语言、挂回字节、全部 id 重新映射、记 restoredFrom。不写库；JYB
 * 逐项目导入也用它（多个项目一起写）。
 * Prepare restore-as-new: skip colliding languages, attach bytes, remap every id, record
 * restoredFrom. No write; JYB per-project import uses it too (several projects written together).
 */
export async function prepareRestoreAsNew(input: {
  kind: PackageKind;
  sourceProjectId: string;
  exportedAt: string;
  collections: ProjectCollections;
  bytesByEntity: ReadonlyMap<string, InboundBytes>;
  /** 这一批里别的项目已经占用的语言 id | Language ids already taken by other projects in this batch */
  takenLanguageIds?: ReadonlySet<string>;
}): Promise<PreparedRestoreAsNew> {
  const colliding = await findCollidingLanguageIds(input.collections);
  const taken = input.takenLanguageIds ?? new Set<string>();
  const inBatch = rowsOf(input.collections, 'languages')
    .map((row) => String(row.id))
    .filter((id) => taken.has(id));
  const skippedLanguageIds = [...new Set([...colliding, ...inBatch])].sort();
  const kept = attachIncludedBytes(
    dropCollidingLanguages(input.collections, new Set(skippedLanguageIds)),
    input.bytesByEntity,
  );

  const remap = buildProjectIdRemap(kept);
  const collections = remapProjectCollections(kept, remap);
  const projectId = remap.get(input.sourceProjectId);
  if (projectId === undefined) throw new Error('Restore failed to allocate a project id');
  const restoredAt = new Date().toISOString();
  const text = rowsOf(collections, 'texts')[0]!;
  text.restoredFrom = {
    projectId: input.sourceProjectId,
    packageKind: input.kind,
    exportedAt: input.exportedAt,
    restoredAt,
  };
  text.updatedAt = restoredAt;
  return {
    projectId,
    ...(text.title !== undefined ? { title: text.title as Record<string, string> } : {}),
    collections,
    skippedLanguageIds,
  };
}

export interface ProjectPackageOverwriteResult {
  kind: ProjectPackageKind;
  projectId: string;
  title?: Record<string, string>;
  sourceProjectId: string;
  keptIds: boolean;
  /** 覆盖前快照的序号 | Sequence number of the pre-overwrite snapshot */
  snapshotSeq: number;
  importResult: ImportResult;
  skippedLanguageIds: string[];
  skippedOrphanRows: SkippedOrphanRows;
}

/**
 * 覆盖当前项目（D5，7.4-3，T33）。只对从未协作过的本地项目开放；二次确认在界面上完成。
 * 顺序：全部包检查 → 重新判定 D6 → 覆盖前快照（失败就中止）→ 一个事务里：再查一遍会丢的字节、
 * 清空项目内容与目录、写入包内容（本机同 id 的字节保留，包里相同的字节照写）。任何一步失败，项目保持原样。
 * Overwrite the current project (D5, 7.4-3, T33); only for never-collaborated local projects, the
 * double confirm happens in the UI. Order: package checks → D6 again → pre-overwrite snapshot
 * (abort on failure) → one transaction that re-checks bytes at risk, clears the project's content
 * and catalog rows and writes the package. Any failure leaves the project as it was.
 */
export async function overwriteProjectWithPackage(
  archiveBytes: ArchiveSource,
  options: ProjectPackageReadOptions & { targetProjectId: string },
): Promise<ProjectPackageOverwriteResult> {
  const [dbIo, scoped, purge, tx, snapshots, engine] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectScopedSnapshot') as Promise<ProjectSnapshotModule>,
    import('../db/projectLocalPurge') as Promise<ProjectPurgeModule>,
    import('../db/withTransaction') as Promise<WithTransactionModule>,
    import('../db/projectOverwriteSnapshotStore') as Promise<OverwriteSnapshotModule>,
    import('../db/engine') as Promise<DbEngineModule>,
  ]);
  const inspected = await inspectProjectPackage(archiveBytes, options, dbIo);
  const plan = await planOverwrite(inspected, options.targetProjectId);
  if (plan === null) {
    throw new ProjectOverwriteBlockedError({
      reason: 'not-allowed',
      message: `Project ${options.targetProjectId} cannot be overwritten: it does not exist, has collaboration history, or its history cannot be read.`,
    });
  }
  if (!plan.option.available) {
    throw new ProjectOverwriteBlockedError({
      reason: 'local-bytes-would-be-lost',
      message: `Overwrite aborted: ${plan.option.bytesAtRisk.length} local recording/attachment byte(s) would be lost.`,
      bytesAtRisk: plan.option.bytesAtRisk,
    });
  }
  const target = plan.option.targetProjectId;
  const collections = plan.collections;
  const restoredAt = new Date().toISOString();
  const text = rowsOf(collections, 'texts')[0]!;
  text.restoredFrom = {
    projectId: inspected.sourceProjectId,
    packageKind: inspected.kind,
    exportedAt: inspected.manifest.created,
    restoredAt,
  };
  text.updatedAt = restoredAt;

  let snapshotSeq: number;
  try {
    const before = await scoped.exportProjectScopedDatabaseAsJson(target);
    snapshotSeq = await snapshots.saveProjectOverwriteSnapshot({
      projectId: target,
      packageKind: inspected.kind,
      snapshot: { schemaVersion: before.schemaVersion, collections: before.collections },
    });
  } catch (error) {
    throw new ProjectOverwriteBlockedError({
      reason: 'snapshot-failed',
      message: `Overwrite aborted: the pre-overwrite snapshot failed (${error instanceof Error ? error.message : String(error)}).`,
      cause: error,
    });
  }

  const db = await engine.getDb();
  const purgeStores = purge.projectPurgeStores(db.dexie, 'replace-content');
  const importResult = await dbIo.importDatabaseFromJson(
    { ...inspected.snapshot, collections },
    {
      strategy: 'upsert',
      preWrite: {
        tables: purgeStores,
        run: async () => {
          // 快照之后可能又有写入：在写事务里再判定一次 | Re-check inside the write transaction
          const atRisk = await findBytesAtRisk(
            db.dexie,
            target,
            collections,
            plan.identicalLocalBytes,
          );
          if (atRisk.length > 0 || !isProjectNeverCollaborated(target)) {
            throw new ProjectOverwriteBlockedError({
              reason: atRisk.length > 0 ? 'local-bytes-would-be-lost' : 'not-allowed',
              message: 'Overwrite aborted: the project changed after the preview.',
              bytesAtRisk: atRisk,
            });
          }
          await tx.withTransaction(
            db,
            'rw',
            purgeStores,
            () => purge.purgeProjectRows(db.dexie, target, 'replace-content'),
            { label: 'projectPackage.overwrite.purge' },
          );
        },
      },
    },
  );
  await scoped.dropLexemeLinksWithMissingTargets();
  return {
    kind: inspected.kind,
    projectId: target,
    ...(text.title !== undefined ? { title: text.title as Record<string, string> } : {}),
    sourceProjectId: inspected.sourceProjectId,
    keptIds: plan.option.keepsIds,
    snapshotSeq,
    importResult,
    skippedLanguageIds: plan.option.skippedLanguageIds,
    skippedOrphanRows: inspected.skippedOrphanRows,
  };
}
