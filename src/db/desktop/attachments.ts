import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export type AttachmentKind = 'image' | 'audio' | 'document';
export type AttachmentState = 'ready' | 'cleanup_pending' | 'cleanup_unknown';
export type AttachmentTrash = (absolutePath: string) => Promise<'moved' | 'unknown'>;

export interface AttachmentPublish {
  lexemeId: string;
  displayName: string;
  kind: AttachmentKind;
  mimeType: string;
  bytes: Uint8Array;
  operationId: string;
}

export interface AttachmentPublication {
  fileId: string;
  linkId: string;
  sha256: string;
  relpath: string;
  state: 'ready';
}

export interface AttachmentLinkRemoval {
  fileId: string;
  state: AttachmentState;
}

export interface AttachmentCleanup {
  fileId: string;
  state: AttachmentState | 'removed';
}

interface FileRow {
  id: string;
  sha256: string;
  relpath: string;
  state: string;
}

const ESCAPE = 'attachment path escapes the project folder';

export function sweepAttachmentTmp(folder: string): void {
  const root = realpathSync(folder);
  const tmp = path.join(root, 'attachments', 'tmp');
  let stat;
  try {
    stat = lstatSync(tmp);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  const real = realpathSync(tmp);
  if (!isInside(root, real)) return;
  for (const name of readdirSync(real)) {
    const child = path.join(real, name);
    const childStat = lstatSync(child);
    if (!childStat.isFile() || childStat.isSymbolicLink()) continue;
    if (!isInside(real, realpathSync(child))) continue;
    rmSync(child);
  }
}

export function publishAttachment(
  db: SqliteDatabase,
  folder: string,
  input: AttachmentPublish,
): AttachmentPublication {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.operationId)) {
    throw new Error('attachment operation id is invalid');
  }
  if (input.kind !== 'image' && input.kind !== 'audio' && input.kind !== 'document') {
    throw new Error('attachment kind is invalid');
  }
  if (input.mimeType.length === 0 || input.mimeType.includes('\0')) {
    throw new Error('attachment mime type is invalid');
  }
  if (input.displayName.length === 0 || input.displayName.includes('\0')) {
    throw new Error('attachment display name is invalid');
  }
  const digest = sha256(input.bytes);
  const relpath = `attachments/objects/${digest}`;
  const tempDir = attachmentDir(folder, 'tmp');
  const objectDir = attachmentDir(folder, 'objects');
  const tempFile = path.join(tempDir, input.operationId);
  const objectFile = path.join(objectDir, digest);
  writeFileSync(tempFile, input.bytes, { flag: 'wx' });
  try {
    if (sha256(readFileSync(tempFile)) !== digest) throw new Error('attachment hash conflicts');
    placeObject(tempFile, objectFile, digest);
    if (sha256(readFileSync(objectFile)) !== digest) throw new Error('attachment hash conflicts');
    return db.transaction(() => {
      const lexeme = db.prepare('SELECT kind FROM lexemes WHERE id = ?').get(input.lexemeId) as
        { kind: string } | undefined;
      if (lexeme?.kind !== 'entry') throw new Error('lexeme is missing');
      const existing = db
        .prepare('SELECT id, state FROM attachment_files WHERE sha256 = ?')
        .get(digest) as { id: string; state: string } | undefined;
      const now = new Date().toISOString();
      const fileId = existing?.id ?? randomUUID();
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO attachment_files (
            id, sha256, relpath, byte_size, kind, mime_type, state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
        ).run(fileId, digest, relpath, input.bytes.byteLength, input.kind, input.mimeType, now);
      } else if (existing.state === 'cleanup_pending') {
        db.prepare(`UPDATE attachment_files SET state = 'ready' WHERE id = ?`).run(fileId);
      } else if (existing.state !== 'ready') {
        throw new Error('attachment file is unresolved');
      }
      const link = db
        .prepare('SELECT id FROM attachment_links WHERE file_id = ? AND lexeme_id = ?')
        .get(fileId, input.lexemeId) as { id: string } | undefined;
      const linkId = link?.id ?? randomUUID();
      if (link === undefined) {
        db.prepare(
          `INSERT INTO attachment_links (id, file_id, lexeme_id, display_name, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(linkId, fileId, input.lexemeId, input.displayName, now);
      }
      return { fileId, linkId, sha256: digest, relpath, state: 'ready' as const };
    })();
  } finally {
    rmSync(tempFile, { force: true });
  }
}

export function removeAttachmentLink(db: SqliteDatabase, linkId: string): AttachmentLinkRemoval {
  const removed = db.transaction(() => {
    const link = db.prepare('SELECT file_id FROM attachment_links WHERE id = ?').get(linkId) as
      { file_id: string } | undefined;
    if (link === undefined) throw new Error('attachment link is missing');
    db.prepare('DELETE FROM attachment_links WHERE id = ?').run(linkId);
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM attachment_links WHERE file_id = ?')
      .get(link.file_id) as { n: number };
    if (count.n === 0) {
      db.prepare(
        `UPDATE attachment_files SET state = 'cleanup_pending'
         WHERE id = ? AND state = 'ready'`,
      ).run(link.file_id);
    }
    const row = readFile(db, link.file_id);
    if (row === undefined || !isState(row.state)) throw new Error('attachment file is missing');
    return { fileId: row.id, state: row.state };
  });
  return removed();
}

export async function finishAttachmentCleanup(
  db: SqliteDatabase,
  folder: string,
  fileId: string,
  trash: AttachmentTrash,
): Promise<AttachmentCleanup> {
  const row = readFile(db, fileId);
  if (row === undefined || !isState(row.state)) throw new Error('attachment file is missing');
  if (row.state !== 'cleanup_pending') return { fileId, state: row.state };
  const links = db
    .prepare('SELECT COUNT(*) AS n FROM attachment_links WHERE file_id = ?')
    .get(fileId) as { n: number };
  if (links.n > 0) {
    markState(db, fileId, 'ready');
    return { fileId, state: 'ready' };
  }
  const absolute = objectFile(folder, row);
  if (absolute === undefined || sha256(readFileSync(absolute)) !== row.sha256) {
    markState(db, fileId, 'cleanup_unknown');
    return { fileId, state: 'cleanup_unknown' };
  }
  let outcome: 'moved' | 'unknown' = 'unknown';
  try {
    const reported = await trash(absolute);
    if (reported === 'moved') outcome = 'moved';
  } catch {
    outcome = 'unknown';
  }
  if (outcome !== 'moved' || fileStillThere(absolute)) {
    markState(db, fileId, 'cleanup_unknown');
    return { fileId, state: 'cleanup_unknown' };
  }
  const deleted = db.transaction(() => {
    const current = readFile(db, fileId);
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM attachment_links WHERE file_id = ?')
      .get(fileId) as { n: number };
    if (current?.state !== 'cleanup_pending' || count.n !== 0) return false;
    db.prepare('DELETE FROM attachment_files WHERE id = ?').run(fileId);
    return true;
  })();
  if (!deleted) {
    if (readFile(db, fileId) === undefined) return { fileId, state: 'removed' };
    markState(db, fileId, 'cleanup_unknown');
    return { fileId, state: 'cleanup_unknown' };
  }
  return { fileId, state: 'removed' };
}

function placeObject(tempFile: string, objectFile: string, digest: string): void {
  let stat;
  try {
    stat = lstatSync(objectFile);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  if (stat !== undefined && stat.isSymbolicLink()) throw new Error(ESCAPE);
  if (stat !== undefined && stat.isFile()) {
    if (sha256(readFileSync(objectFile)) !== digest) throw new Error('attachment hash conflicts');
    return;
  }
  if (stat !== undefined) throw new Error('attachment hash conflicts');
  renameSync(tempFile, objectFile);
}

function objectFile(folder: string, row: FileRow): string | undefined {
  if (row.relpath !== `attachments/objects/${row.sha256}`) throw new Error(ESCAPE);
  const dir = attachmentDir(folder, 'objects');
  const candidate = path.join(dir, row.sha256);
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(ESCAPE);
  const real = realpathSync(candidate);
  if (!isInside(dir, real)) throw new Error(ESCAPE);
  return real;
}

function attachmentDir(folder: string, leaf: 'tmp' | 'objects'): string {
  const root = realpathSync(folder);
  const parent = containedDir(root, path.join(root, 'attachments'));
  return containedDir(root, path.join(parent, leaf));
}

function containedDir(root: string, dir: string): string {
  let stat;
  try {
    stat = lstatSync(dir);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  if (stat !== undefined && (stat.isSymbolicLink() || !stat.isDirectory())) {
    throw new Error(ESCAPE);
  }
  if (stat === undefined) mkdirSync(dir);
  const real = realpathSync(dir);
  if (!isInside(root, real)) throw new Error(ESCAPE);
  return real;
}

function readFile(db: SqliteDatabase, fileId: string): FileRow | undefined {
  return db
    .prepare('SELECT id, sha256, relpath, state FROM attachment_files WHERE id = ?')
    .get(fileId) as FileRow | undefined;
}

function markState(db: SqliteDatabase, fileId: string, state: AttachmentState): void {
  db.prepare('UPDATE attachment_files SET state = ? WHERE id = ?').run(state, fileId);
}

function fileStillThere(absolute: string): boolean {
  try {
    return lstatSync(absolute).isFile();
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isState(value: string): value is AttachmentState {
  return value === 'ready' || value === 'cleanup_pending' || value === 'cleanup_unknown';
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return (
    rel.length > 0 && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`)
  );
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}
