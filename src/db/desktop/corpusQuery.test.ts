import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import {
  queryCorpus,
  type CorpusQueryCursor,
  type CorpusQueryHit,
  type CorpusQueryPage,
} from './corpusQuery';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-corpus-query-'));
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

function query(sessionId: string, input: Record<string, unknown>): CorpusQueryPage {
  return callDesktopSession(sessionId, 'corpus.query', input) as CorpusQueryPage;
}

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
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return { manuscriptId: manuscript.id, layerId: layer.id, mediaId: media.id };
}

function addUnit(
  sessionId: string,
  layerId: string,
  startTime: number,
  text: string,
): { id: string } {
  return callDesktopSession(sessionId, 'units.create', {
    layerId,
    startTime,
    endTime: startTime + 1,
    text,
  }) as { id: string };
}

function apply(sessionId: string, unitId: string, changes: unknown[]): void {
  const state = callDesktopSession(sessionId, 'analysis.readState', { unitId }) as {
    manuscriptGeneration: number;
    analysisGeneration: number;
    graphFingerprint: string;
  };
  callDesktopSession(sessionId, 'analysis.apply', {
    unitId,
    expected: {
      manuscriptGeneration: state.manuscriptGeneration,
      analysisGeneration: state.analysisGeneration,
      graphFingerprint: state.graphFingerprint,
    },
    changes,
  });
}

function words(sessionId: string, unitId: string): { id: string; form: string }[] {
  return callDesktopSession(sessionId, 'analysis.segmentWords', { unitId }) as {
    id: string;
    form: string;
  }[];
}

interface Library {
  sessionId: string;
  manuscriptA: string;
  manuscriptB: string;
  beta: string;
  linked: string;
  lexemeRun: string;
  lexemeWalk: string;
}

