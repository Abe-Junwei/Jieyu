import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deleteManuscript,
  getManuscript,
  listDeletedManuscripts,
  listManuscripts,
} from './manuscripts';
import { purgeManuscript } from './manuscriptPurge';
import { openProject } from './openProject';
import {
  DESKTOP_JYT_FORMAT_VERSION,
  exportDesktopJyt,
  exportDesktopJym,
  exportDesktopManuscriptJyt,
  importDesktopJyt,
  importDesktopJym,
} from './projectExchange';
import { getUnit, readStoredUnit } from './units';
import { assertZipBounded } from './zipBounds';

const roots: string[] = [];
const T = '2026-10-27T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-exchange-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function projectBytes(dir: string): Buffer {
  return readFileSync(join(dir, 'project.sqlite'));
}

/** Byte compare without Vitest's per-byte diff. A full project.sqlite diff costs ~1s and blew the 5s default under the quality job. */
function expectSameBytes(actual: Buffer, expected: Buffer): void {
  expect([actual.length, actual.equals(expected)]).toEqual([expected.length, true]);
}

function wav(dir: string, name: string, body: string): { relpath: string; sha256: string } {
  const bytes = Buffer.from(body);
  writeFileSync(join(dir, name), bytes);
  return { relpath: name, sha256: createHash('sha256').update(bytes).digest('hex') };
}

