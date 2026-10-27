import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const PAST = '2020-01-01T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-manuscript-purge-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('manuscript reminder and purge', () => {
  it('keeps the first reminder time and refuses to purge early', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.showReminder', {
        id: seeded.manuscriptId,
      }),
    ).toThrow('manuscript is active');
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is active');

    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    callDesktopSession(session.sessionId, 'media.delete', { id: seeded.mediaId });
    const mediaReminder = callDesktopSession(session.sessionId, 'media.showReminder', {
      id: seeded.mediaId,
    }) as { reminderShownAt: string };
    expect(
      (
        callDesktopSession(session.sessionId, 'media.showReminder', {
          id: seeded.mediaId,
        }) as { reminderShownAt: string }
      ).reminderShownAt,
    ).toBe(mediaReminder.reminderShownAt);
    backdate(session.sessionId, seeded.manuscriptId, PAST, null);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('reminder has not been shown');
    expect(count(session.sessionId, 'manuscripts')).toBe(1);

    const shown = callDesktopSession(session.sessionId, 'manuscripts.showReminder', {
      id: seeded.manuscriptId,
    }) as { reminderShownAt: string };
    const again = callDesktopSession(session.sessionId, 'manuscripts.showReminder', {
      id: seeded.manuscriptId,
    }) as { reminderShownAt: string };
    expect(again.reminderShownAt).toBe(shown.reminderShownAt);
    backdate(session.sessionId, seeded.manuscriptId, PAST, shown.reminderShownAt);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is inside its retention window');
    expect(count(session.sessionId, 'layers')).toBe(1);
  });

  it('purges one expired manuscript and leaves the shared recording', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const child = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: seeded.manuscriptId,
      key: 'gloss',
      name: { zh: '注释' },
      tierType: 'symbolic-association',
      contentType: 'gloss',
      parentId: seeded.layerId,
    }) as { id: string };
    requireDesktopSession(session.sessionId)
      .db.prepare('INSERT INTO speakers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('sp', '甲', PAST, PAST);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
      speakerId: 'sp',
    }) as { id: string };
    const words = callDesktopSession(session.sessionId, 'analysis.segmentWords', {
      unitId: unit.id,
    }) as { id: string }[];
    const word = words[0];
    if (word === undefined) throw new Error('word missing');
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'lex1',
      entry: { headword: 'keep', senses: [{ id: 's1', definitions: [{ text: 's1' }] }] },
    });
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: word.id,
      lexemeId: 'lex1',
      senseId: 's1',
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'own-note',
      anchor: { kind: 'unit', unitId: unit.id },
      content: { zh: '这条' },
    });
    const other = seed(session.sessionId, '另一份', seeded.mediaId);
    const otherUnit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: other.layerId,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'other-note',
      anchor: { kind: 'unit', unitId: otherUnit.id },
      content: { zh: '留下' },
    });

    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    backdate(session.sessionId, seeded.manuscriptId, PAST, PAST);

    expect(
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toEqual({ id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is missing');

    callDesktopSession(session.sessionId, 'reopen', {});
    expect(count(session.sessionId, 'manuscripts')).toBe(1);
    expect(count(session.sessionId, 'layers')).toBe(1);
    expect(count(session.sessionId, 'notes')).toBe(1);
    expect(count(session.sessionId, 'tokens')).toBe(0);
    expect(count(session.sessionId, 'token_lexeme_links')).toBe(0);
    expect(count(session.sessionId, 'speakers')).toBe(1);
    expect(count(session.sessionId, 'lexemes')).toBe(1);
    expect(count(session.sessionId, 'media')).toBe(1);
    const media = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT deleted_at AS deletedAt, relpath FROM media WHERE id = ?')
      .get(seeded.mediaId) as { deletedAt: string | null; relpath: string };
    expect(media).toEqual({ deletedAt: null, relpath: 'a.wav' });
    expect(
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT COUNT(*) AS n FROM layers WHERE id = ?')
        .get(child.id),
    ).toEqual({ n: 0 });
    expect(existsSync(join(dir, 'a.wav'))).toBe(true);
    expect(
      callDesktopSession(session.sessionId, 'notes.list', {
        anchorKind: 'unit',
        unitId: otherUnit.id,
      }),
    ).toMatchObject([{ id: 'other-note' }]);
  });

  it('purges only after both the retention deadline and seven days from the reminder', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    callDesktopSession(session.sessionId, 'manuscripts.showReminder', { id: seeded.manuscriptId });
    backdate(session.sessionId, seeded.manuscriptId, daysFromNow(30), daysFromNow(-8));
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is inside its retention window');
    backdate(session.sessionId, seeded.manuscriptId, PAST, daysFromNow(-6));
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is inside its retention window');
    expect(count(session.sessionId, 'manuscripts')).toBe(1);
    backdate(session.sessionId, seeded.manuscriptId, PAST, daysFromNow(-8));
    expect(
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toEqual({ id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is missing');
    expect(existsSync(join(dir, 'a.wav'))).toBe(true);
  });

  it('starts a new reminder cycle when a restored manuscript is deleted again', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    callDesktopSession(session.sessionId, 'manuscripts.showReminder', { id: seeded.manuscriptId });
    backdate(session.sessionId, seeded.manuscriptId, PAST, PAST);
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    const again = callDesktopSession(session.sessionId, 'manuscripts.delete', {
      id: seeded.manuscriptId,
    }) as { retainUntil: string; reminderShownAt: string | null };
    expect(again.reminderShownAt).toBeNull();
    expect(again.retainUntil > PAST).toBe(true);
    backdate(session.sessionId, seeded.manuscriptId, PAST, null);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('reminder has not been shown');
    expect(count(session.sessionId, 'layers')).toBe(1);
    expect(existsSync(join(dir, 'a.wav'))).toBe(true);
  });

  it('does not purge a manuscript that was restored', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    backdate(session.sessionId, seeded.manuscriptId, PAST, PAST);
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.purge', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is active');
    expect(count(session.sessionId, 'manuscripts')).toBe(1);
    expect(count(session.sessionId, 'layers')).toBe(1);
  });

  it('lists only manuscripts and recordings inside the seven-day reminder window', () => {
    const dir = folder();
    writeFileSync(join(dir, 'b.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const later = seed(session.sessionId, '留下');
    const due = seed(session.sessionId, '到期', later.mediaId);
    const recording = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 8,
    }) as { id: string };
    const onRecording = seed(session.sessionId, '录音文稿', recording.id);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: later.manuscriptId });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: due.manuscriptId });
    callDesktopSession(session.sessionId, 'media.delete', { id: recording.id });
    const soon = daysFromNow(3);
    backdate(session.sessionId, due.manuscriptId, soon, null);
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE media SET retain_until = ? WHERE id = ?')
      .run(soon, recording.id);

    expect(callDesktopSession(session.sessionId, 'deletion.listDue', {})).toEqual([
      {
        target: 'manuscript',
        id: due.manuscriptId,
        title: { zh: '到期' },
        relpath: null,
        retainUntil: soon,
      },
      { target: 'media', id: recording.id, title: null, relpath: 'b.wav', retainUntil: soon },
    ]);
    expect(reminderAt(session.sessionId, 'manuscripts', later.manuscriptId)).toBeNull();
    expect(reminderAt(session.sessionId, 'manuscripts', due.manuscriptId)).toBeNull();
    expect(reminderAt(session.sessionId, 'manuscripts', onRecording.manuscriptId)).toBeNull();
    expect(reminderAt(session.sessionId, 'media', recording.id)).toBeNull();
  });
});

