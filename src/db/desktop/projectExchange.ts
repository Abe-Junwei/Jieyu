import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { openProject } from './openProject';
import { DESKTOP_PROJECT_USER_VERSION } from './schema';

type SqliteDatabase = InstanceType<typeof Database>;
type Row = Record<string, unknown>;

/** Old Dexie JYT stays formatVersion 1. This payload is the desktop table snapshot. */
export const DESKTOP_JYT_FORMAT_VERSION = 2;
const JYT_MIMETYPE = 'application/vnd.jieyu.jyt';
const JYM_MIMETYPE = 'application/vnd.jieyu.jym';
const MIME_PATH = 'mimetype';
const MANIFEST_PATH = 'META-INF/manifest.json';
const DATA_PATH = 'data/project.json';
const MEDIA_PREFIX = 'media/';
const MEDIA_ID = /^[A-Za-z0-9_-]+$/;
const ATTACHMENT_PREFIX = 'attachments/objects/';
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** ponytail: one zip, audio included, 32 MiB. Raise this when a real project exceeds it. */
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const IDENT = /^[a-z_]+$/;
const SHARED_FIELD_TARGETS = new Set([
  'project',
  'source',
  'speaker',
  'conversation',
  'message',
  'orthography',
  'orthography-bridge',
]);
const DEFERRED_COLUMNS = ['deleted_at', 'retain_until', 'reminder_shown_at'] as const;

interface Scope {
  wanted: Set<string>;
  mediaIds: Set<string>;
  layerIds: Set<string>;
  unitIds: Set<string>;
  tokenIds: Set<string>;
  morphemeIds: Set<string>;
  noteIds: Set<string>;
  batchIds: Set<string>;
}

export function saveDesktopPackage(file: string, bytes: Uint8Array): { file: string } {
  writeFileSync(file, bytes);
  return { file };
}

export function exportDesktopJyt(db: SqliteDatabase): Uint8Array {
  return pack(snapshot(db), null, null, null);
}

export function exportDesktopJym(db: SqliteDatabase, folder: string): Uint8Array {
  const tables = snapshot(db);
  return pack(
    tables,
    null,
    readMediaFiles(folder, tables.media ?? []),
    readAttachmentFiles(folder, tables.attachment_files ?? []),
  );
}

export function exportDesktopManuscriptJyt(
  db: SqliteDatabase,
  manuscriptIds: readonly string[],
): Uint8Array {
  if (manuscriptIds.length === 0) throw new Error('manuscript export needs a selection');
  const selected = [...new Set(manuscriptIds)];
  for (const id of selected) {
    const row = db.prepare('SELECT deleted_at FROM manuscripts WHERE id = ?').get(id) as
      { deleted_at: string | null } | undefined;
    if (!row) throw new Error('manuscript is missing');
    if (row.deleted_at !== null) throw new Error('manuscript is deleted');
  }
  return pack(filterManuscripts(snapshot(db), selected), selected, null, null);
}

export function importDesktopJyt(folder: string, bytes: Uint8Array): void {
  installPackage(folder, bytes, 'jyt');
}

export function importDesktopJym(folder: string, bytes: Uint8Array): void {
  installPackage(folder, bytes, 'jym');
}

function installPackage(folder: string, bytes: Uint8Array, expected: 'jyt' | 'jym'): void {
  const parsed = readPackage(bytes);
  if (parsed.kind !== expected) throw new Error('desktop package is unreadable');
  const target = path.join(folder, 'project.sqlite');
  if (existsSync(target)) throw new Error('import destination is not empty');
  const files =
    expected === 'jym'
      ? [
          ...mediaWrites(folder, parsed.tables.media ?? [], parsed.media),
          ...attachmentWrites(folder, parsed.tables.attachment_files ?? [], parsed.attachments),
        ]
      : [];
  const written: string[] = [];
  try {
    for (const file of files) {
      mkdirSync(path.dirname(file.path), { recursive: true });
      const root = realpathSync(path.resolve(folder));
      const parent = realpathSync(path.dirname(file.path));
      if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
        throw new Error('media path escapes the project folder');
      }
      writeFileSync(file.path, file.bytes, { flag: 'wx' });
      written.push(file.path);
    }
    const project = openProject(folder);
    try {
      insertPayload(project.db, parsed.tables);
    } catch (error) {
      try {
        project.close();
      } catch {
        // The lock release is best-effort; the new file is still removed below.
      }
      throw error;
    }
    project.close();
  } catch (error) {
    for (const file of written) rmSync(file, { force: true });
    rmSync(target, { force: true });
    rmSync(`${target}-journal`, { force: true });
    throw error;
  }
}

