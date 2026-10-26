import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import { writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-lexeme-link-'));
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

describe('token lexeme link', () => {
  it('counts exact folded headwords and ignores ids and partials', () => {
    const dir = folder();
    seed(dir);
    const session = openDesktopSession(dir, [dir]);
    save(session.sessionId, 'id-ka', 'other', ['one']);
    save(session.sessionId, 'kappa', 'kappa', ['one']);
    save(session.sessionId, 'bare', 'bare', []);
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'ka' }),
    ).toThrow('lexeme link has no match');
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'kap' }),
    ).toThrow('lexeme link has no match');
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'bare' }),
    ).toThrow('lexeme has no sense');
    save(session.sessionId, 'real', 'Ka', ['animal'], [{ text: 'went' }]);
    expect(
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'ka' }),
    ).toMatchObject({ id: 'real', headword: 'Ka', senses: [{ id: 'animal' }] });
    expect(
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'went' }),
    ).toMatchObject({ id: 'real' });
    save(session.sessionId, 'twin-a', 'twin', ['left']);
    save(session.sessionId, 'twin-b', 'TWIN', ['right']);
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.matchLink', { query: 'twin' }),
    ).toThrow('lexeme link is ambiguous');
    const listed = callDesktopSession(session.sessionId, 'lexicon.listLinkCandidates', {}) as {
      id: string;
    }[];
    expect(listed.map((item) => item.id).sort()).toEqual(
      ['bare', 'id-ka', 'kappa', 'real', 'twin-a', 'twin-b'].sort(),
    );
  });

  it('replaces the graph link, keeps it after the projection rows are removed, and clears it', () => {
    const dir = folder();
    seed(dir);
    const session = openDesktopSession(dir, [dir]);
    save(session.sessionId, 'run', 'run', ['move', 'manage']);
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: 'tok-1',
      lexemeId: 'run',
      senseId: 'move',
    });
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: 'tok-1',
      lexemeId: 'run',
      senseId: 'manage',
    });
    expect(graphLinks(session.sessionId)).toHaveLength(1);
    expect(
      callDesktopSession(session.sessionId, 'lexicon.listTokenLinks', { unitId: 'u1' }),
    ).toEqual([{ tokenId: 'tok-1', lexemeId: 'run', senseId: 'manage', headword: 'run' }]);
    resetDesktopSessions();

    const project = openProject(dir);
    project.db.prepare('DELETE FROM token_lexeme_links').run();
    project.close();
    const reread = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reread.sessionId, 'lexicon.listTokenLinks', { unitId: 'u1' }),
    ).toEqual([{ tokenId: 'tok-1', lexemeId: 'run', senseId: 'manage', headword: 'run' }]);
    expect(
      callDesktopSession(reread.sessionId, 'lexicon.clearTokenLink', { tokenId: 'tok-1' }),
    ).toEqual([]);
    expect(graphLinks(reread.sessionId)).toEqual([]);
    expect(callDesktopSession(reread.sessionId, 'units.get', { id: 'u1' })).toMatchObject({
      text: 'ka',
    });
    resetDesktopSessions();

    const stored = openProject(dir);
    const active = stored.db
      .prepare(
        `SELECT COUNT(*) AS n FROM token_lexeme_links WHERE target_id = ? AND attachment = 'active'`,
      )
      .get('tok-1') as { n: number };
    expect(active.n).toBe(0);
    stored.close();
    const reopened = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reopened.sessionId, 'lexicon.listTokenLinks', { unitId: 'u1' }),
    ).toEqual([]);
  });
});

function graphLinks(sessionId: string): { type: string }[] {
  const state = callDesktopSession(sessionId, 'analysis.readState', { unitId: 'u1' }) as {
    graph: { relations: { type: string }[] };
  };
  return state.graph.relations.filter((relation) => relation.type === 'linksLexeme');
}

function save(
  sessionId: string,
  id: string,
  headword: string,
  senseIds: string[],
  inflectedForms?: { text: string }[],
): void {
  callDesktopSession(sessionId, 'lexicon.saveEntry', {
    id,
    entry: {
      headword,
      ...(inflectedForms === undefined ? {} : { inflectedForms }),
      senses: senseIds.map((senseId) => ({ id: senseId, definitions: [{ text: senseId }] })),
    },
  });
}

function seed(dir: string): void {
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
  db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('tok-1', 'u1', 0, '{"default":"ka"}', '{}', T, T);
  db.prepare(
    `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES ('ut1', 'u1', 'transcription', 'ka', ?)`,
  ).run(T);
  writeAnalysisRoot(project.db, {
    unitId: 'u1',
    expectedAnalysisGeneration: 0,
    graph: {
      payloadVersion: 1,
      id: 'g',
      text: 'ka',
      nodes: [
        {
          id: 'tok-1',
          type: 'token',
          label: 'ka',
          domain: { form: { default: 'ka' }, index: 0, createdAt: T, updatedAt: T },
        },
      ],
      relations: [],
    },
  });
  project.close();
}
