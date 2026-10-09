import { strToU8, zipSync } from 'fflate';
import {
  decryptArchiveSnapshot,
  encryptArchiveSnapshot,
  normalizeImportPolicy,
  parseJsonWithGuard,
  toJsonBytes,
  toText,
  unzipWithGuard,
  type JieyuArchiveEncryptionMetadata,
  type JieyuArchiveEncryptionOptions,
  type JieyuArchiveImportPolicy,
} from './projectArchiveContainer';
import type { ImportConflictStrategy, ImportResult } from '../db/types';
import { isSystemTemplateId } from '../db/catalogOwnership';
import { SnapshotFormatError } from '../db/snapshotFormatError';
import { isCollectionDroppedOnImport } from '../db/tableRegistry';
import { listUnresolvedSystemRefs } from '../annotation/systemStructuralRuleProfiles';

const ARCHIVE_FORMAT_VERSION = 1;
const MIMETYPE_JYM = 'application/x-jieyu-media';

/**
 * 这里只剩整库 JYM（第 3 批下一个切片替换）。JYT 已换成单项目新格式，见 `JytService`。
 * Only the whole-DB JYM is left here (replaced in the next batch-3 slice); JYT moved to the new
 * single-project format in `JytService`.
 */
type ArchiveKind = 'jym' | 'jyt';
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');

let dbIoModulePromise: Promise<DbIoModule> | null = null;
let dbEngineModulePromise: Promise<DbEngineModule> | null = null;

function loadDbIoModule(): Promise<DbIoModule> {
  if (!dbIoModulePromise) {
    dbIoModulePromise = import('../db/io').catch((error) => {
      dbIoModulePromise = null;
      throw error;
    });
  }
  return dbIoModulePromise;
}

function loadDbEngineModule(): Promise<DbEngineModule> {
  if (!dbEngineModulePromise) {
    dbEngineModulePromise = import('../db/engine').catch((error) => {
      dbEngineModulePromise = null;
      throw error;
    });
  }
  return dbEngineModulePromise;
}

interface JieyuArchiveManifest {
  formatVersion: number;
  kind: ArchiveKind;
  schemaVersion: number;
  exportedAt: string;
  dbName?: string;
  encryption?: JieyuArchiveEncryptionMetadata;
  /** 被引用的系统模板（rev5 7.2/7.3）：系统模板本身从不导出 | Referenced code-only system templates */
  systemRefs?: Array<{ id: string }>;
  /**
   * 每个项目的标注文档（rev5 7.2 `projects[].documents[]`，2B-E 数据层；完整 manifest 在第 3 批）。
   * Annotation documents per project (rev5 7.2, 2B-E data level; the full manifest is Batch 3).
   */
  projects?: ArchiveProjectDocuments[];
}

export type ArchiveProjectDocuments = {
  id: string;
  defaultDocumentId?: string;
  documents: Array<{
    documentId: string;
    isDefault: boolean;
    layerIds: string[];
    sourceIds: string[];
  }>;
};

/** 快照里每个项目的文档清单；层没写 documentId 时归默认文档 | Per-project documents from a snapshot */
export function collectArchiveProjectDocuments(snapshot: {
  collections: Record<string, unknown[]>;
}): ArchiveProjectDocuments[] {
  type Row = Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;
  const texts = (snapshot.collections['texts'] ?? []) as Row[];
  const documents = (snapshot.collections['annotation_documents'] ?? []) as Row[];
  const tiers = (snapshot.collections['tier_definitions'] ?? []) as Row[];
  return texts.map((text) => {
    const textId = str(text.id) ?? '';
    const defaultDocumentId = str(text.defaultDocumentId);
    const ownDocuments = documents.filter((doc) => doc.textId === textId);
    return {
      id: textId,
      ...(defaultDocumentId ? { defaultDocumentId } : {}),
      documents: ownDocuments.map((doc) => {
        const documentId = str(doc.id) ?? '';
        const layerIds = tiers
          .filter(
            (tier) =>
              tier.textId === textId &&
              String(tier.key ?? '').startsWith('bridge_') &&
              (str(tier.documentId) ?? defaultDocumentId) === documentId,
          )
          .map((tier) => String(tier.id))
          .sort();
        const sourceIds = Array.isArray(doc.sourceIds) ? doc.sourceIds.map(String) : [];
        return { documentId, isDefault: documentId === defaultDocumentId, layerIds, sourceIds };
      }),
    };
  });
}