function library(): Library {
  const dir = folder();
  const sessionId = openDesktopSession(dir, [dir]).sessionId;
  const first = seed(sessionId, '文稿');
  const second = seed(sessionId, '另一', first.mediaId);
  const otherLayer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: first.manuscriptId,
    key: 'tl',
    name: { zh: '第二层' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const betaUnit = addUnit(sessionId, first.layerId, 1, 'Alpha beta');
  const kara = addUnit(sessionId, first.layerId, 2, 'ka-ra');
  addUnit(sessionId, first.layerId, 3, '100% done');
  const goes = addUnit(sessionId, first.layerId, 4, 'go go');
  const linked = addUnit(sessionId, first.layerId, 5, 'linked');
  addUnit(sessionId, otherLayer.id, 0, '第二层');
  addUnit(sessionId, second.layerId, 0, 'other');

  const betaWords = words(sessionId, betaUnit.id);
  const beta = betaWords.find((word) => word.form === 'beta');
  if (beta === undefined) throw new Error('beta missing');
  apply(sessionId, betaUnit.id, [
    { action: 'node.setMapValue', nodeId: beta.id, field: 'gloss', key: 'zh', value: '走' },
    { action: 'node.setMapValue', nodeId: beta.id, field: 'gloss', key: 'en', value: 'walk' },
    { action: 'node.setField', nodeId: beta.id, field: 'pos', value: 'v' },
  ]);

  const karaWords = words(sessionId, kara.id);
  const karaWord = karaWords[0];
  if (karaWord === undefined) throw new Error('word missing');
  const morphemes = callDesktopSession(sessionId, 'analysis.segmentMorphemes', {
    unitId: kara.id,
  }) as { id: string; form: string }[];
  const ka = morphemes.find((item) => item.form === 'ka');
  if (ka === undefined) throw new Error('morpheme missing');
  apply(sessionId, kara.id, [
    { action: 'node.setField', nodeId: karaWord.id, field: 'pos', value: 'n' },
    { action: 'node.setMapValue', nodeId: ka.id, field: 'gloss', key: 'zh', value: '人' },
    { action: 'node.setMapValue', nodeId: ka.id, field: 'form', key: 'narrow', value: 'person' },
  ]);

  const goWords = words(sessionId, goes.id);
  apply(
    sessionId,
    goes.id,
    goWords.map((word) => ({
      action: 'node.setMapValue',
      nodeId: word.id,
      field: 'gloss',
      key: 'en',
      value: 'go',
    })),
  );

  const linkedWords = words(sessionId, linked.id);
  const linkedWord = linkedWords[0];
  if (linkedWord === undefined) throw new Error('linked word missing');
  apply(sessionId, linked.id, [
    { action: 'node.setMapValue', nodeId: linkedWord.id, field: 'gloss', key: 'en', value: 'run' },
    { action: 'node.setField', nodeId: linkedWord.id, field: 'pos', value: 'v' },
  ]);
  callDesktopSession(sessionId, 'lexicon.saveEntry', {
    id: 'lex-run',
    entry: { headword: 'run', senses: [{ id: 's1', definitions: [{ text: 'run' }] }] },
  });
  callDesktopSession(sessionId, 'lexicon.saveEntry', {
    id: 'lex-walk',
    entry: { headword: 'walk', senses: [{ id: 's1', definitions: [{ text: 'walk' }] }] },
  });
  callDesktopSession(sessionId, 'lexicon.replaceTokenLink', {
    tokenId: linkedWord.id,
    lexemeId: 'lex-run',
    senseId: 's1',
  });
  return {
    sessionId,
    manuscriptA: first.manuscriptId,
    manuscriptB: second.manuscriptId,
    beta: beta.id,
    linked: linkedWord.id,
    lexemeRun: 'lex-run',
    lexemeWalk: 'lex-walk',
  };
}

describe('corpus query', () => {
  it('matches text, gloss, pos, and a sense on the same object', () => {
    const lib = library();
    expect(query(lib.sessionId, { text: 'beta', limit: 10 })).toEqual({
      items: [
        expect.objectContaining({
          text: 'Alpha beta',
          startTime: 1,
          endTime: 2,
          textSpans: [{ start: 6, end: 10 }],
          hits: [],
        }),
      ],
      hasMore: false,
    });
    expect(query(lib.sessionId, { text: 'alpha', limit: 10 }).items).toEqual([]);
    expect(query(lib.sessionId, { form: 'Beta', limit: 10 }).items).toEqual([]);
    expect(query(lib.sessionId, { form: 'beta', limit: 10 }).items[0]?.hits[0]?.id).toBe(lib.beta);
    expect(query(lib.sessionId, { form: 'beta', limit: 10 }).items[0]?.textSpans).toEqual([]);
    expect(query(lib.sessionId, { text: '%', limit: 10 }).items.map((item) => item.text)).toEqual([
      '100% done',
    ]);
    expect(query(lib.sessionId, { gloss: 'en', limit: 10 }).items).toEqual([]);
    const walked = query(lib.sessionId, { gloss: 'alk', limit: 10 });
    expect(walked.items).toHaveLength(1);
    expect(walked.items[0]?.hits).toEqual([
      expect.objectContaining({
        kind: 'token',
        id: lib.beta,
        form: { default: 'beta' },
        gloss: { zh: '走', en: 'walk' },
        pos: 'v',
      }),
    ]);
    expect(query(lib.sessionId, { pos: 'V', limit: 10 }).items).toEqual([]);
    expect(query(lib.sessionId, { pos: 'n', limit: 10 }).items[0]?.hits[0]?.kind).toBe('token');
    expect(
      query(lib.sessionId, { lexemeId: lib.lexemeWalk, senseId: 's1', limit: 10 }).items,
    ).toEqual([]);
    const combined = query(lib.sessionId, {
      text: 'link',
      gloss: 'run',
      pos: 'v',
      lexemeId: lib.lexemeRun,
      senseId: 's1',
      limit: 10,
    });
    expect(combined.items).toEqual([
      expect.objectContaining({
        manuscriptId: lib.manuscriptA,
        text: 'linked',
        hits: [
          expect.objectContaining({
            kind: 'token',
            id: lib.linked,
            form: { default: 'linked' },
            gloss: { en: 'run' },
            pos: 'v',
            lexemeId: 'lex-run',
            senseId: 's1',
          }),
        ],
      }),
    ]);
    expect(() => query(lib.sessionId, { senseId: 's1', limit: 10 })).toThrow(
      'sense query needs lexemeId and senseId',
    );
    expect(() => query(lib.sessionId, { limit: 0 })).toThrow(
      'desktop call limit must be a positive integer',
    );
  });

  it('rejects a gloss and pos split across a word and its morpheme', () => {
    const lib = library();
    expect(query(lib.sessionId, { gloss: '人', pos: 'n', limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    });
    const gloss = query(lib.sessionId, { gloss: '人', limit: 10 });
    expect(gloss.items).toHaveLength(1);
    expect(gloss.items[0]?.hits).toEqual([
      expect.objectContaining({ kind: 'morpheme', gloss: { zh: '人' }, pos: null }),
    ]);
    const pos = query(lib.sessionId, { pos: 'n', limit: 10 });
    expect(pos.items).toHaveLength(1);
    expect(pos.items[0]?.hits[0]?.kind).toBe('token');
    const both = query(lib.sessionId, { text: 'Alpha', gloss: 'walk', limit: 10 });
    expect(both.items[0]?.hits.map((hit) => hit.form)).toEqual([{ default: 'beta' }]);
    expect(query(lib.sessionId, { text: 'nope', gloss: 'walk', limit: 10 }).items).toEqual([]);
    expect(query(lib.sessionId, { form: 'person', pos: 'n', limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    });
    expect(query(lib.sessionId, { form: 'person', limit: 10 }).items[0]?.hits).toEqual([
      expect.objectContaining({
        kind: 'morpheme',
        form: expect.objectContaining({ narrow: 'person' }),
      }),
    ]);
  });

  it('drops a sense after the entry loses it or the link is cleared', () => {
    const lib = library();
    expect(
      query(lib.sessionId, { lexemeId: lib.lexemeRun, senseId: 's1', limit: 10 }).items[0]?.hits[0],
    ).toMatchObject({ lexemeId: 'lex-run', senseId: 's1' });
    callDesktopSession(lib.sessionId, 'lexicon.removeSense', {
      lexemeId: lib.lexemeRun,
      senseId: 's1',
    });
    expect(query(lib.sessionId, { lexemeId: lib.lexemeRun, senseId: 's1', limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    });
    const still = query(lib.sessionId, { gloss: 'run', limit: 10 }).items[0]?.hits[0];
    expect(still?.lexemeId).toBeUndefined();
    expect(still?.senseId).toBeUndefined();
    callDesktopSession(lib.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: lib.beta,
      lexemeId: lib.lexemeWalk,
      senseId: 's1',
    });
    expect(
      query(lib.sessionId, { lexemeId: lib.lexemeWalk, senseId: 's1', limit: 10 }).items,
    ).toHaveLength(1);
    callDesktopSession(lib.sessionId, 'lexicon.clearTokenLink', { tokenId: lib.beta });
    expect(query(lib.sessionId, { lexemeId: lib.lexemeWalk, senseId: 's1', limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    });
    expect(query(lib.sessionId, { gloss: 'walk', limit: 10 }).items[0]?.hits[0]?.lexemeId).toBe(
      undefined,
    );
  });

  it('keeps one row for several hits and pages in sort order', () => {
    const lib = library();
    const goes = query(lib.sessionId, { gloss: 'go', limit: 10 });
    expect(goes.items).toHaveLength(1);
    expect(goes.items[0]?.hits.map((hit: CorpusQueryHit) => hit.form)).toEqual([
      { default: 'go' },
      { default: 'go' },
    ]);
    expect(query(lib.sessionId, { text: 'go', limit: 10 }).items[0]?.textSpans).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
    const all = query(lib.sessionId, { text: '   ', limit: 50 });
    expect(all.hasMore).toBe(false);
    expect(all.items.length).toBeGreaterThan(1);
    expect(all.items.every((item) => item.hits.length === 0)).toBe(true);
    const seen: string[] = [];
    let cursor: CorpusQueryCursor | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = query(lib.sessionId, {
        limit: 1,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const item = page.items[0];
      if (item === undefined) break;
      seen.push(item.unitId);
      if (!page.hasMore) break;
      cursor = {
        manuscriptId: item.manuscriptId,
        layerId: item.layerId,
        startTime: item.startTime,
        unitId: item.unitId,
      };
    }
    expect(seen).toEqual(all.items.map((item) => item.unitId));
    expect(query(lib.sessionId, { manuscriptId: lib.manuscriptB, limit: 10 }).items).toEqual([
      expect.objectContaining({ manuscriptId: lib.manuscriptB, text: 'other', hits: [] }),
    ]);
  });

  it('omits a manuscript after it is deleted', () => {
    const lib = library();
    callDesktopSession(lib.sessionId, 'manuscripts.delete', { id: lib.manuscriptB });
    const page = query(lib.sessionId, { limit: 50 });
    expect(page.items.some((item) => item.text === 'other')).toBe(false);
    expect(query(lib.sessionId, { manuscriptId: lib.manuscriptB, limit: 10 })).toEqual({
      items: [],
      hasMore: false,
    });
    expect(query(lib.sessionId, { text: 'other', limit: 10 }).items).toEqual([]);
  });

  it('pages a broad form query across more units than one statement can bind', () => {
    const dir = folder();
    const project = openProject(dir);
    try {
      const t = '2026-10-29';
      project.db
        .prepare(
          'INSERT INTO media(id,relpath,sha256,filename,duration,created_at) VALUES(?,?,?,?,?,?)',
        )
        .run('m', 'a.wav', 'a', 'a.wav', 40000, t);
      const manuscript = project.manuscripts.create({ title: { und: 'm' }, mediaId: 'm' });
      const layer = project.layers.create({
        manuscriptId: manuscript.id,
        key: 'tx',
        name: { und: 'tx' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      });
      const insertUnit = project.db.prepare(
        'INSERT INTO units(id,layer_id,start_time,end_time,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      );
      const insertText = project.db.prepare(
        "INSERT INTO unit_texts(id,unit_id,role,body,updated_at) VALUES(?,?,'transcription','ka',?)",
      );
      const insertToken = project.db.prepare(
        "INSERT INTO tokens(id,unit_id,token_index,form_json,gloss_json,created_at,updated_at) VALUES(?,?,0,?, '{}',?,?)",
      );
      project.db.transaction(() => {
        for (let i = 0; i < 33000; i++) {
          const id = `u${i}`;
          insertUnit.run(id, layer.id, i, i + 1, t, t);
          insertText.run(`x${i}`, id, t);
          insertToken.run(`k${i}`, id, JSON.stringify({ default: 'ka' }), t, t);
        }
      })();
      expect(() =>
        queryCorpus(project.db, {
          manuscriptId: null,
          text: null,
          form: 'ka',
          gloss: null,
          pos: null,
          lexemeId: null,
          senseId: null,
          limit: 20,
          cursor: null,
        }),
      ).not.toThrow();
    } finally {
      project.close();
    }
  }, 60_000);
});
