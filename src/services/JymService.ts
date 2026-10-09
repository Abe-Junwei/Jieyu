import { strToU8, unzipSync, zipSync } from 'fflate';
import type { ImportConflictStrategy, ImportResult } from '../db/types';
import { isSystemTemplateId } from '../db/catalogOwnership';
import { isCollectionDroppedOnImport } from '../db/tableRegistry';
import { listUnresolvedSystemRefs } from '../annotation/systemStructuralRuleProfiles';

const ARCHIVE_FORMAT_VERSION = 1;
const MIMETYPE_JYM = 'application/x-jieyu-media';
const MIMETYPE_JYT = 'application/x-jieyu-text';

type ArchiveKind = 'jym' | 'jyt';
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');
type DatabaseSnapshot = {
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: Record<string, unknown[]>;
};

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

/** Web Crypto typings expect `ArrayBuffer`-backed views; copy into a dedicated `ArrayBuffer`. */
function webCryptoBufferSource(bytes: Uint8Array): BufferSource {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(buffer);
  out.set(bytes);
  return out;
}

interface JieyuArchiveEncryptionMetadata {
  mode: 'aes-256-gcm';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  passwordHint?: string;
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

export interface JieyuArchiveEncryptionOptions {
  password: string;
  passwordHint?: string;
}

export interface JieyuArchiveExportOptions {
  encryption?: JieyuArchiveEncryptionOptions;
}

export interface JieyuArchiveImportResult {
  kind: ArchiveKind;
  importResult: ImportResult;
  manifest: JieyuArchiveManifest;
  /** 包内 texts 集合的项目 id（RD-3：无当前项目时据此切换）| Project ids in the archive's texts (RD-3) */
  importedTextIds: string[];
}

function textIdsInSnapshot(snapshot: unknown): string[] {
  const collections = (snapshot as { collections?: Record<string, unknown> } | null)?.collections;
  const texts = collections?.['texts'];
  if (!Array.isArray(texts)) return [];
  const ids = texts
    .map((row) => (row as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
  return [...new Set(ids)];
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
  /** 当前代码里不存在的系统引用（rev5 4.2-9）| System refs the running code cannot resolve */
  unresolvedSystemRefs: string[];
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
  password?: string;
}

const DEFAULT_IMPORT_POLICY: JieyuArchiveImportPolicy = {
  maxArchiveBytes: 80 * 1024 * 1024,
  maxEntryCount: 256,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 96 * 1024 * 1024,
  maxJsonDepth: 64,
  maxJsonNodes: 500_000,
};

const ARCHIVE_SNAPSHOT_PATH = 'data/snapshot.json';
const ARCHIVE_ENCRYPTED_SNAPSHOT_PATH = 'data/snapshot.enc';
const ARCHIVE_ENCRYPTION_ITERATIONS = 250_000;

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

function normalizeImportPolicy(
  policy?: Partial<JieyuArchiveImportPolicy>,
): JieyuArchiveImportPolicy {
  if (!policy) return DEFAULT_IMPORT_POLICY;
  return {
    ...DEFAULT_IMPORT_POLICY,
    ...policy,
  };
}

function getWebCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Archive encryption requires Web Crypto support in the current runtime');
  }
  return cryptoApi;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}

async function deriveArchiveKey(
  password: string,
  salt: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    webCryptoBufferSource(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: webCryptoBufferSource(salt),
      iterations: ARCHIVE_ENCRYPTION_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    [usage],
  );
}

async function encryptArchiveSnapshot(
  payloadBytes: Uint8Array,
  options: JieyuArchiveEncryptionOptions,
): Promise<{ encryptedBytes: Uint8Array; metadata: JieyuArchiveEncryptionMetadata }> {
  const password = options.password.trim();
  if (!password) {
    throw new Error('Archive encryption password must not be empty');
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveArchiveKey(password, salt, 'encrypt');
  const encrypted = await getWebCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: webCryptoBufferSource(iv) },
    key,
    webCryptoBufferSource(payloadBytes),
  );

  return {
    encryptedBytes: new Uint8Array(encrypted),
    metadata: {
      mode: 'aes-256-gcm',
      kdf: 'PBKDF2-SHA-256',
      iterations: ARCHIVE_ENCRYPTION_ITERATIONS,
      saltBase64: encodeBase64(salt),
      ivBase64: encodeBase64(iv),
      ...(options.passwordHint?.trim() ? { passwordHint: options.passwordHint.trim() } : {}),
    },
  };
}