/** 项目行引用到的系统模板 ID | System template ids referenced by stored rows */
export function collectArchiveSystemRefs(snapshot: {
  collections: Record<string, unknown[]>;
}): Array<{ id: string }> {
  const ids = new Set<string>();
  for (const row of snapshot.collections['structural_rule_profiles'] ?? []) {
    const ref = (row as { derivedFromSystemId?: unknown } | null)?.derivedFromSystemId;
    if (isSystemTemplateId(ref)) ids.add(ref);
  }
  return [...ids].sort().map((id) => ({ id }));
}

export interface JieyuArchiveExportOptions {
  encryption?: JieyuArchiveEncryptionOptions;
}

export interface JieyuArchiveImportResult {
  kind: ArchiveKind;
  importResult: ImportResult;
  manifest: JieyuArchiveManifest;
}

export interface JieyuArchiveImportPreviewCollection {
  name: string;
  incoming: number;
  conflicts: number;
  existing: number;
  willInsertUpsert: number;
  willInsertSkipExisting: number;
  willInsertReplaceAll: number;
}

/** JYT 恢复为新项目时预览里额外显示的内容 | Extra preview facts when a JYT restores as a new project */
export interface JieyuArchiveRestoreAsNewPreview {
  sourceProjectTitle: string;
  mediaWithoutBytes: number;
  skippedLanguageIds: string[];
}

export interface JieyuArchiveImportPreview {
  kind: ArchiveKind;
  manifest: JieyuArchiveManifest;
  /** 有值时是“恢复为新项目”，没有导入策略可选（JYT，D5）| Set when the archive restores as a new project (JYT, D5) */
  restoreAsNewProject?: JieyuArchiveRestoreAsNewPreview;
  collections: JieyuArchiveImportPreviewCollection[];
  /** 当前代码里不存在的系统引用（rev5 4.2-9）| System refs the running code cannot resolve */
  unresolvedSystemRefs: string[];
  totalIncoming: number;
  totalConflicts: number;
}

export interface JieyuArchiveImportOptions {
  strategy?: ImportConflictStrategy;
  policy?: Partial<JieyuArchiveImportPolicy>;
  password?: string;
}

const ARCHIVE_SNAPSHOT_PATH = 'data/snapshot.json';
const ARCHIVE_ENCRYPTED_SNAPSHOT_PATH = 'data/snapshot.enc';
function kindToMime(_kind: 'jym'): string {
  return MIMETYPE_JYM;
}

function mimeToKind(mime: string): 'jym' {
  if (mime === MIMETYPE_JYM) return 'jym';
  // JYT 走 JytService；旧整库 JYT 也在那里给出明确拒绝 | JYT goes through JytService
  throw new SnapshotFormatError({
    code: 'unsupported-package',
    message: `Unsupported Jieyu archive mimetype: ${mime}`,
  });
}

async function resolveSnapshotPayloadBytes(
  files: Record<string, Uint8Array>,
  manifest: JieyuArchiveManifest,
  password: string | undefined,
): Promise<Uint8Array> {
  if (manifest.encryption) {
    const encryptedU8 = files[ARCHIVE_ENCRYPTED_SNAPSHOT_PATH];
    if (!encryptedU8) {
      throw new Error(`Invalid Jieyu archive: missing ${ARCHIVE_ENCRYPTED_SNAPSHOT_PATH}`);
    }
    return decryptArchiveSnapshot(encryptedU8, manifest.encryption, password);
  }

  const snapshotU8 = files[ARCHIVE_SNAPSHOT_PATH];
  if (!snapshotU8) {
    throw new Error(`Invalid Jieyu archive: missing ${ARCHIVE_SNAPSHOT_PATH}`);
  }
  return snapshotU8;
}