function snapshot(db: SqliteDatabase): Record<string, Row[]> {
  const tables: Record<string, Row[]> = {};
  for (const name of tableNames(db)) tables[name] = selectAll(db, name);
  return tables;
}

function filterManuscripts(
  tables: Record<string, Row[]>,
  selected: readonly string[],
): Record<string, Row[]> {
  const wanted = new Set(selected);
  const manuscripts = (tables.manuscripts ?? []).filter((row) => wanted.has(String(row.id)));
  const mediaIds = new Set(manuscripts.map((row) => String(row.media_id)));
  const layerIds = idsWhere(tables.layers, (row) => wanted.has(String(row.manuscript_id)));
  const unitIds = idsWhere(tables.units, (row) => layerIds.has(String(row.layer_id)));
  const tokenIds = idsWhere(tables.tokens, (row) => unitIds.has(String(row.unit_id)));
  const morphemeIds = idsWhere(tables.morphemes, (row) => tokenIds.has(String(row.token_id)));
  const noteIds = idsWhere(
    tables.notes,
    (row) => row.manuscript_id != null && wanted.has(String(row.manuscript_id)),
  );
  const batchIds = idsWhere(tables.reception_batches, (row) => unitIds.has(String(row.unit_id)));
  const scope: Scope = {
    wanted,
    mediaIds,
    layerIds,
    unitIds,
    tokenIds,
    morphemeIds,
    noteIds,
    batchIds,
  };
  const filtered: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) {
    filtered[name] = rows.filter((row) => keepRow(name, row, scope));
  }
  return filtered;
}

function keepRow(name: string, row: Row, scope: Scope): boolean {
  if (name === 'manuscripts') return scope.wanted.has(String(row.id));
  if (name === 'media') return scope.mediaIds.has(String(row.id));
  if (name === 'token_lexeme_links') {
    const ids = row.target_type === 'morpheme' ? scope.morphemeIds : scope.tokenIds;
    return ids.has(String(row.target_id));
  }
  if (name === 'custom_field_values') return keepCustomValue(row, scope);
  if (name === 'local_id_map') return scope.batchIds.has(String(row.batch_id));
  if ('manuscript_id' in row && row.manuscript_id != null) {
    return scope.wanted.has(String(row.manuscript_id));
  }
  if ('layer_id' in row && row.layer_id != null) return scope.layerIds.has(String(row.layer_id));
  if ('unit_id' in row && row.unit_id != null) return scope.unitIds.has(String(row.unit_id));
  if ('token_id' in row && row.token_id != null) return scope.tokenIds.has(String(row.token_id));
  if ('morpheme_id' in row && row.morpheme_id != null) {
    return scope.morphemeIds.has(String(row.morpheme_id));
  }
  if ('media_id' in row && row.media_id != null) return scope.mediaIds.has(String(row.media_id));
  return true;
}

function keepCustomValue(row: Row, scope: Scope): boolean {
  const id = String(row.target_id);
  const type = row.target_type;
  if (type === 'manuscript') return scope.wanted.has(id);
  if (type === 'layer') return scope.layerIds.has(id);
  if (type === 'unit') return scope.unitIds.has(id);
  if (type === 'note') return scope.noteIds.has(id);
  if (type === 'media') return scope.mediaIds.has(id);
  if (typeof type === 'string' && SHARED_FIELD_TARGETS.has(type)) return true;
  throw new Error('custom field target is unsupported');
}