async function decryptArchiveSnapshot(
  payloadBytes: Uint8Array,
  encryption: JieyuArchiveEncryptionMetadata,
  password: string | undefined,
): Promise<Uint8Array> {
  const normalizedPassword = password?.trim();
  if (!normalizedPassword) {
    throw new Error('Encrypted Jieyu archive password required');
  }

  try {
    const salt = decodeBase64(encryption.saltBase64);
    const iv = decodeBase64(encryption.ivBase64);
    const key = await deriveArchiveKey(normalizedPassword, salt, 'decrypt');
    const decrypted = await getWebCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: webCryptoBufferSource(iv) },
      key,
      webCryptoBufferSource(payloadBytes),
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error('Failed to decrypt Jieyu archive. Check the password and try again.');
  }
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

function validateJsonStructure(
  value: unknown,
  policy: JieyuArchiveImportPolicy,
  label: string,
): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let objectNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: node, depth } = current;

    if (depth > policy.maxJsonDepth) {
      throw new Error(
        `Invalid Jieyu archive: ${label} JSON depth exceeds limit (${policy.maxJsonDepth})`,
      );
    }
    if (node === null || typeof node !== 'object') continue;

    objectNodes += 1;
    if (objectNodes > policy.maxJsonNodes) {
      throw new Error(
        `Invalid Jieyu archive: ${label} JSON node count exceeds limit (${policy.maxJsonNodes})`,
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

function parseJsonWithGuard<T>(
  raw: Uint8Array,
  policy: JieyuArchiveImportPolicy,
  label: string,
): T {
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

function unzipWithGuard(
  archiveBytes: Uint8Array,
  policy: JieyuArchiveImportPolicy,
): Record<string, Uint8Array> {
  if (archiveBytes.byteLength > policy.maxArchiveBytes) {
    throw new Error(
      `Invalid Jieyu archive: archive size exceeds limit (${policy.maxArchiveBytes} bytes)`,
    );
  }

  let entryCount = 0;
  let plannedExpandedBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archiveBytes, {
      filter(file) {
        entryCount += 1;
        if (entryCount > policy.maxEntryCount) {
          throw new Error(
            `Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`,
          );
        }

        if (!Number.isFinite(file.originalSize) || file.originalSize < 0) {
          throw new Error(
            `Invalid Jieyu archive: entry "${file.name}" has invalid original size metadata`,
          );
        }

        if (file.originalSize > policy.maxEntryBytes) {
          throw new Error(
            `Invalid Jieyu archive: entry "${file.name}" exceeds size limit (${policy.maxEntryBytes} bytes)`,
          );
        }

        plannedExpandedBytes += file.originalSize;
        if (plannedExpandedBytes > policy.maxExpandedBytes) {
          throw new Error(
            `Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`,
          );
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
      throw new Error(
        `Invalid Jieyu archive: entry "${name}" exceeds size limit (${policy.maxEntryBytes} bytes)`,
      );
    }

    actualExpandedBytes += bytes.byteLength;
    if (actualExpandedBytes > policy.maxExpandedBytes) {
      throw new Error(
        `Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`,
      );
    }
  }

  return files;
}

function sanitizeSnapshotForJyt(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as DatabaseSnapshot;
  const mediaItems = cloned.collections['media_items'] as
    | Array<Record<string, unknown>>
    | undefined;

  if (mediaItems) {
    for (const item of mediaItems) {
      const details = item.details as Record<string, unknown> | undefined;
      if (!details) continue;
      if (typeof details.audioDataUrl === 'string') {
        delete details.audioDataUrl;
        // JYT 不带字节：被剥离的内嵌音频也要显式标为省略 | JYT carries no bytes; mark stripped audio as omitted
        details.audioExportOmitted = true;
      }
      // 保留 audioExportOmitted 等省略标记：入站时据此保留本机字节，而不是当成删除。
      // Keep omission markers so inbound imports keep local bytes instead of treating them as deleted.
    }
  }

  return cloned;
}

export async function exportToJieyuArchive(
  kind: ArchiveKind,
  options?: JieyuArchiveExportOptions,
): Promise<Uint8Array> {
  const dbIo = await loadDbIoModule();
  const snapshot = await dbIo.exportDatabaseAsJson();
  const payload = kind === 'jyt' ? sanitizeSnapshotForJyt(snapshot) : snapshot;

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

  const snapshotU8 = await resolveSnapshotPayloadBytes(files, manifest, options?.password);
  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const dbIo = await loadDbIoModule();
  const importResult = await dbIo.importDatabaseFromJson(snapshot, {
    ...(options?.strategy ? { strategy: options.strategy } : {}),
  });

  return { kind, importResult, manifest, importedTextIds: textIdsInSnapshot(snapshot) };
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

  const snapshotU8 = await resolveSnapshotPayloadBytes(files, manifest, options?.password);
  const snapshot = parseJsonWithGuard<unknown>(snapshotU8, policy, 'snapshot');
  const collections = extractSnapshotCollections(snapshot);

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
  kind: ArchiveKind,
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
