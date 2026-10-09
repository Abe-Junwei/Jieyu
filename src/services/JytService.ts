/**
 * JYT：单项目、不含媒体的轻量包（rev5 D1、7.1–7.4；第 3 批第一个切片）。
 * JYT: single-project lightweight package without media (rev5 D1, 7.1–7.4; batch 3, first slice).
 *
 * 包结构 | Layout
 *   mimetype                    application/vnd.jieyu.jyt（不压缩，第一个条目）
 *   META-INF/manifest.json      按条目类型规定的清单（7.2）
 *   data/project.json           项目范围的快照（加密时为 data/project.enc）
 *
 * - 只含一个项目：内容、标注文档、全部目录行；系统模板只以 systemRefs 出现（7.3）。
 * - 不含任何字节文件：每个媒体 / 附件 / 来源原件实体都是 `bytes: omitted`，照样写 sha256 和大小。
 * - 不含 AI 记忆与历史、审计日志、派生数据、凭据、协作状态（7.5 分类表）。
 * - 入站：写入前检查清单、版本、路径、哈希、引用、一致性规则和每一条记录（7.4-1）；
 *   默认恢复为新项目，所有 id 重新映射，记录 restoredFrom（7.4-2）。
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import type { ImportResult } from '../db/types';
import { SnapshotFormatError } from '../db/snapshotFormatError';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuDataClass } from '../db/tableRegistry';
import { listUnresolvedSystemRefs } from '../annotation/systemStructuralRuleProfiles';
import {
  decryptArchiveSnapshot,
  encryptArchiveSnapshot,
  normalizeImportPolicy,
  parseJsonWithGuard,
  sha256Hex,
  toJsonBytes,
  readArchiveMimetype,
  toText,
  unzipWithGuard,
  type JieyuArchiveEncryptionMetadata,
  type JieyuArchiveEncryptionOptions,
  type JieyuArchiveImportPolicy,
} from './projectArchiveContainer';
import { collectArchiveProjectDocuments, collectArchiveSystemRefs } from './JymService';
import {
  buildProjectIdRemap,
  remapProjectCollections,
  type ProjectCollections,
} from './projectPackageIdRemap';

export const JYT_MIMETYPE = 'application/vnd.jieyu.jyt';
/** 第 3 批之前的整库 JYT（只用来给出明确的拒绝）| Pre-batch-3 whole-DB JYT (only to reject clearly) */
export const LEGACY_JYT_MIMETYPE = 'application/x-jieyu-text';
export const JYT_FORMAT_VERSION = 1;

const MANIFEST_PATH = 'META-INF/manifest.json';
const DATA_PATH = 'data/project.json';
const DATA_ENCRYPTED_PATH = 'data/project.enc';

/** JYT 不带的数据类（7.5）| Data classes a JYT never carries (7.5) */
const JYT_EXCLUDED_DATA_CLASSES: ReadonlySet<JieyuDataClass> = new Set<JieyuDataClass>([
  'project_ai',
  'audit_log',
  'credential',
  'derived',
  'collab_state',
  'recovery',
  'private_log',
  'user_preference',
]);