function pack(
  tables: Record<string, Row[]>,
  manuscriptIds: readonly string[] | null,
  media: Map<string, Uint8Array> | null,
  attachments: Map<string, Uint8Array> | null,
): Uint8Array {
  const kind = media === null ? 'jyt' : 'jym';
  const manifest = {
    package: kind,
    formatVersion: DESKTOP_JYT_FORMAT_VERSION,
    payload: 'desktop-sqlite',
    userVersion: DESKTOP_PROJECT_USER_VERSION,
    media: media === null ? 'excluded' : 'included',
    manuscripts: manuscriptIds,
    created: new Date().toISOString(),
  };
  const payload = { payload: 'desktop-sqlite', userVersion: DESKTOP_PROJECT_USER_VERSION, tables };
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    [MIME_PATH]: [strToU8(kind === 'jyt' ? JYT_MIMETYPE : JYM_MIMETYPE), { level: 0 }],
    [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)),
    [DATA_PATH]: strToU8(JSON.stringify(payload)),
  };
  if (media !== null) {
    for (const [id, bytes] of media) entries[`${MEDIA_PREFIX}${id}`] = [bytes, { level: 0 }];
    for (const [digest, bytes] of attachments ?? []) {
      entries[`${ATTACHMENT_PREFIX}${digest}`] = [bytes, { level: 0 }];
    }
  }
  const zipped = zipSync(entries);
  if (zipped.byteLength > MAX_PACKAGE_BYTES) throw new Error('desktop package is too large');
  return zipped;
}

function readPackage(bytes: Uint8Array): {
  kind: 'jyt' | 'jym';
  tables: Record<string, Row[]>;
  media: Map<string, Uint8Array>;
  attachments: Map<string, Uint8Array>;
} {
  if (bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error('desktop package is unreadable');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('desktop package is unreadable');
  }
  let expanded = 0;
  for (const file of Object.values(files)) expanded += file.byteLength;
  if (expanded > MAX_PACKAGE_BYTES) throw new Error('desktop package is unreadable');
  const mimetype = files[MIME_PATH] ? strFromU8(files[MIME_PATH]).trim() : '';
  const kind = mimetype === JYT_MIMETYPE ? 'jyt' : mimetype === JYM_MIMETYPE ? 'jym' : null;
  if (kind === null || !files[MANIFEST_PATH] || !files[DATA_PATH]) {
    throw new Error('desktop package is unreadable');
  }
  const media = new Map<string, Uint8Array>();
  const attachments = new Map<string, Uint8Array>();
  for (const name of Object.keys(files)) {
    if (name === MIME_PATH || name === MANIFEST_PATH || name === DATA_PATH) continue;
    if (name.startsWith(MEDIA_PREFIX)) {
      const id = name.slice(MEDIA_PREFIX.length);
      if (kind !== 'jym' || !MEDIA_ID.test(id) || name !== `${MEDIA_PREFIX}${id}`) {
        throw new Error('desktop package is unreadable');
      }
      media.set(id, files[name]!);
      continue;
    }
    if (name.startsWith(ATTACHMENT_PREFIX)) {
      const digest = name.slice(ATTACHMENT_PREFIX.length);
      if (kind !== 'jym' || !SHA256_HEX.test(digest) || name !== `${ATTACHMENT_PREFIX}${digest}`) {
        throw new Error('desktop package is unreadable');
      }
      attachments.set(digest, files[name]!);
      continue;
    }
    throw new Error('desktop package is unreadable');
  }
  const manifest = parseJson(files[MANIFEST_PATH]);
  const data = parseJson(files[DATA_PATH]);
  if (
    !isRecord(manifest) ||
    manifest.package !== kind ||
    manifest.formatVersion !== DESKTOP_JYT_FORMAT_VERSION ||
    manifest.payload !== 'desktop-sqlite' ||
    manifest.media !== (kind === 'jyt' ? 'excluded' : 'included')
  ) {
    throw new Error('desktop package is unreadable');
  }
  if (
    manifest.userVersion !== DESKTOP_PROJECT_USER_VERSION ||
    !isRecord(data) ||
    data.payload !== 'desktop-sqlite' ||
    data.userVersion !== DESKTOP_PROJECT_USER_VERSION ||
    !isRecord(data.tables)
  ) {
    throw new Error('desktop package version is unsupported');
  }
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!IDENT.test(name) || !Array.isArray(rows) || rows.some((row) => !isRecord(row))) {
      throw new Error('desktop package is unreadable');
    }
    tables[name] = rows;
  }
  if (kind === 'jym') {
    checkMediaBytes(tables.media ?? [], media);
    checkAttachmentBytes(tables.attachment_files ?? [], attachments);
  }
  return { kind, tables, media, attachments };
}

