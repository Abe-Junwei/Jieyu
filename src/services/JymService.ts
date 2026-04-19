import { strToU8, unzipSync, zipSync } from 'fflate';
import { exportDatabaseAsJson, getDb, importDatabaseFromJson, type ImportConflictStrategy, type ImportResult } from '../db';

const ARCHIVE_FORMAT_VERSION = 1;
const MIMETYPE_JYM = 'application/x-jieyu-media';
const MIMETYPE_JYT = 'application/x-jieyu-text';

type ArchiveKind = 'jym' | 'jyt';

interface JieyuArchiveManifest {
  formatVersion: number;
  kind: ArchiveKind;
  schemaVersion: number;
  exportedAt: string;
  dbName?: string;
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

export interface JieyuArchiveImportPreview {
  kind: ArchiveKind;
  manifest: JieyuArchiveManifest;
  collections: JieyuArchiveImportPreviewCollection[];
  totalIncoming: number;
  totalConflicts: number;
}

export interface JieyuArchiveImportPolicy {
  maxArchiveBytes: number;
  maxEntryCount: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxJsonDepth: number;
  maxJsonNodes: number;
}

export interface JieyuArchiveImportOptions {
  strategy?: ImportConflictStrategy;
  policy?: Partial<JieyuArchiveImportPolicy>;
}

const DEFAULT_IMPORT_POLICY: JieyuArchiveImportPolicy = {
  maxArchiveBytes: 80 * 1024 * 1024,
  maxEntryCount: 256,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 96 * 1024 * 1024,
  maxJsonDepth: 64,
  maxJsonNodes: 500_000,
};

function kindToMime(kind: ArchiveKind): string {
  return kind === 'jym' ? MIMETYPE_JYM : MIMETYPE_JYT;
}

function mimeToKind(mime: string): ArchiveKind {
  if (mime === MIMETYPE_JYM) return 'jym';
  if (mime === MIMETYPE_JYT) return 'jyt';
  throw new Error(`Unsupported Jieyu archive mimetype: ${mime}`);
}

function toText(u8: Uint8Array): string {
  return new TextDecoder().decode(u8);
}

function toJsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

function normalizeImportPolicy(policy?: Partial<JieyuArchiveImportPolicy>): JieyuArchiveImportPolicy {
  if (!policy) return DEFAULT_IMPORT_POLICY;
  return {
    ...DEFAULT_IMPORT_POLICY,
    ...policy,
  };
}

function validateJsonStructure(value: unknown, policy: JieyuArchiveImportPolicy, label: string): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let objectNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: node, depth } = current;

    if (depth > policy.maxJsonDepth) {
      throw new Error(`Invalid Jieyu archive: ${label} JSON depth exceeds limit (${policy.maxJsonDepth})`);
    }
    if (node === null || typeof node !== 'object') continue;

    objectNodes += 1;
    if (objectNodes > policy.maxJsonNodes) {
      throw new Error(`Invalid Jieyu archive: ${label} JSON node count exceeds limit (${policy.maxJsonNodes})`);
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

function parseJsonWithGuard<T>(raw: Uint8Array, policy: JieyuArchiveImportPolicy, label: string): T {
  try {
    const parsed = JSON.parse(toText(raw)) as T;
    validateJsonStructure(parsed, policy, label);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Jieyu archive:')) {
      throw error;
    }
    throw new Error(`Invalid Jieyu archive: failed to parse ${label} JSON`);
  }
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

  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (normalizedIds.length === 0) return 0;

  const db = await getDb();
  const dexieTables = db.dexie as unknown as Record<string, { bulkGet?: (keys: string[]) => Promise<unknown[]> }>;
  const table = dexieTables[collectionName];
  if (!table || typeof table.bulkGet !== 'function') return 0;

  let existingCount = 0;
  const chunkSize = 2000;
  for (let offset = 0; offset < normalizedIds.length; offset += chunkSize) {
    const chunk = normalizedIds.slice(offset, offset + chunkSize);
    const rows = await table.bulkGet(chunk) as unknown[];
    existingCount += rows.reduce<number>((count, row) => (row ? count + 1 : count), 0);
  }

  return existingCount;
}

function unzipWithGuard(archiveBytes: Uint8Array, policy: JieyuArchiveImportPolicy): Record<string, Uint8Array> {
  if (archiveBytes.byteLength > policy.maxArchiveBytes) {
    throw new Error(`Invalid Jieyu archive: archive size exceeds limit (${policy.maxArchiveBytes} bytes)`);
  }

  let entryCount = 0;
  let plannedExpandedBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archiveBytes, {
      filter(file) {
        entryCount += 1;
        if (entryCount > policy.maxEntryCount) {
          throw new Error(`Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`);
        }

        if (!Number.isFinite(file.originalSize) || file.originalSize < 0) {
          throw new Error(`Invalid Jieyu archive: entry "${file.name}" has invalid original size metadata`);
        }

        if (file.originalSize > policy.maxEntryBytes) {
          throw new Error(`Invalid Jieyu archive: entry "${file.name}" exceeds size limit (${policy.maxEntryBytes} bytes)`);
        }

        plannedExpandedBytes += file.originalSize;
        if (plannedExpandedBytes > policy.maxExpandedBytes) {
          throw new Error(`Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`);
        }

        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Jieyu archive:')) {
      throw error;
    }
    throw new Error('Invalid Jieyu archive: failed to unzip archive payload');
  }

  const names = Object.keys(files);
  if (names.length > policy.maxEntryCount || entryCount > policy.maxEntryCount) {
    throw new Error(`Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`);
  }

  let actualExpandedBytes = 0;
  for (const name of names) {
    const bytes = files[name];
    if (!bytes) continue;

    if (bytes.byteLength > policy.maxEntryBytes) {
      throw new Error(`Invalid Jieyu archive: entry "${name}" exceeds size limit (${policy.maxEntryBytes} bytes)`);
    }

    actualExpandedBytes += bytes.byteLength;
    if (actualExpandedBytes > policy.maxExpandedBytes) {
      throw new Error(`Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`);
    }
  }

  return files;
}

