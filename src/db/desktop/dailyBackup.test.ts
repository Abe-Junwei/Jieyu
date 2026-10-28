import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDailyProjectBackup } from './dailyBackup';
import { deleteManuscript, getManuscript } from './manuscripts';
import { purgeManuscript } from './manuscriptPurge';
import { openProject } from './openProject';
import { importDesktopJym } from './projectExchange';
import { getUnit } from './units';
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
    importDesktopJym(restoredDir, packed);
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
    expect(() => purgeManuscript(restored.db, manuscript.id)).toThrow(
      'reminder has not been shown',
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
});