describe('desktop JYT exchange', () => {
  it('round-trips ids and text, and keeps a deleted manuscript in the full package', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-1', 'a.wav', 'aa', 'a.wav', 3, T);
    const selected = source.manuscripts.create({ title: { zh: '选中' }, mediaId: 'media-1' });
    const other = source.manuscripts.create({ title: { zh: '另一份' }, mediaId: 'media-1' });
    const removed = source.manuscripts.create({ title: { zh: '已删除' }, mediaId: 'media-1' });
    const selectedLayer = source.layers.create({
      manuscriptId: selected.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const otherLayer = source.layers.create({
      manuscriptId: other.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const removedLayer = source.layers.create({
      manuscriptId: removed.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const selectedUnit = source.units.create({
      layerId: selectedLayer.id,
      startTime: 0,
      endTime: 1,
      text: 'selected sentence',
    });
    const otherUnit = source.units.create({
      layerId: otherLayer.id,
      startTime: 0,
      endTime: 1,
      text: 'other sentence',
    });
    const removedUnit = source.units.create({
      layerId: removedLayer.id,
      startTime: 0,
      endTime: 1,
      text: 'deleted sentence',
    });
    const removedManuscript = deleteManuscript(source.db, removed.id);
    const packed = exportDesktopJyt(source.db);
    const files = unzipSync(packed);
    expect(Object.keys(files).sort()).toEqual([
      'META-INF/manifest.json',
      'data/project.json',
      'mimetype',
    ]);
    expect(strFromU8(files.mimetype!).trim()).toBe('application/vnd.jieyu.jyt');
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as {
      formatVersion: number;
      media: string;
    };
    expect(manifest.formatVersion).toBe(DESKTOP_JYT_FORMAT_VERSION);
    expect(manifest.media).toBe('excluded');
    expect(strFromU8(files['data/project.json']!)).toContain('deleted sentence');
    const before = projectBytes(sourceDir);
    source.close();

    const destDir = folder();
    importDesktopJyt(destDir, packed);
    expectSameBytes(projectBytes(sourceDir), before);
    const dest = openProject(destDir);
    expect(
      listManuscripts(dest.db)
        .map((row) => row.id)
        .sort(),
    ).toEqual([selected.id, other.id].sort());
    expect(listDeletedManuscripts(dest.db)).toEqual([removedManuscript]);
    expect(getManuscript(dest.db, selected.id)).toEqual(selected);
    expect(getUnit(dest.db, selectedUnit.id)).toEqual(selectedUnit);
    expect(getUnit(dest.db, otherUnit.id)).toEqual(otherUnit);
    expect(readStoredUnit(dest.db, removedUnit.id)).toEqual(removedUnit);
    dest.close();
  });

  it('exports only the selected live manuscript', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-1', 'a.wav', 'aa', 'a.wav', 3, T);
    const selected = source.manuscripts.create({ title: { zh: '选中' }, mediaId: 'media-1' });
    const other = source.manuscripts.create({ title: { zh: '另一份' }, mediaId: 'media-1' });
    const removed = source.manuscripts.create({ title: { zh: '已删除' }, mediaId: 'media-1' });
    for (const manuscript of [selected, other, removed]) {
      const layer = source.layers.create({
        manuscriptId: manuscript.id,
        key: 'tx',
        name: { zh: '转写' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      });
      source.units.create({
        layerId: layer.id,
        startTime: 0,
        endTime: 1,
        text: `${manuscript.id} sentence`,
      });
    }
    deleteManuscript(source.db, removed.id);
    const packed = exportDesktopManuscriptJyt(source.db, [selected.id]);
    const data = JSON.parse(strFromU8(unzipSync(packed)['data/project.json']!)) as {
      tables: { manuscripts: Array<{ id: string }> };
    };
    const json = JSON.stringify(data);
    expect(data.tables.manuscripts.map((row) => row.id)).toEqual([selected.id]);
    expect(json).toContain(`${selected.id} sentence`);
    expect(json).not.toContain(`${other.id} sentence`);
    expect(json).not.toContain(`${removed.id} sentence`);
    expect(json).not.toContain(other.id);
    expect(json).not.toContain(removed.id);
    expect(() => exportDesktopManuscriptJyt(source.db, [])).toThrow(
      'manuscript export needs a selection',
    );
    expect(() => exportDesktopManuscriptJyt(source.db, [removed.id])).toThrow(
      'manuscript is deleted',
    );
    expect(() => exportDesktopManuscriptJyt(source.db, ['missing'])).toThrow(
      'manuscript is missing',
    );
    source.close();

    const destDir = folder();
    importDesktopJyt(destDir, packed);
    const dest = openProject(destDir);
    expect(listManuscripts(dest.db).map((row) => row.id)).toEqual([selected.id]);
    expect(listDeletedManuscripts(dest.db)).toEqual([]);
    dest.close();
  });

  it('leaves the source and an existing destination unchanged when import fails', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = source.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'media-1' });
    const layer = source.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    source.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'sentence' });
    const packed = exportDesktopJyt(source.db);
    source.close();
    const before = projectBytes(sourceDir);

    const emptyDest = folder();
    expect(() => importDesktopJyt(emptyDest, new Uint8Array([1, 2, 3]))).toThrow(
      'desktop package is unreadable',
    );
    expectSameBytes(projectBytes(sourceDir), before);
    expect(() => projectBytes(emptyDest)).toThrow();

    const occupied = folder();
    const existing = openProject(occupied);
    existing.close();
    const occupiedBytes = projectBytes(occupied);
    expect(() => importDesktopJyt(occupied, packed)).toThrow('import destination is not empty');
    expectSameBytes(projectBytes(occupied), occupiedBytes);
    expectSameBytes(projectBytes(sourceDir), before);

    const files = unzipSync(packed);
    const data = JSON.parse(strFromU8(files['data/project.json']!)) as {
      userVersion: number;
      tables: { layers: unknown[] };
    };
    data.userVersion = 1;
    files['data/project.json'] = strToU8(JSON.stringify(data));
    const stale = zipSync(files);
    const staleDest = folder();
    expect(() => importDesktopJyt(staleDest, stale)).toThrow(
      'desktop package version is unsupported',
    );
    expect(() => projectBytes(staleDest)).toThrow();
    expectSameBytes(projectBytes(sourceDir), before);

    const broken = unzipSync(packed);
    const body = JSON.parse(strFromU8(broken['data/project.json']!)) as {
      tables: { layers: unknown[] };
    };
    body.tables.layers = [];
    broken['data/project.json'] = strToU8(JSON.stringify(body));
    const brokenDest = folder();
    expect(() => importDesktopJyt(brokenDest, zipSync(broken))).toThrow();
    expect(() => projectBytes(brokenDest)).toThrow();
    expectSameBytes(projectBytes(sourceDir), before);
  });

  it('packs recording bytes in a JYM and refuses a bad hash or a path outside the folder', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    const liveAudio = wav(sourceDir, 'live.wav', 'live-bytes');
    const goneAudio = wav(sourceDir, 'gone.wav', 'gone-bytes');
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', liveAudio.relpath, liveAudio.sha256, 'live.wav', 3, T);
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-gone', goneAudio.relpath, goneAudio.sha256, 'gone.wav', 3, T);
    const live = source.manuscripts.create({ title: { zh: '活' }, mediaId: 'media-live' });
    const gone = source.manuscripts.create({ title: { zh: '删' }, mediaId: 'media-gone' });
    const removed = deleteManuscript(source.db, gone.id);
    const packed = exportDesktopJym(source.db, sourceDir);
    const files = unzipSync(packed);
    expect(strFromU8(files.mimetype!).trim()).toBe('application/vnd.jieyu.jym');
    expect(Buffer.from(files['media/media-live']!)).toEqual(Buffer.from('live-bytes'));
    expect(Buffer.from(files['media/media-gone']!)).toEqual(Buffer.from('gone-bytes'));
    source.close();
    const before = projectBytes(sourceDir);

    const destDir = folder();
    importDesktopJym(destDir, packed);
    expect(readFileSync(join(destDir, 'live.wav'))).toEqual(Buffer.from('live-bytes'));
    expect(readFileSync(join(destDir, 'gone.wav'))).toEqual(Buffer.from('gone-bytes'));
    const dest = openProject(destDir);
    expect(getManuscript(dest.db, live.id)?.deletedAt).toBeNull();
    expect(listDeletedManuscripts(dest.db)).toEqual([removed]);
    dest.close();
    expectSameBytes(projectBytes(sourceDir), before);

    const emptyDest = folder();
    expect(() => importDesktopJyt(emptyDest, packed)).toThrow('desktop package is unreadable');
    expect(() => projectBytes(emptyDest)).toThrow();

    const tampered = unzipSync(packed);
    const goneBytes = tampered['media/media-gone']!;
    goneBytes[0] = goneBytes[0] === 0 ? 1 : 0;
    const badDest = folder();
    expect(() => importDesktopJym(badDest, zipSync(tampered))).toThrow('media hash does not match');
    expect(() => projectBytes(badDest)).toThrow();
    expect(existsSync(join(badDest, 'live.wav'))).toBe(false);
    expect(existsSync(join(badDest, 'gone.wav'))).toBe(false);
    expectSameBytes(projectBytes(sourceDir), before);

    const escaped = unzipSync(packed);
    const body = JSON.parse(strFromU8(escaped['data/project.json']!)) as {
      tables: { media: Array<{ id: string; relpath: string }> };
    };
    const goneRow = body.tables.media.find((row) => row.id === 'media-gone');
    if (!goneRow) throw new Error('missing media row');
    goneRow.relpath = '../escaped.wav';
    escaped['data/project.json'] = strToU8(JSON.stringify(body));
    const root = folder();
    const nested = join(root, 'dest');
    mkdirSync(nested);
    expect(() => importDesktopJym(nested, zipSync(escaped))).toThrow(
      'media path escapes the project folder',
    );
    expect(existsSync(join(root, 'escaped.wav'))).toBe(false);
    expect(() => projectBytes(nested)).toThrow();
    expectSameBytes(projectBytes(sourceDir), before);

    const missingDir = folder();
    const missing = openProject(missingDir);
    missing.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'absent.wav', liveAudio.sha256, 'absent.wav', 3, T);
    expect(() => exportDesktopJym(missing.db, missingDir)).toThrow('media file is missing');
    missing.close();
  });

  it('packs attachment bytes in a JYM and leaves them out of a JYT', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    const body = Buffer.from('attachment-bytes');
    const digest = createHash('sha256').update(body).digest('hex');
    const relpath = `attachments/objects/${digest}`;
    mkdirSync(join(sourceDir, 'attachments', 'objects'), { recursive: true });
    writeFileSync(join(sourceDir, relpath), body);
    source.db
      .prepare(
        `INSERT INTO attachment_files
           (id, sha256, relpath, byte_size, kind, mime_type, state, created_at)
         VALUES (?, ?, ?, ?, 'document', 'text/plain', 'ready', ?)`,
      )
      .run('file-1', digest, relpath, body.length, T);
    const jym = exportDesktopJym(source.db, sourceDir);
    const jyt = exportDesktopJyt(source.db);
    expect(Buffer.from(unzipSync(jym)[relpath]!)).toEqual(body);
    expect(unzipSync(jyt)[relpath]).toBeUndefined();
    source.close();
    const before = projectBytes(sourceDir);

    const jytDest = folder();
    importDesktopJyt(jytDest, jyt);
    expect(existsSync(join(jytDest, relpath))).toBe(false);
    const jytProject = openProject(jytDest);
    expect(
      jytProject.db.prepare('SELECT sha256 FROM attachment_files WHERE id = ?').get('file-1'),
    ).toEqual({ sha256: digest });
    jytProject.close();

    const destDir = folder();
    importDesktopJym(destDir, jym);
    expect(readFileSync(join(destDir, relpath))).toEqual(body);
    const dest = openProject(destDir);
    expect(
      dest.db.prepare('SELECT sha256, state FROM attachment_files WHERE id = ?').get('file-1'),
    ).toEqual({ sha256: digest, state: 'ready' });
    dest.close();
    expectSameBytes(projectBytes(sourceDir), before);

    const tampered = unzipSync(jym);
    const packedBytes = tampered[relpath]!;
    packedBytes[0] = packedBytes[0] === 0 ? 1 : 0;
    const badDest = folder();
    expect(() => importDesktopJym(badDest, zipSync(tampered))).toThrow(
      'attachment hash does not match',
    );
    expect(() => projectBytes(badDest)).toThrow();
    expect(existsSync(join(badDest, 'attachments', 'objects', digest))).toBe(false);
    expectSameBytes(projectBytes(sourceDir), before);

    const missingDir = folder();
    const missing = openProject(missingDir);
    missing.db
      .prepare(
        `INSERT INTO attachment_files
           (id, sha256, relpath, byte_size, kind, mime_type, state, created_at)
         VALUES (?, ?, ?, ?, 'document', 'text/plain', 'ready', ?)`,
      )
      .run('file-1', digest, relpath, body.length, T);
    expect(() => exportDesktopJym(missing.db, missingDir)).toThrow('attachment file is missing');
    missing.close();
    expectSameBytes(projectBytes(sourceDir), before);
  });

  it('clears an expired reminder on import and still keeps the manuscript deleted', () => {
    const sourceDir = folder();
    const source = openProject(sourceDir);
    source.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = source.manuscripts.create({ title: { zh: '过期' }, mediaId: 'media-1' });
    const layer = source.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = source.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'kept sentence',
    });
    deleteManuscript(source.db, manuscript.id);
    const shownAt = '2020-01-01T00:00:00.000Z';
    const retainUntil = '2020-01-02T00:00:00.000Z';
    source.db
      .prepare('UPDATE manuscripts SET reminder_shown_at = ?, retain_until = ? WHERE id = ?')
      .run(shownAt, retainUntil, manuscript.id);
    source.db
      .prepare(
        'UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?',
      )
      .run(shownAt, retainUntil, shownAt, 'media-1');
    const packed = exportDesktopJyt(source.db);
    expect(strFromU8(unzipSync(packed)['data/project.json']!)).toContain(shownAt);
    source.close();

    const destDir = folder();
    importDesktopJyt(destDir, packed);
    const dest = openProject(destDir);
    const restored = getManuscript(dest.db, manuscript.id);
    expect(restored?.deletedAt).not.toBeNull();
    expect(restored?.reminderShownAt).toBeNull();
    expect(restored?.retainUntil).toBe(retainUntil);
    const media = dest.db
      .prepare(
        'SELECT deleted_at AS deletedAt, retain_until AS retainUntil, reminder_shown_at AS reminderShownAt FROM media WHERE id = ?',
      )
      .get('media-1') as {
      deletedAt: string | null;
      retainUntil: string | null;
      reminderShownAt: string | null;
    };
    expect(media.deletedAt).toBe(shownAt);
    expect(media.retainUntil).toBe(retainUntil);
    expect(media.reminderShownAt).toBeNull();
    expect(readStoredUnit(dest.db, unit.id)?.text).toBe('kept sentence');
    expect(() => purgeManuscript(dest.db, manuscript.id)).toThrow('reminder has not been shown');
    expect(readStoredUnit(dest.db, unit.id)?.text).toBe('kept sentence');
    dest.close();
  });

  it('refuses a nonempty restore destination that has no project database', () => {
    const root = folder();
    const source = join(root, 'source');
    mkdirSync(source);
    const project = openProject(source);
    const bytes = exportDesktopJyt(project.db);
    project.close();
    const dest = join(root, 'dest');
    mkdirSync(dest);
    writeFileSync(join(dest, 'existing.txt'), 'keep');
    expect(() => importDesktopJyt(dest, bytes)).toThrow('import destination is not empty');
    expect(readFileSync(join(dest, 'existing.txt'), 'utf8')).toBe('keep');
  });

  it('rejects a second transcription row for the same unit in a JYT', () => {
    const source = folder();
    const dest = folder();
    const project = openProject(source);
    project.db
      .prepare(
        'INSERT INTO media(id,relpath,sha256,filename,duration,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('m', 'a.wav', 'a', 'a.wav', 1, T);
    const manuscript = project.manuscripts.create({ title: { und: 'm' }, mediaId: 'm' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { und: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'first' });
    const files = unzipSync(exportDesktopJyt(project.db));
    project.close();
    const payload = JSON.parse(strFromU8(files['data/project.json']!)) as {
      tables: { unit_texts: Record<string, unknown>[] };
    };
    const first = payload.tables.unit_texts[0];
    if (first === undefined) throw new Error('unit text missing');
    payload.tables.unit_texts.push({ ...first, id: 'duplicate-role', body: 'second' });
    files['data/project.json'] = strToU8(JSON.stringify(payload));
    expect(() => importDesktopJyt(dest, zipSync(files))).toThrow('unit text role is duplicated');
  });

  it('rejects a zip whose central size bypasses the local-header bound', () => {
    const bytes = zipSync({ huge: new Uint8Array(64 * 1024 * 1024 + 1) });
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(22, 0, true);
    expect(unzipSync(bytes).huge!.length).toBeGreaterThan(64 * 1024 * 1024);
    expect(() => assertZipBounded(bytes)).toThrow('desktop package is unreadable');
  });
});