function checkAttachmentBytes(rows: Row[], files: Map<string, Uint8Array>): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const digest = typeof row.sha256 === 'string' ? row.sha256 : '';
    const relpath = typeof row.relpath === 'string' ? row.relpath : '';
    if (!SHA256_HEX.test(digest) || relpath !== `${ATTACHMENT_PREFIX}${digest}`) {
      throw new Error('desktop package is unreadable');
    }
    const bytes = files.get(digest);
    if (bytes === undefined) throw new Error('attachment file is missing');
    if (sha256(bytes) !== digest) throw new Error('attachment hash does not match');
    seen.add(digest);
  }
  if (seen.size !== rows.length || seen.size !== files.size) {
    throw new Error('desktop package is unreadable');
  }
}

function checkMediaBytes(rows: Row[], media: Map<string, Uint8Array>): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const digest = typeof row.sha256 === 'string' ? row.sha256 : '';
    const bytes = media.get(id);
    if (!MEDIA_ID.test(id) || typeof row.relpath !== 'string') {
      throw new Error('desktop package is unreadable');
    }
    if (bytes === undefined) throw new Error('media file is missing');
    if (sha256(bytes) !== digest) throw new Error('media hash does not match');
    seen.add(id);
  }
  if (seen.size !== media.size) throw new Error('desktop package is unreadable');
}

function insertPayload(db: SqliteDatabase, tables: Record<string, Row[]>): void {
  const known = new Set(tableNames(db));
  for (const name of Object.keys(tables)) {
    if (!known.has(name)) throw new Error('desktop package table is unsupported');
  }
  const order = insertOrder(db, Object.keys(tables));
  const write = db.transaction(() => {
    db.exec('PRAGMA defer_foreign_keys = ON');
    const deferred: Array<{ table: string; row: Row }> = [];
    for (const name of order) {
      const cols = columnNames(db, name);
      for (const row of tables[name] ?? []) {
        if (
          Object.keys(row).length !== cols.length ||
          cols.some((col) => !Object.prototype.hasOwnProperty.call(row, col))
        ) {
          throw new Error('desktop package table shape is unsupported');
        }
        const storing = { ...row };
        if (name === 'manuscripts' || name === 'media') {
          deferred.push({ table: name, row });
          for (const col of DEFERRED_COLUMNS) storing[col] = null;
        }
        const sql = `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        db.prepare(sql).run(...cols.map((col) => storing[col]));
      }
    }
    const restore = db.prepare(
      `UPDATE manuscripts SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?`,
    );
    const restoreMedia = db.prepare(
      `UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?`,
    );
    for (const item of deferred) {
      const statement = item.table === 'manuscripts' ? restore : restoreMedia;
      // The package keeps the old shown-at. Import clears it, so that showing cannot authorize a purge.
      statement.run(item.row.deleted_at, item.row.retain_until, null, item.row.id);
    }
  });
  write();
}

function insertOrder(db: SqliteDatabase, names: string[]): string[] {
  const pending = new Map<string, Set<string>>();
  for (const name of names) {
    const deps = new Set<string>();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${name})`).all() as Array<{
      table: string;
    }>;
    for (const key of foreignKeys) {
      if (key.table !== name && names.includes(key.table)) deps.add(key.table);
    }
    pending.set(name, deps);
  }
  const ready = names.filter((name) => pending.get(name)?.size === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) break;
    ordered.push(next);
    for (const [name, deps] of pending) {
      if (deps.delete(next) && deps.size === 0) ready.push(name);
    }
  }
  if (ordered.length !== names.length) throw new Error('desktop package table order is cyclic');
  return ordered;
}

function tableNames(db: SqliteDatabase): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function columnNames(db: SqliteDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  );
}