function seed(
  sessionId: string,
  title: string,
  mediaId?: string,
): { manuscriptId: string; layerId: string; mediaId: string } {
  const media =
    mediaId === undefined
      ? (callDesktopSession(sessionId, 'media.create', {
          relpath: 'a.wav',
          sha256: 'aa',
          duration: 8,
        }) as { id: string })
      : { id: mediaId };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: title },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: title,
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return { manuscriptId: manuscript.id, layerId: layer.id, mediaId: media.id };
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function backdate(
  sessionId: string,
  manuscriptId: string,
  retainUntil: string,
  reminderShownAt: string | null,
): void {
  requireDesktopSession(sessionId)
    .db.prepare('UPDATE manuscripts SET retain_until = ?, reminder_shown_at = ? WHERE id = ?')
    .run(retainUntil, reminderShownAt, manuscriptId);
}

function reminderAt(sessionId: string, table: 'manuscripts' | 'media', id: string): string | null {
  const row = requireDesktopSession(sessionId)
    .db.prepare(`SELECT reminder_shown_at AS shown FROM ${table} WHERE id = ?`)
    .get(id) as { shown: string | null };
  return row.shown;
}

function count(sessionId: string, table: string): number {
  const row = requireDesktopSession(sessionId)
    .db.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .get() as { n: number };
  return row.n;
}