function sanitizeSnapshotForJyt(snapshot: Awaited<ReturnType<typeof exportDatabaseAsJson>>): Awaited<ReturnType<typeof exportDatabaseAsJson>> {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as Awaited<ReturnType<typeof exportDatabaseAsJson>>;
  const mediaItems = cloned.collections['media_items'] as Array<Record<string, unknown>> | undefined;

  if (mediaItems) {
    for (const item of mediaItems) {
      const details = item.details as Record<string, unknown> | undefined;
      if (!details) continue;
      if (typeof details.audioDataUrl === 'string') {
        delete details.audioDataUrl;
      }
      if (details.audioExportOmitted === true) {
        delete details.audioExportOmitted;
      }
    }
  }

  return cloned;
}

export async function exportToJieyuArchive(kind: ArchiveKind): Promise<Uint8Array> {
  const snapshot = await exportDatabaseAsJson();
  const payload = kind === 'jyt' ? sanitizeSnapshotForJyt(snapshot) : snapshot;

  const manifest: JieyuArchiveManifest = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    kind,
    schemaVersion: snapshot.schemaVersion,
    exportedAt: snapshot.exportedAt,
    dbName: snapshot.dbName,
  };

  return zipSync({
    mimetype: strToU8(kindToMime(kind)),
    'META-INF/manifest.json': toJsonBytes(manifest),
    'data/snapshot.json': toJsonBytes(payload),
  });
}

export async function importFromJieyuArchive(
  archiveBytes: Uint8Array,
  options?: JieyuArchiveImportOptions,
): Promise<JieyuArchiveImportResult> {
  const policy = normalizeImportPolicy(options?.policy);
  const files = unzipWithGuard(archiveBytes, policy);
  const mimeU8 = files['mimetype'];
  const manifestU8 = files['META-INF/manifest.json'];
  const snapshotU8 = files['data/snapshot.json'];

  if (!mimeU8) throw new Error('Invalid Jieyu archive: missing mimetype');
  if (!manifestU8) throw new Error('Invalid Jieyu archive: missing META-INF/manifest.json');
  if (!snapshotU8) throw new Error('Invalid Jieyu archive: missing data/snapshot.json');

  const kind = mimeToKind(toText(mimeU8).trim());
  const manifest = parseJsonWithGuard<JieyuArchiveManifest>(manifestU8, policy, 'manifest');
  if (manifest.formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unsupported Jieyu archive formatVersion=${manifest.formatVersion}`);
  }

  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const importResult = await importDatabaseFromJson(snapshot, {
    ...(options?.strategy ? { strategy: options.strategy } : {}),
  });

  return { kind, importResult, manifest };
}

export async function previewJieyuArchiveImport(
  archiveBytes: Uint8Array,
  options?: Pick<JieyuArchiveImportOptions, 'policy'>,
): Promise<JieyuArchiveImportPreview> {
  const policy = normalizeImportPolicy(options?.policy);
  const files = unzipWithGuard(archiveBytes, policy);
  const mimeU8 = files['mimetype'];
  const manifestU8 = files['META-INF/manifest.json'];
  const snapshotU8 = files['data/snapshot.json'];

  if (!mimeU8) throw new Error('Invalid Jieyu archive: missing mimetype');
  if (!manifestU8) throw new Error('Invalid Jieyu archive: missing META-INF/manifest.json');
  if (!snapshotU8) throw new Error('Invalid Jieyu archive: missing data/snapshot.json');

  const kind = mimeToKind(toText(mimeU8).trim());
  const manifest = parseJsonWithGuard<JieyuArchiveManifest>(manifestU8, policy, 'manifest');
  if (manifest.formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unsupported Jieyu archive formatVersion=${manifest.formatVersion}`);
  }

  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const collections = extractSnapshotCollections(snapshot);

  const previewCollections: JieyuArchiveImportPreviewCollection[] = [];
  for (const [name, docs] of Object.entries(collections)) {
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
    totalIncoming: previewCollections.reduce((sum, item) => sum + item.incoming, 0),
    totalConflicts: previewCollections.reduce((sum, item) => sum + item.conflicts, 0),
  };
}

export async function downloadJieyuArchive(kind: ArchiveKind, baseName = 'jieyu-project'): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadJieyuArchive can only run in browser context');
  }

  const bytes = await exportToJieyuArchive(kind);
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
  options?: Pick<JieyuArchiveImportOptions, 'policy'>,
): Promise<JieyuArchiveImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return previewJieyuArchiveImport(bytes, options);
}

export type { ArchiveKind, JieyuArchiveManifest };