function extractSnapshotCollections(snapshot: unknown): Record<string, unknown[]> {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid Jieyu archive: snapshot JSON must be an object');
  }

  const collections = (snapshot as { collections?: unknown }).collections;
  if (!collections || typeof collections !== 'object') {
    throw new Error('Invalid Jieyu archive: snapshot is missing collections');
  }

  const result: Record<string, unknown[]> = {};
  for (const [name, docs] of Object.entries(collections)) {
    if (Array.isArray(docs)) {
      result[name] = docs;
    }
  }
  return result;
}

async function countExistingDocIds(collectionName: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const normalizedIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (normalizedIds.length === 0) return 0;

  const dbEngine = await loadDbEngineModule();
  const db = await dbEngine.getDb();
  const dexieTables = db.dexie as unknown as Record<
    string,
    { bulkGet?: (keys: string[]) => Promise<unknown[]> }
  >;
  const table = dexieTables[collectionName];
  if (!table || typeof table.bulkGet !== 'function') return 0;

  let existingCount = 0;
  const chunkSize = 2000;
  for (let offset = 0; offset < normalizedIds.length; offset += chunkSize) {
    const chunk = normalizedIds.slice(offset, offset + chunkSize);
    const rows = (await table.bulkGet(chunk)) as unknown[];
    existingCount += rows.reduce<number>((count, row) => (row ? count + 1 : count), 0);
  }

  return existingCount;
}

export async function exportToJieyuArchive(
  kind: 'jym',
  options?: JieyuArchiveExportOptions,
): Promise<Uint8Array> {
  const dbIo = await loadDbIoModule();
  const snapshot = await dbIo.exportDatabaseAsJson();
  const payload = snapshot;

  const manifest: JieyuArchiveManifest = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    kind,
    schemaVersion: snapshot.schemaVersion,
    exportedAt: snapshot.exportedAt,
    dbName: snapshot.dbName,
    systemRefs: collectArchiveSystemRefs(snapshot),
    projects: collectArchiveProjectDocuments(snapshot),
  };

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8(kindToMime(kind)),
  };

  const snapshotBytes = toJsonBytes(payload);
  if (options?.encryption) {
    const { encryptedBytes, metadata } = await encryptArchiveSnapshot(
      snapshotBytes,
      options.encryption,
    );
    manifest.encryption = metadata;
    files[ARCHIVE_ENCRYPTED_SNAPSHOT_PATH] = encryptedBytes;
  } else {
    files[ARCHIVE_SNAPSHOT_PATH] = snapshotBytes;
  }

  files['META-INF/manifest.json'] = toJsonBytes(manifest);
  return zipSync(files);
}