const JYT_SKIPPED_COLLECTIONS: ReadonlySet<string> = new Set(
  Object.entries(JIEYU_MAIN_TABLE_REGISTRY)
    .filter(([, registration]) => JYT_EXCLUDED_DATA_CLASSES.has(registration.dataClass))
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

const manifestSchema = z
  .object({
    package: z.literal('jyt'),
    formatVersion: z.literal(JYT_FORMAT_VERSION),
    appVersion: z.string().min(1),
    created: isoSchema,
    kind: z.literal('project'),
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

export type JytManifest = z.infer<typeof manifestSchema>;
type JytEntity = z.infer<typeof entitySchema>;

type Row = Record<string, unknown>;
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');
type ProjectSnapshotModule = typeof import('../db/projectScopedSnapshot');

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
    ? __APP_VERSION__.trim()
    : 'dev';
}

function rowsOf(collections: ProjectCollections, name: string): Row[] {
  const rows = collections[name];
  return Array.isArray(rows)
    ? rows.filter((row): row is Row => row !== null && typeof row === 'object')
    : [];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function invalidPackage(problems: string[]): SnapshotFormatError {
  return new SnapshotFormatError({
    code: 'invalid-package',
    message: `Invalid JYT package: ${problems.join('; ')}`,
    problems,
  });
}

// ─── 导出 | Export ───────────────────────────────────────────────────────────

/** 包里的媒体 / 附件 / 来源原件实体；JYT 一律 omitted（7.2）| Byte-bearing entities; all omitted in JYT */
export function collectJytEntities(collections: ProjectCollections): JytEntity[] {
  const entities: JytEntity[] = [];
  for (const media of rowsOf(collections, 'media_items')) {
    const byteLocation = media.byteLocation as JytEntity['byteLocation'];
    entities.push({
      type: 'media',
      id: String(media.id),
      bytes: 'omitted',
      timelineKind: media.timelineKind as JytEntity['timelineKind'],
      ...(byteLocation !== undefined ? { byteLocation } : {}),
      availability: media.availability as JytEntity['availability'],
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

/** JYT 不带内嵌音频：去掉 data URL 并标为省略 | Strip inline audio data URLs and mark them omitted */
function stripInlineMediaBytes(collections: ProjectCollections): void {
  for (const media of rowsOf(collections, 'media_items')) {
    const details = media.details as Row | undefined;
    if (details && typeof details.audioDataUrl === 'string') {
      delete details.audioDataUrl;
      details.audioExportOmitted = true;
    }
  }
}

export interface JytExportOptions {
  encryption?: JieyuArchiveEncryptionOptions;
}

/**
 * 导出一个项目为 JYT。整个读取在一个只读事务里完成（JY-13）。
 * Export one project as a JYT; all reads happen in one read-only transaction (JY-13).
 */
export async function exportProjectToJyt(
  textId: string,
  options?: JytExportOptions,
): Promise<Uint8Array> {
  const projectId = textId.trim();
  if (projectId.length === 0) throw new Error('exportProjectToJyt requires a project textId');
  const [dbIo, scoped] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectScopedSnapshot') as Promise<ProjectSnapshotModule>,
  ]);
  const full = await dbIo.exportDatabaseAsJson({ skipCollections: JYT_SKIPPED_COLLECTIONS });
  const collections = scoped.filterCollectionsForProject(full.collections, projectId);
  for (const name of Object.keys(collections)) {
    if (JYT_SKIPPED_COLLECTIONS.has(name)) delete collections[name];
  }
  const text = rowsOf(collections, 'texts')[0];
  if (text === undefined) throw new Error(`Project ${projectId} does not exist`);
  stripInlineMediaBytes(collections);

  const entities = collectJytEntities(collections);
  const dataBytes = toJsonBytes({
    schemaVersion: full.schemaVersion,
    exportedAt: full.exportedAt,
    dbName: full.dbName,
    collections,
  });
  const files: Zippable = {};
  let storedPath = DATA_PATH;
  let storedBytes = dataBytes;
  let encryption: JytManifest['encryption'];
  if (options?.encryption) {
    const encrypted = await encryptArchiveSnapshot(dataBytes, options.encryption);
    storedPath = DATA_ENCRYPTED_PATH;
    storedBytes = encrypted.encryptedBytes;
    encryption = encrypted.metadata;
  }

  const [project] = collectArchiveProjectDocuments({ collections });
  const manifest: JytManifest = {
    package: 'jyt',
    formatVersion: JYT_FORMAT_VERSION,
    appVersion: appVersion(),
    created: full.exportedAt,
    kind: 'project',
    digestAlgorithm: 'sha256',
    media: 'excluded',
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
    entities,
    files: [
      {
        path: storedPath,
        sha256: await sha256Hex(storedBytes),
        size: storedBytes.byteLength,
        role: 'data',
      },
    ],
    systemRefs: collectArchiveSystemRefs({ collections }),
    excluded: (['media', 'attachment', 'source-original'] as const)
      .map((type) => ({
        kind: `${type}-bytes`,
        count: entities.filter((entity) => entity.type === type).length,
        reason: 'jyt-carries-no-bytes',
      }))
      .filter((item) => item.count > 0),
    ...(encryption ? { encryption } : {}),
  };

  // mimetype 放第一条且不压缩，便于识别 | mimetype first and stored, for sniffing
  files['mimetype'] = [strToU8(JYT_MIMETYPE), { level: 0 }];
  files[MANIFEST_PATH] = toJsonBytes(manifest);
  files[storedPath] = storedBytes;
  return zipSync(files);
}

export async function downloadProjectJyt(
  textId: string,
  baseName = 'jieyu-project',
  options?: JytExportOptions,
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadProjectJyt can only run in browser context');
  }
  const bytes = await exportProjectToJyt(textId, options);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.jyt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 是否 JYT（含旧整库 JYT，用于分派到这里给出明确的拒绝）| Is this a JYT (old whole-DB JYT included) */
export function isJytPackage(archiveBytes: Uint8Array): boolean {
  const mimetype = readArchiveMimetype(archiveBytes, normalizeImportPolicy());
  return mimetype === JYT_MIMETYPE || mimetype === LEGACY_JYT_MIMETYPE;
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

function readLegacyManifestOrNull(raw: Uint8Array | undefined): Row | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(toText(raw)) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Row) : null;
  } catch {
    return null;
  }
}

interface InspectedJyt {
  manifest: JytManifest;
  snapshot: {
    schemaVersion: number;
    exportedAt: string;
    dbName: string;
    collections: ProjectCollections;
  };
  sourceProjectId: string;
}

async function checkFileTable(
  manifest: JytManifest,
  files: Record<string, Uint8Array>,
  entryNames: readonly string[],
  problems: string[],
): Promise<void> {
  const seen = new Set<string>();
  for (const name of entryNames) {
    if (seen.has(name)) problems.push(`duplicate entry "${name}"`);
    seen.add(name);
    const unsafe = unsafePathReason(name);
    if (unsafe !== null) problems.push(`unsafe path "${name}": ${unsafe}`);
  }

  const listed = new Map<string, z.infer<typeof fileSchema>>();
  for (const file of manifest.files) {
    if (listed.has(file.path)) problems.push(`files[] lists "${file.path}" twice`);
    listed.set(file.path, file);
    const unsafe = unsafePathReason(file.path);
    if (unsafe !== null) problems.push(`unsafe path "${file.path}": ${unsafe}`);
    const bytes = files[file.path];
    if (!bytes) {
      problems.push(`files[] entry "${file.path}" is missing from the package`);
      continue;
    }
    if (bytes.byteLength !== file.size) problems.push(`size mismatch for "${file.path}"`);
    else if ((await sha256Hex(bytes)) !== file.sha256)
      problems.push(`sha256 mismatch for "${file.path}"`);
  }
  for (const name of Object.keys(files)) {
    if (name === 'mimetype' || name === MANIFEST_PATH) continue;
    if (!listed.has(name)) problems.push(`orphan file "${name}" is not listed in files[]`);
  }

  const dataFiles = manifest.files.filter((file) => file.role === 'data');
  const expectedDataPath = manifest.encryption ? DATA_ENCRYPTED_PATH : DATA_PATH;
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
      refCount.set(file.path, (refCount.get(file.path) ?? 0) + 1);
      if (file.sha256 !== entity.contentSha256 || file.size !== entity.contentSize) {
        problems.push(`entity ${key} does not match its byte file`);
      }
    } else if (entity.fileRef !== undefined) {
      problems.push(`entity ${key} is "omitted" but references a file`);
    }
  }
  for (const file of manifest.files) {
    if (file.role === 'data') continue;
    const count = refCount.get(file.path) ?? 0;
    if (count !== 1) problems.push(`byte file "${file.path}" is referenced by ${count} entities`);
  }

  // JYT 本身：不含媒体、不含任何字节文件（D1）| JYT itself: no media, no byte files (D1)
  if (manifest.media !== 'excluded') problems.push('a JYT must declare media "excluded"');
  if (manifest.files.some((file) => file.role !== 'data'))
    problems.push('a JYT carries no byte files');
  if (manifest.entities.some((entity) => entity.bytes !== 'omitted')) {
    problems.push('every JYT entity must be "omitted"');
  }
  if (manifest.projects.length !== 1) problems.push('a JYT holds exactly one project');
}

/** 数据与清单一致、所有行都属于这个项目 | Data matches the manifest; every row belongs to the project */
function checkProjectScope(
  manifest: JytManifest,
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

  const expected = collectJytEntities(collections).map((entity) => `${entity.type}:${entity.id}`);
  const declared = manifest.entities.map((entity) => `${entity.type}:${entity.id}`);
  const missing = expected.filter((key) => !declared.includes(key));
  const extra = declared.filter((key) => !expected.includes(key));
  if (missing.length > 0) problems.push(`entities[] misses ${missing.length} byte-bearing row(s)`);
  if (extra.length > 0) problems.push(`entities[] lists ${extra.length} row(s) not in the data`);
  return projectId;
}

async function inspectJytPackage(
  archiveBytes: Uint8Array,
  options: { policy?: Partial<JieyuArchiveImportPolicy>; password?: string } | undefined,
  dbIo: DbIoModule,
): Promise<InspectedJyt> {
  const policy = normalizeImportPolicy(options?.policy);
  const entryNames: string[] = [];
  const files = unzipWithGuard(archiveBytes, policy, (name) => entryNames.push(name));
  const mimetype = files['mimetype'] ? toText(files['mimetype']).trim() : null;
  const rawManifest = readLegacyManifestOrNull(files[MANIFEST_PATH]);

  if (mimetype === LEGACY_JYT_MIMETYPE) {
    // RD-1：旧库导出先报“旧版本”；其余旧格式 JYT 报“格式不受支持”（T32）
    // RD-1: old-database exports get the legacy error; any other old JYT is "unsupported" (T32)
    if (rawManifest) dbIo.assertSupportedSnapshotVersion(rawManifest);
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: 'This is a whole-database JYT from before batch 3; it is no longer supported.',
    });
  }
  if (mimetype !== JYT_MIMETYPE) {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Unsupported package mimetype: ${mimetype ?? '(missing)'}`,
    });
  }
  if (!rawManifest) throw invalidPackage([`missing or unreadable ${MANIFEST_PATH}`]);
  if (rawManifest.formatVersion !== JYT_FORMAT_VERSION || rawManifest.package !== 'jyt') {
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: `Unsupported JYT formatVersion=${String(rawManifest.formatVersion)}`,
    });
  }
  const manifestRaw = parseJsonWithGuard<unknown>(files[MANIFEST_PATH]!, policy, 'manifest');
  const parsed = manifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw invalidPackage(
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
  await checkFileTable(manifest, files, entryNames, problems);
  if (problems.length > 0) throw invalidPackage(problems);

  const dataPath = manifest.encryption ? DATA_ENCRYPTED_PATH : DATA_PATH;
  const dataBytes = manifest.encryption
    ? await decryptArchiveSnapshot(
        files[dataPath]!,
        manifest.encryption as JieyuArchiveEncryptionMetadata,
        options?.password,
      )
    : files[dataPath]!;
  const snapshot = parseJsonWithGuard<InspectedJyt['snapshot']>(dataBytes, policy, 'project data');
  // 版本 + 逐条记录校验，和导入用的是同一套（RD-1）| Version + per-record check shared with import
  await dbIo.prepareSnapshotImport(snapshot, new Date().toISOString());

  const sourceProjectId = checkProjectScope(manifest, snapshot.collections, problems);
  if (problems.length > 0) throw invalidPackage(problems);
  return { manifest, snapshot, sourceProjectId };
}

/** 本机已有、属于别的项目的语言行（自然键冲突）| Language rows already present locally (natural-key collisions) */
async function findCollidingLanguageIds(collections: ProjectCollections): Promise<string[]> {
  const ids = rowsOf(collections, 'languages')
    .map((row) => str(row.id))
    .filter((id): id is string => id !== undefined);
  if (ids.length === 0) return [];
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const existing = await db.dexie.languages.bulkGet(ids);
  return ids.filter((_, index) => existing[index] !== undefined).sort();
}

/** 跳过冲突语言及其显示名、别名、历史 | Drop colliding languages with their names, aliases, history */
function dropCollidingLanguages(
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

export interface JytRestorePreview {
  manifest: JytManifest;
  sourceProject: { id: string; title?: Record<string, string> };
  collections: Array<{ name: string; incoming: number }>;
  totalIncoming: number;
  /** 恢复后处于缺音状态、需要重新关联的媒体条数 | Media left missing after restore (need relink) */
  mediaWithoutBytes: number;
  /** 本机已被别的项目使用、恢复时跳过的语言 id | Language ids skipped because another local project owns them */
  skippedLanguageIds: string[];
  unresolvedSystemRefs: string[];
}

/** 预览：做完所有写入前检查，不写任何数据 | Preview: run every pre-write check, write nothing */
export async function previewJytRestore(
  archiveBytes: Uint8Array,
  options?: { policy?: Partial<JieyuArchiveImportPolicy>; password?: string },
): Promise<JytRestorePreview> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectJytPackage(archiveBytes, options, dbIo);
  const skippedLanguageIds = await findCollidingLanguageIds(inspected.snapshot.collections);
  const collections = Object.entries(
    dropCollidingLanguages(inspected.snapshot.collections, new Set(skippedLanguageIds)),
  )
    .filter(([name]) => name !== 'layers')
    .map(([name, rows]) => ({ name, incoming: rows.length }))
    .filter((item) => item.incoming > 0)
    .sort((a, b) => b.incoming - a.incoming || a.name.localeCompare(b.name, 'en'));
  const project = inspected.manifest.projects[0]!;
  return {
    manifest: inspected.manifest,
    sourceProject: { id: project.id, ...(project.title ? { title: project.title } : {}) },
    collections,
    totalIncoming: collections.reduce((sum, item) => sum + item.incoming, 0),
    mediaWithoutBytes: inspected.manifest.entities.filter((entity) => entity.type === 'media')
      .length,
    skippedLanguageIds,
    unresolvedSystemRefs: listUnresolvedSystemRefs(
      inspected.manifest.systemRefs.map((ref) => ref.id),
    ),
  };
}

export interface JytRestoreResult {
  projectId: string;
  title?: Record<string, string>;
  sourceProjectId: string;
  importResult: ImportResult;
  skippedLanguageIds: string[];
}

/**
 * 恢复为新项目（D5 默认）：全部 id 重新映射，项目记录 restoredFrom；媒体处于缺音状态。
 * 检查与写入之间不读外部状态；写入是一个事务，失败时整体回滚。
 * Restore as a new project (D5 default): every id is remapped and the project records
 * restoredFrom; media come in as missing. The write is one transaction and rolls back on failure.
 */
export async function restoreJytAsNewProject(
  archiveBytes: Uint8Array,
  options?: { policy?: Partial<JieyuArchiveImportPolicy>; password?: string },
): Promise<JytRestoreResult> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  const inspected = await inspectJytPackage(archiveBytes, options, dbIo);
  const skippedLanguageIds = await findCollidingLanguageIds(inspected.snapshot.collections);
  const kept = dropCollidingLanguages(inspected.snapshot.collections, new Set(skippedLanguageIds));

  const remap = buildProjectIdRemap(kept);
  const collections = remapProjectCollections(kept, remap);
  const newProjectId = remap.get(inspected.sourceProjectId);
  if (newProjectId === undefined) throw new Error('Restore failed to allocate a project id');
  const restoredAt = new Date().toISOString();
  const text = rowsOf(collections, 'texts')[0]!;
  text.restoredFrom = {
    projectId: inspected.sourceProjectId,
    packageKind: 'jyt',
    exportedAt: inspected.manifest.created,
    restoredAt,
  };
  text.updatedAt = restoredAt;

  const importResult = await dbIo.importDatabaseFromJson(
    { ...inspected.snapshot, collections },
    { strategy: 'upsert' },
  );
  return {
    projectId: newProjectId,
    ...(text.title !== undefined ? { title: text.title as Record<string, string> } : {}),
    sourceProjectId: inspected.sourceProjectId,
    importResult,
    skippedLanguageIds,
  };
}
