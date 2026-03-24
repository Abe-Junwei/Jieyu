import { strToU8, unzipSync, zipSync } from 'fflate';
import { exportDatabaseAsJson, importDatabaseFromJson, type ImportConflictStrategy, type ImportResult } from '../../db';

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
  options?: { strategy?: ImportConflictStrategy },
): Promise<JieyuArchiveImportResult> {
  const files = unzipSync(archiveBytes);
  const mimeU8 = files['mimetype'];
  const manifestU8 = files['META-INF/manifest.json'];
  const snapshotU8 = files['data/snapshot.json'];

  if (!mimeU8) throw new Error('Invalid Jieyu archive: missing mimetype');
  if (!manifestU8) throw new Error('Invalid Jieyu archive: missing META-INF/manifest.json');
  if (!snapshotU8) throw new Error('Invalid Jieyu archive: missing data/snapshot.json');

  const kind = mimeToKind(toText(mimeU8).trim());
  const manifest = JSON.parse(toText(manifestU8)) as JieyuArchiveManifest;
  if (manifest.formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new Error(`Unsupported Jieyu archive formatVersion=${manifest.formatVersion}`);
  }

  const snapshot = JSON.parse(toText(snapshotU8));
  const importResult = await importDatabaseFromJson(snapshot, options);

  return { kind, importResult, manifest };
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
  options?: { strategy?: ImportConflictStrategy },
): Promise<JieyuArchiveImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importFromJieyuArchive(bytes, options);
}

export type { ArchiveKind, JieyuArchiveManifest };
