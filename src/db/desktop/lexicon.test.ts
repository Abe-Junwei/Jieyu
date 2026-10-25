import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { saveLexemeEntry } from './lexicon';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-lexicon-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('project lexicon', () => {
  it('keeps two senses and rejects a referenced sense or a bad entry', () => {
    const dir = folder();
    seedToken(dir);
    const session = openDesktopSession(dir, [dir]);
    const created = entry(session.sessionId, {
      id: 'run',
      entry: {
        headword: 'run',
        senses: [
          { id: 'move', definitions: [{ text: 'to move' }] },
          { id: 'manage', definitions: [{ text: 'to manage' }] },
        ],
      },
      jieyu: { notes: [{ owner: 'entry', ref: 'run', text: 'kept' }] },
    });
    expect(created.entry).toMatchObject({
      headword: 'run',
      senses: [
        { id: 'move', definitions: [{ text: 'to move' }] },
        { id: 'manage', definitions: [{ text: 'to manage' }] },
      ],
    });
    expect(created.jieyu).toEqual({ notes: [{ owner: 'entry', ref: 'run', text: 'kept' }] });

    expect(() =>
      entry(session.sessionId, { entry: { senses: [{ definitions: [{ text: 'no' }] }] } }),
    ).toThrow('lexeme entry is invalid');
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.linkSense', {
        lexemeId: 'run',
        targetType: 'token',
        targetId: 'tok-1',
        senseId: 'missing',
      }),
    ).toThrow('sense is missing');

    entry(session.sessionId, {
      id: 'run',
      entry: created.entry,
      jieyu: {
        exampleRefs: [{ senseId: 'move', exampleIndex: 0, segmentId: 'seg-1' }],
      },
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.removeSense', {
        lexemeId: 'run',
        senseId: 'move',
      }),
    ).toThrow('sense is still referenced');

    entry(session.sessionId, {
      id: 'run',
      entry: created.entry,
      jieyu: { notes: [{ owner: 'entry', ref: 'run', text: 'kept' }] },
    });
    const removed = callDesktopSession(session.sessionId, 'lexicon.removeSense', {
      lexemeId: 'run',
      senseId: 'move',
    }) as { entry: { senses: { id: string }[] } };
    expect(removed.entry.senses.map((sense) => sense.id)).toEqual(['manage']);

    const link = callDesktopSession(session.sessionId, 'lexicon.linkSense', {
      lexemeId: 'run',
      targetType: 'token',
      targetId: 'tok-1',
      senseId: 'manage',
      role: 'manual',
    }) as { senseId: string; role: string };
    expect(link).toMatchObject({ senseId: 'manage', role: 'manual' });
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.removeSense', {
        lexemeId: 'run',
        senseId: 'manage',
      }),
    ).toThrow('sense is still referenced');
    expect(() =>
      entry(session.sessionId, {
        id: 'run',
        entry: { headword: 'run', senses: [{ id: 'move', definitions: [{ text: 'to move' }] }] },
      }),
    ).toThrow('sense is still referenced');

    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'lexicon.getEntry', { id: 'run' })).toMatchObject(
      {
        entry: {
          headword: 'run',
          senses: [{ id: 'manage', definitions: [{ text: 'to manage' }] }],
        },
        jieyu: { notes: [{ owner: 'entry', ref: 'run', text: 'kept' }] },
      },
    );
  });

  it('does not keep an entry change when the following link write fails', () => {
    const dir = folder();
    seedToken(dir);
    const project = openProject(dir);
    saveLexemeEntry(project.db, {
      id: 'run',
      entry: { headword: 'run', senses: [{ id: 'move', definitions: [{ text: 'to move' }] }] },
    });
    project.db
      .prepare(
        `CREATE TRIGGER fail_link BEFORE INSERT ON token_lexeme_links
         BEGIN SELECT RAISE(ABORT, 'link failed'); END`,
      )
      .run();
    expect(() =>
      saveLexemeEntry(project.db, {
        id: 'run',
        entry: { headword: 'ran', senses: [{ id: 'move', definitions: [{ text: 'to move' }] }] },
        link: { targetType: 'token', targetId: 'tok-1', senseId: 'move' },
      }),
    ).toThrow('link failed');
    const row = project.db.prepare('SELECT entry_json FROM lexemes WHERE id = ?').get('run') as {
      entry_json: string;
    };
    expect(JSON.parse(row.entry_json)).toMatchObject({ headword: 'run' });
    const links = project.db.prepare('SELECT count(*) AS n FROM token_lexeme_links').get() as {
      n: number;
    };
    expect(links.n).toBe(0);
    project.close();
  });
});

function entry(
  sessionId: string,
  input: unknown,
): {
  entry: Record<string, unknown> & { senses: { id: string }[] };
  jieyu: Record<string, unknown>;
} {
  return callDesktopSession(sessionId, 'lexicon.saveEntry', input) as never;
}

function seedToken(dir: string): void {
  const project = openProject(dir);
  const db = project.db;
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('m1', 'a.wav', 'aa', 'a.wav', 1, T);
  db.prepare(
    'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('ms1', '{"en":"Clip"}', 'm1', T, T);
  db.prepare(
    `INSERT INTO layers (
      id, manuscript_id, key, name_json, tier_type, content_type, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, '{"en":"Transcription"}', 'time-aligned', 'transcription', 0, ?, ?)`,
  ).run('ly1', 'ms1', 'tx', T, T);
  db.prepare(
    'INSERT INTO units (id, layer_id, start_time, end_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('u1', 'ly1', 0, 1, T, T);
  db.prepare('INSERT INTO tokens (id, unit_id, token_index, form) VALUES (?, ?, ?, ?)').run(
    'tok-1',
    'u1',
    0,
    'run',
  );
  project.close();
}