export async function importFromJieyuArchive(
  archiveBytes: Uint8Array,
  options?: JieyuArchiveImportOptions,
): Promise<JieyuArchiveImportResult> {
  const policy = normalizeImportPolicy(options?.policy);
  const files = unzipWithGuard(archiveBytes, policy);
  const mimeU8 = files['mimetype'];
  const manifestU8 = files['META-INF/manifest.json'];

  if (!mimeU8) throw new Error('Invalid Jieyu archive: missing mimetype');
  if (!manifestU8) throw new Error('Invalid Jieyu archive: missing META-INF/manifest.json');

  const kind = mimeToKind(toText(mimeU8).trim());
  const manifest = parseJsonWithGuard<JieyuArchiveManifest>(manifestU8, policy, 'manifest');
  if (manifest.formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unsupported Jieyu archive formatVersion=${manifest.formatVersion}`);
  }

  const dbIo = await loadDbIoModule();
  dbIo.assertSupportedSnapshotVersion(manifest);
  const snapshotU8 = await resolveSnapshotPayloadBytes(files, manifest, options?.password);
  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const importResult = await dbIo.importDatabaseFromJson(snapshot, {
    ...(options?.strategy ? { strategy: options.strategy } : {}),
  });

  return { kind, importResult, manifest };
}

export async function previewJieyuArchiveImport(
  archiveBytes: Uint8Array,
  options?: Pick<JieyuArchiveImportOptions, 'policy' | 'password'>,
): Promise<JieyuArchiveImportPreview> {
  const policy = normalizeImportPolicy(options?.policy);
  const files = unzipWithGuard(archiveBytes, policy);
  const mimeU8 = files['mimetype'];
  const manifestU8 = files['META-INF/manifest.json'];

  if (!mimeU8) throw new Error('Invalid Jieyu archive: missing mimetype');
  if (!manifestU8) throw new Error('Invalid Jieyu archive: missing META-INF/manifest.json');

  const kind = mimeToKind(toText(mimeU8).trim());
  const manifest = parseJsonWithGuard<JieyuArchiveManifest>(manifestU8, policy, 'manifest');
  if (manifest.formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unsupported Jieyu archive formatVersion=${manifest.formatVersion}`);
  }

  const dbIo = await loadDbIoModule();
  // RD-1：旧库导出在解密 / 解析之前就按 manifest 拒绝 | Reject old-database exports from the manifest first
  dbIo.assertSupportedSnapshotVersion(manifest);
  const snapshotU8 = await resolveSnapshotPayloadBytes(files, manifest, options?.password);
  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const collections = extractSnapshotCollections(snapshot);
  // RD-1：预览与导入用同一套逐条校验，预览通过就不会在导入时才报结构错误。
  // RD-1: preview runs the same per-record validation as import, so a clean preview cannot end in
  // a schema error at import time.
  await dbIo.prepareSnapshotImport(snapshot, new Date().toISOString());

  const previewCollections: JieyuArchiveImportPreviewCollection[] = [];
  for (const [name, docs] of Object.entries(collections)) {
    // JY-04：导入时会丢弃的分类不进预览 | Classes dropped on import are not previewed as inserts
    if (isCollectionDroppedOnImport(name)) continue;
    const incoming = docs.length;
    const ids = docs
      .map((doc) => (doc && typeof doc === 'object' ? (doc as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    const existing = await countExistingDocIds(name, ids);
    const conflicts = Math.min(existing, incoming);
    previewCollections.push({
      name,
      incoming,
      existing,
      conflicts,
      willInsertUpsert: incoming,
      willInsertSkipExisting: Math.max(0, incoming - conflicts),
      willInsertReplaceAll: incoming,
    });
  }

  previewCollections.sort((left, right) => {
    if (right.incoming !== left.incoming) return right.incoming - left.incoming;
    if (right.conflicts !== left.conflicts) return right.conflicts - left.conflicts;
    return left.name.localeCompare(right.name, 'en');
  });

  return {
    kind,
    manifest,
    collections: previewCollections,
    unresolvedSystemRefs: listUnresolvedSystemRefs(
      (manifest.systemRefs ?? []).map((ref) => ref.id),
    ),
    totalIncoming: previewCollections.reduce((sum, item) => sum + item.incoming, 0),
    totalConflicts: previewCollections.reduce((sum, item) => sum + item.conflicts, 0),
  };
}

export async function downloadJieyuArchive(
  kind: 'jym',
  baseName = 'jieyu-project',
  options?: JieyuArchiveExportOptions,
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadJieyuArchive can only run in browser context');
  }

  const bytes = await exportToJieyuArchive(kind, options);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importJieyuArchiveFile(
  file: File,
  options?: JieyuArchiveImportOptions,
): Promise<JieyuArchiveImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importFromJieyuArchive(bytes, options);
}

export async function previewJieyuArchiveFile(
  file: File,
  options?: Pick<JieyuArchiveImportOptions, 'policy' | 'password'>,
): Promise<JieyuArchiveImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return previewJieyuArchiveImport(bytes, options);
}

export type { ArchiveKind, JieyuArchiveManifest };
