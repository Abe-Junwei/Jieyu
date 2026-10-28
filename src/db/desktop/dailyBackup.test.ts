import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureProjectBackupDir, projectBackupKey } from '../../desktop/skeleton/userDataLayout';
import { listDailyBackupDays, restoreDailyBackup, saveDailyProjectBackup } from './dailyBackup';
import { deleteManuscript, getManuscript, listManuscripts } from './manuscripts';
import { listDueDeletionReminders, purgeManuscript, showDeletionReminder } from './manuscriptPurge';
import { openProject } from './openProject';
import { importDesktopJym } from './projectExchange';
import { getUnit, listUnits } from './units';
import { sliceForRange } from '../../desktop/skeleton/mediaRange';

const roots: string[] = [];
const T = '2026-10-27T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-daily-backup-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('daily project backup', () => {
  it('keeps three daily audio packages and restores one into another folder', () => {
    const projectDir = folder();
    const backupDir = folder();
    writeFileSync(join(backupDir, 'upgrade.jym'), Buffer.from('keep'));
    const project = openProject(projectDir);
    const live = Buffer.from('live-wav');
    const gone = Buffer.from('gone-wav');
    writeFileSync(join(projectDir, 'live.wav'), live);
    writeFileSync(join(projectDir, 'gone.wav'), gone);
    const liveHash = createHash('sha256').update(live).digest('hex');
    const goneHash = createHash('sha256').update(gone).digest('hex');
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'live.wav', liveHash, 'live.wav', 1, T);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-gone', 'gone.wav', goneHash, 'gone.wav', 1, T);
    const manuscript = project.manuscripts.create({ title: { zh: '删' }, mediaId: 'media-gone' });
    deleteManuscript(project.db, manuscript.id);
    const before = readFileSync(join(projectDir, 'project.sqlite'));

    const days = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
    let latest = '';
    for (const day of days) {
      latest = saveDailyProjectBackup({
        db: project.db,
        folder: projectDir,
        backupDir,
        now: new Date(`${day}T12:00:00.000Z`),
      });
    }
    saveDailyProjectBackup({
      db: project.db,
      folder: projectDir,
      backupDir,
      now: new Date('2026-10-27T18:00:00.000Z'),
    });
    expect(latest.endsWith('/2026-10-27.jym')).toBe(true);
    expect(existsSync(latest)).toBe(true);
    expect(existsSync(join(backupDir, '2026-10-24.jym'))).toBe(false);
    expect(existsSync(join(backupDir, '2026-10-25.jym'))).toBe(true);
    expect(existsSync(join(backupDir, '2026-10-26.jym'))).toBe(true);
    expect(readFileSync(join(backupDir, 'upgrade.jym'))).toEqual(Buffer.from('keep'));
    expect(readFileSync(join(projectDir, 'project.sqlite'))).toEqual(before);

    const packed = unzipSync(readFileSync(latest));
    expect(Buffer.from(packed['media/media-gone']!)).toEqual(gone);
    const restoredDir = folder();
    importDesktopJym(restoredDir, readFileSync(latest));
    const restored = readFileSync(join(restoredDir, 'live.wav'));
    expect(createHash('sha256').update(restored).digest('hex')).toBe(liveHash);
    const slice = sliceForRange(restored.byteLength, 'bytes=0-3');
    expect(slice.status).toBe(206);
    expect(restored.subarray(slice.start, slice.end + 1)).toEqual(live.subarray(0, 4));
    expect(strFromU8(packed['data/project.json']!)).toContain(manuscript.id);
    project.close();
  });

  it('refuses a backup directory inside the project and leaves no package when audio is missing', () => {
    const projectDir = folder();
    const project = openProject(projectDir);
    const inside = join(projectDir, 'backups');
    expect(() =>
      saveDailyProjectBackup({
        db: project.db,
        folder: projectDir,
        backupDir: inside,
        now: new Date('2026-10-27T00:00:00.000Z'),
      }),
    ).toThrow('backup directory is inside the project');
    expect(existsSync(inside)).toBe(false);

    const backupDir = folder();
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'missing.wav', 'aa', 'missing.wav', 1, T);
    const before = readFileSync(join(projectDir, 'project.sqlite'));
    expect(() =>
      saveDailyProjectBackup({
        db: project.db,
        folder: projectDir,
        backupDir,
        now: new Date('2026-10-27T00:00:00.000Z'),
      }),
    ).toThrow('media file is missing');
    expect(existsSync(join(backupDir, '2026-10-27.jym'))).toBe(false);
    expect(readFileSync(join(projectDir, 'project.sqlite'))).toEqual(before);
    project.close();
  });

  it('restores an expired backup without letting the old reminder authorize a purge', () => {
    const projectDir = folder();
    const backupDir = folder();
    const project = openProject(projectDir);
    const audio = Buffer.from('expired-wav');
    writeFileSync(join(projectDir, 'gone.wav'), audio);
    const digest = createHash('sha256').update(audio).digest('hex');
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-gone', 'gone.wav', digest, 'gone.wav', 1, T);
    const manuscript = project.manuscripts.create({ title: { zh: '过期' }, mediaId: 'media-gone' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = project.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'kept sentence',
    });
    deleteManuscript(project.db, manuscript.id);
    const shownAt = '2020-01-01T00:00:00.000Z';
    const retainUntil = '2020-01-02T00:00:00.000Z';
    project.db
      .prepare('UPDATE manuscripts SET reminder_shown_at = ?, retain_until = ? WHERE id = ?')
      .run(shownAt, retainUntil, manuscript.id);
    project.db
      .prepare(
        'UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?',
      )
      .run(shownAt, retainUntil, shownAt, 'media-gone');
    const saved = saveDailyProjectBackup({
      db: project.db,
      folder: projectDir,
      backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    const packed = readFileSync(saved);
    expect(strFromU8(unzipSync(packed)['data/project.json']!)).toContain(shownAt);
    expect(getManuscript(project.db, manuscript.id)?.reminderShownAt).toBe(shownAt);

    const restoredDir = folder();
    restoreDailyBackup({ backupDir, day: '2026-10-27', destination: restoredDir });
    const restored = openProject(restoredDir);
    const copy = getManuscript(restored.db, manuscript.id);
    expect(copy?.deletedAt).not.toBeNull();
    expect(copy?.reminderShownAt).toBeNull();
    expect(copy?.retainUntil).toBe(retainUntil);
    const media = restored.db
      .prepare(
        'SELECT deleted_at AS deletedAt, retain_until AS retainUntil, reminder_shown_at AS reminderShownAt FROM media WHERE id = ?',
      )
      .get('media-gone') as {
      deletedAt: string | null;
      retainUntil: string | null;
      reminderShownAt: string | null;
    };
    expect(media).toEqual({ deletedAt: shownAt, retainUntil, reminderShownAt: null });
    expect(getUnit(restored.db, unit.id)?.text).toBe('kept sentence');
    expect(
      createHash('sha256')
        .update(readFileSync(join(restoredDir, 'gone.wav')))
        .digest('hex'),
    ).toBe(digest);
    expect(
      listDueDeletionReminders(restored.db)
        .map((row) => row.id)
        .sort(),
    ).toEqual([manuscript.id, 'media-gone'].sort());
    expect(() => purgeManuscript(restored.db, manuscript.id)).toThrow(
      'reminder has not been shown',
    );
    showDeletionReminder(restored.db, 'manuscript', manuscript.id);
    expect(() => purgeManuscript(restored.db, manuscript.id)).toThrow(
      'manuscript is inside its retention window',
    );
    expect(getUnit(restored.db, unit.id)?.text).toBe('kept sentence');
    restored.close();

    purgeManuscript(project.db, manuscript.id);
    expect(getManuscript(project.db, manuscript.id)).toBeNull();
    expect(existsSync(saved)).toBe(true);
    expect(strFromU8(unzipSync(readFileSync(saved))['data/project.json']!)).toContain(shownAt);
    expect(Buffer.from(unzipSync(readFileSync(saved))['media/media-gone']!)).toEqual(audio);
    project.close();
  });

  it('restores two manuscripts and two playable recordings without changing the source', () => {
    const projectDir = folder();
    const backupDir = folder();
    const project = openProject(projectDir);
    const firstSamples = [100, -100, 200];
    const secondSamples = [300, -300, 50];
    const firstWav = pcmWav(firstSamples);
    const secondWav = pcmWav(secondSamples);
    writeFileSync(join(projectDir, 'one.wav'), firstWav);
    writeFileSync(join(projectDir, 'two.wav'), secondWav);
    insertMedia(project.db, 'media-one', 'one.wav', firstWav);
    insertMedia(project.db, 'media-two', 'two.wav', secondWav);
    const first = writeSentence(project, 'media-one', '第一句');
    const second = writeSentence(project, 'media-two', '第二句');
    const source = readFileSync(join(projectDir, 'project.sqlite'));
    const saved = saveDailyProjectBackup({
      db: project.db,
      folder: projectDir,
      backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    const packed = readFileSync(saved);
    const restoredDir = folder();
    importDesktopJym(restoredDir, packed);
    const restored = openProject(restoredDir);
    const rows = listManuscripts(restored.db);
    expect(rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect(sentence(restored.db, first.id)).toBe('第一句');
    expect(sentence(restored.db, second.id)).toBe('第二句');
    expect(playableSamples(restoredDir, restored.db, 'media-one')).toEqual(firstSamples);
    expect(playableSamples(restoredDir, restored.db, 'media-two')).toEqual(secondSamples);
    restored.close();
    expect(() => importDesktopJym(projectDir, packed)).toThrow('import destination is not empty');
    expect(readFileSync(join(projectDir, 'project.sqlite'))).toEqual(source);
    project.close();
  });

  it('restores attachment bytes from the daily backup after the project copy is gone', () => {
    const projectDir = folder();
    const backupDir = folder();
    const project = openProject(projectDir);
    const body = Buffer.from('attachment-bytes');
    const digest = createHash('sha256').update(body).digest('hex');
    const relpath = `attachments/objects/${digest}`;
    mkdirSync(join(projectDir, 'attachments', 'objects'), { recursive: true });
    writeFileSync(join(projectDir, relpath), body);
    project.db
      .prepare(
        `INSERT INTO attachment_files
           (id, sha256, relpath, byte_size, kind, mime_type, state, created_at)
         VALUES (?, ?, ?, ?, 'document', 'text/plain', 'ready', ?)`,
      )
      .run('file-1', digest, relpath, body.length, T);
    const saved = saveDailyProjectBackup({
      db: project.db,
      folder: projectDir,
      backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    rmSync(join(projectDir, relpath));
    project.db.prepare('DELETE FROM attachment_files WHERE id = ?').run('file-1');
    expect(existsSync(join(projectDir, relpath))).toBe(false);
    expect(Buffer.from(unzipSync(readFileSync(saved))[relpath]!)).toEqual(body);

    const restoredDir = folder();
    importDesktopJym(restoredDir, readFileSync(saved));
    expect(readFileSync(join(restoredDir, relpath))).toEqual(body);
    const restored = openProject(restoredDir);
    expect(
      restored.db.prepare('SELECT sha256, state FROM attachment_files WHERE id = ?').get('file-1'),
    ).toEqual({ sha256: digest, state: 'ready' });
    restored.close();
    project.close();
  });

  it('lists the three newest dated snapshots and restores one without opening it', () => {
    expect(listDailyBackupDays(join(folder(), 'missing'))).toEqual([]);
    const projectDir = folder();
    const backupDir = folder();
    const project = openProject(projectDir);
    const body = Buffer.from('listed-wav');
    writeFileSync(join(projectDir, 'listed.wav'), body);
    insertMedia(project.db, 'media-listed', 'listed.wav', body);
    writeSentence(project, 'media-listed', '列出');
    saveDailyProjectBackup({
      db: project.db,
      folder: projectDir,
      backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    writeFileSync(join(backupDir, 'upgrade.jym'), Buffer.from('keep'));
    writeFileSync(join(backupDir, '2026-10-24.jym'), Buffer.from('old'));
    writeFileSync(join(backupDir, '2026-10-25.jym'), Buffer.from('mid'));
    writeFileSync(join(backupDir, '2026-10-26.jym'), Buffer.from('newer'));
    expect(listDailyBackupDays(backupDir)).toEqual(['2026-10-27', '2026-10-26', '2026-10-25']);
    const source = readFileSync(join(projectDir, 'project.sqlite'));
    const destination = folder();
    restoreDailyBackup({ backupDir, day: '2026-10-27', destination });
    expect(readFileSync(join(destination, 'listed.wav'))).toEqual(body);
    expect(() =>
      restoreDailyBackup({ backupDir, day: '2026-10-27', destination: projectDir }),
    ).toThrow('import destination is not empty');
    expect(readFileSync(join(projectDir, 'project.sqlite'))).toEqual(source);
    expect(readFileSync(join(backupDir, '2026-10-27.jym')).byteLength).toBeGreaterThan(0);
    project.close();
  });

  it('restores two same-basename projects from separate backup dirs (#404)', () => {
    const userData = folder();
    const leftParent = folder();
    const rightParent = folder();
    const left = join(leftParent, 'shared-name');
    const right = join(rightParent, 'shared-name');
    mkdirSync(left);
    mkdirSync(right);
    const leftBackup = ensureProjectBackupDir(userData, projectBackupKey(left));
    const rightBackup = ensureProjectBackupDir(userData, projectBackupKey(right));
    expect(leftBackup).not.toBe(rightBackup);

    const leftProject = openProject(left);
    const rightProject = openProject(right);
    writeFileSync(join(left, 'a.wav'), Buffer.from('left-audio'));
    writeFileSync(join(right, 'a.wav'), Buffer.from('right-audio'));
    const leftHash = createHash('sha256').update(Buffer.from('left-audio')).digest('hex');
    const rightHash = createHash('sha256').update(Buffer.from('right-audio')).digest('hex');
    leftProject.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-a', 'a.wav', leftHash, 'a.wav', 1, T);
    rightProject.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-a', 'a.wav', rightHash, 'a.wav', 1, T);

    const leftSaved = saveDailyProjectBackup({
      db: leftProject.db,
      folder: left,
      backupDir: leftBackup,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    const rightSaved = saveDailyProjectBackup({
      db: rightProject.db,
      folder: right,
      backupDir: rightBackup,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(leftSaved).not.toBe(rightSaved);
    expect(readFileSync(leftSaved)).not.toEqual(readFileSync(rightSaved));

    const leftRestored = folder();
    const rightRestored = folder();
    importDesktopJym(leftRestored, readFileSync(leftSaved));
    importDesktopJym(rightRestored, readFileSync(rightSaved));
    expect(
      createHash('sha256')
        .update(readFileSync(join(leftRestored, 'a.wav')))
        .digest('hex'),
    ).toBe(leftHash);
    expect(
      createHash('sha256')
        .update(readFileSync(join(rightRestored, 'a.wav')))
        .digest('hex'),
    ).toBe(rightHash);
    leftProject.close();
    rightProject.close();
  });
});

function pcmWav(samples: readonly number[]): Buffer {
  const dataBytes = samples.length * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => bytes.writeInt16LE(sample, 44 + index * 2));
  return bytes;
}

function insertMedia(
  db: ReturnType<typeof openProject>['db'],
  id: string,
  filename: string,
  body: Buffer,
): void {
  const sha256 = createHash('sha256').update(body).digest('hex');
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, filename, sha256, filename, 1, T);
}

function writeSentence(
  project: ReturnType<typeof openProject>,
  mediaId: string,
  text: string,
): { id: string } {
  const manuscript = project.manuscripts.create({ title: { zh: text }, mediaId });
  const layer = project.layers.create({
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  });
  project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text });
  return manuscript;
}

function sentence(db: ReturnType<typeof openProject>['db'], manuscriptId: string): string {
  const layer = db.prepare('SELECT id FROM layers WHERE manuscript_id = ?').get(manuscriptId) as {
    id: string;
  };
  return listUnits(db, layer.id)
    .map((unit) => unit.text)
    .join('');
}

function playableSamples(
  folderPath: string,
  db: ReturnType<typeof openProject>['db'],
  mediaId: string,
): number[] {
  const media = db.prepare('SELECT relpath, sha256 FROM media WHERE id = ?').get(mediaId) as {
    relpath: string;
    sha256: string;
  };
  const bytes = readFileSync(join(folderPath, media.relpath));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(media.sha256);
  const slice = sliceForRange(bytes.byteLength, 'bytes=0-3');
  expect(slice.status).toBe(206);
  expect(Buffer.from(bytes.subarray(slice.start, slice.end + 1))).toEqual(bytes.subarray(0, 4));
  if (process.platform === 'darwin') {
    const info = spawnSync('afinfo', [join(folderPath, media.relpath)], { encoding: 'utf8' });
    expect(info.status).toBe(0);
    expect(info.stdout).toContain('8000 Hz');
  }
  return readPcm(bytes);
}

function readPcm(bytes: Buffer): number[] {
  const dataBytes = bytes.readUInt32LE(40);
  const samples: number[] = [];
  for (let index = 0; index < dataBytes; index += 2) {
    samples.push(bytes.readInt16LE(44 + index));
  }
  return samples;
}