function selectAll(db: SqliteDatabase, table: string): Row[] {
  const cols = columnNames(db, table);
  const rows = db.prepare(`SELECT * FROM ${table}`).all() as Row[];
  return rows.map((row) => {
    const ordered: Row = {};
    for (const col of cols) ordered[col] = row[col] ?? null;
    return ordered;
  });
}

function readMediaFiles(folder: string, rows: Row[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!MEDIA_ID.test(id) || typeof row.relpath !== 'string' || typeof row.sha256 !== 'string') {
      throw new Error('desktop package is unreadable');
    }
    const target = containedMediaPath(folder, row.relpath);
    const root = realpathSync(path.resolve(folder));
    let bytes: Uint8Array;
    try {
      const real = realpathSync(target);
      if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
        throw new Error('media path escapes the project folder');
      }
      if (!statSync(real).isFile()) throw new Error('media file is missing');
      bytes = readFileSync(real);
    } catch (error) {
      if (error instanceof Error && error.message === 'media path escapes the project folder')
        throw error;
      throw new Error('media file is missing');
    }
    if (sha256(bytes) !== row.sha256) throw new Error('media hash does not match');
    out.set(id, bytes);
  }
  return out;
}

function readAttachmentFiles(folder: string, rows: Row[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const row of rows) {
    const digest = typeof row.sha256 === 'string' ? row.sha256 : '';
    const relpath = typeof row.relpath === 'string' ? row.relpath : '';
    if (!SHA256_HEX.test(digest) || relpath !== `${ATTACHMENT_PREFIX}${digest}`) {
      throw new Error('desktop package is unreadable');
    }
    const target = containedMediaPath(folder, relpath);
    const root = realpathSync(path.resolve(folder));
    let bytes: Uint8Array;
    try {
      const real = realpathSync(target);
      if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
        throw new Error('attachment path escapes the project folder');
      }
      if (!statSync(real).isFile()) throw new Error('attachment file is missing');
      bytes = readFileSync(real);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'attachment path escapes the project folder'
      ) {
        throw error;
      }
      throw new Error('attachment file is missing');
    }
    if (sha256(bytes) !== digest) throw new Error('attachment hash does not match');
    out.set(digest, bytes);
  }
  return out;
}

function attachmentWrites(
  folder: string,
  rows: Row[],
  files: Map<string, Uint8Array>,
): Array<{ path: string; bytes: Uint8Array }> {
  return rows.map((row) => {
    const digest = typeof row.sha256 === 'string' ? row.sha256 : '';
    const bytes = files.get(digest);
    if (bytes === undefined || row.relpath !== `${ATTACHMENT_PREFIX}${digest}`) {
      throw new Error('attachment file is missing');
    }
    return { path: containedMediaPath(folder, String(row.relpath)), bytes };
  });
}

function mediaWrites(
  folder: string,
  rows: Row[],
  media: Map<string, Uint8Array>,
): Array<{ path: string; bytes: Uint8Array }> {
  return rows.map((row) => {
    const bytes = media.get(String(row.id));
    if (bytes === undefined) throw new Error('media file is missing');
    return { path: containedMediaPath(folder, String(row.relpath)), bytes };
  });
}

function containedMediaPath(folder: string, relpath: string): string {
  if (relpath.length === 0 || relpath.includes('\0') || path.isAbsolute(relpath)) {
    throw new Error('media path escapes the project folder');
  }
  const parts = relpath.split('\\').join('/').split('/');
  if (
    parts.some(
      (part) => part.length === 0 || part === '.' || part === '..' || part === '.jieyu.lock',
    ) ||
    parts[parts.length - 1] === 'project.sqlite'
  ) {
    throw new Error('media path escapes the project folder');
  }
  const root = path.resolve(folder);
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('media path escapes the project folder');
  }
  return target;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function idsWhere(rows: Row[] | undefined, keep: (row: Row) => boolean): Set<string> {
  return new Set((rows ?? []).filter(keep).map((row) => String(row.id)));
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes)) as unknown;
  } catch {
    throw new Error('desktop package is unreadable');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
