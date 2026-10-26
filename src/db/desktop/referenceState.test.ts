import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_LOCK_NAME, releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { applyAnalysis } from './analysis';
import { saveLexemeEntry, linkSense, removeSense } from './lexicon';
import { openProject } from './openProject';
import { resetDesktopSessions } from './projectSession';
import { countActiveLexemeLinks, readGraphReferences, readLexemeLinks } from './referenceState';
import { getAnalysisRoot, updateUnitText, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-reference-'));
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

describe('lexeme reference state', () => {
  it('keeps a deleted sense as a dangling link and restores only the same id', () => {
    const dir = folder();
    const project = openProject(dir);
    seedUnit(project.db);
    saveLexemeEntry(project.db, {
      id: 'lexemeA',
      entry: { headword: 'ka', senses: [{ id: 'sense1', definitions: [{ text: 'past' }] }] },
    });
    const stored = writeAnalysisRoot(project.db, {
      unitId: 'u1',
      graph: linkedGraph(),
      expectedAnalysisGeneration: 0,
    });
    const linked = applyAnalysis(project.db, {
      unitId: 'u1',
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: stored.analysisGeneration,
        graphFingerprint: stored.graphFingerprint,
      },
      changes: [{ action: 'node.setField', nodeId: 'n1', field: 'pos', value: 'noun' }],
    });
    removeSense(project.db, { lexemeId: 'lexemeA', senseId: 'sense1' });

    const readings = readLexemeLinks(project.db);
    expect(readings).toEqual([
      expect.objectContaining({
        id: 'l1',
        lexemeId: 'lexemeA',
        senseId: 'sense1',
        linkState: 'target-missing',
        gap: 'missing-sense',
      }),
    ]);
    expect(countActiveLexemeLinks(project.db)).toBe(0);
    const graph = getAnalysisRoot(project.db, 'u1')?.graph;
    if (graph == null) throw new Error('graph missing');
    expect(readGraphReferences(project.db, graph)).toEqual([
      expect.objectContaining({ kind: 'node', id: 'n1', linkState: 'active' }),
      expect.objectContaining({
        kind: 'relation',
        id: 'l1',
        senseId: 'sense1',
        linkState: 'target-missing',
        gap: 'missing-sense',
      }),
    ]);

    const edited = applyAnalysis(project.db, {
      unitId: 'u1',
      expected: {
        manuscriptGeneration: 0,
        analysisGeneration: linked.root.analysisGeneration,
        graphFingerprint: linked.root.graphFingerprint,
      },
      changes: [
        { action: 'node.setMapValue', nodeId: 'n1', field: 'gloss', key: 'zh', value: '已往' },
      ],
    });
    expect(edited.root.graph?.nodes[0]?.domain?.gloss).toEqual({ zh: '已往', en: 'past' });
    expect(readLexemeLinks(project.db)[0]?.senseId).toBe('sense1');
    expect(() =>
      linkSense(project.db, {
        lexemeId: 'lexemeA',
        targetType: 'token',
        targetId: 'tok-1',
        senseId: 'sense1',
      }),
    ).toThrow('sense is missing');

    saveLexemeEntry(project.db, {
      id: 'lexemeA',
      entry: { headword: 'ka', senses: [{ id: 'sense1', definitions: [{ text: 'past' }] }] },
    });
    expect(readLexemeLinks(project.db)[0]?.linkState).toBe('active');
    expect(countActiveLexemeLinks(project.db)).toBe(1);

    saveLexemeEntry(project.db, {
      id: 'lexemeA',
      entry: { headword: 'ka', senses: [{ id: 'sense2', definitions: [{ text: 'past' }] }] },
    });
    expect(readLexemeLinks(project.db)[0]).toMatchObject({
      senseId: 'sense1',
      linkState: 'target-missing',
      gap: 'missing-sense',
    });
    project.close();

    const reopened = openProject(dir);
    expect(readLexemeLinks(reopened.db)[0]?.linkState).toBe('target-missing');
    expect(countActiveLexemeLinks(reopened.db)).toBe(0);
    reopened.close();
  });

  it('leaves the link in place when the lexeme row is deleted', () => {
    const project = openProject(folder());
    seedUnit(project.db);
    saveLexemeEntry(project.db, {
      id: 'lexemeA',
      entry: { headword: 'ka', senses: [{ id: 'sense1', definitions: [{ text: 'past' }] }] },
    });
    writeAnalysisRoot(project.db, {
      unitId: 'u1',
      graph: bareGraph(),
      expectedAnalysisGeneration: 0,
    });
    linkSense(project.db, {
      lexemeId: 'lexemeA',
      targetType: 'token',
      targetId: 'tok-1',
      senseId: 'sense1',
    });
    project.db.prepare('DELETE FROM lexemes WHERE id = ?').run('lexemeA');
    expect(readLexemeLinks(project.db)).toEqual([
      expect.objectContaining({
        lexemeId: 'lexemeA',
        senseId: 'sense1',
        linkState: 'target-missing',
        gap: 'missing-entry',
      }),
    ]);
    expect(countActiveLexemeLinks(project.db)).toBe(0);
    project.close();
  });

  it('rejects a new lexeme pointer and keeps the previous graph', () => {
    const project = openProject(folder());
    seedUnit(project.db);
    const stored = writeAnalysisRoot(project.db, {
      unitId: 'u1',
      graph: linkedGraph(),
      expectedAnalysisGeneration: 0,
    });
    expect(() =>
      applyAnalysis(project.db, {
        unitId: 'u1',
        expected: {
          manuscriptGeneration: 0,
          analysisGeneration: stored.analysisGeneration,
          graphFingerprint: stored.graphFingerprint,
        },
        changes: [{ action: 'node.setField', nodeId: 'n1', field: 'lexemeId', value: 'missing' }],
      }),
    ).toThrow('lexeme is missing');
    expect(getAnalysisRoot(project.db, 'u1')?.graphFingerprint).toBe(stored.graphFingerprint);
    project.close();
  });

  it('keeps a detached link out of the active count', () => {
    const project = openProject(folder());
    seedUnit(project.db);
    writeAnalysisRoot(project.db, {
      unitId: 'u1',
      graph: {
        payloadVersion: 1,
        id: 'g1',
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
      expectedAnalysisGeneration: 0,
    });
    saveLexemeEntry(project.db, {
      id: 'lex',
      entry: { headword: 'ka', senses: [{ id: 'sense', definitions: [{ text: 'past' }] }] },
    });
    linkSense(project.db, {
      lexemeId: 'lex',
      targetType: 'token',
      targetId: 'tok-1',
      senseId: 'sense',
    });
    updateUnitText(project.db, { unitId: 'u1', text: 'ta' });
    expect(project.db.prepare('SELECT attachment FROM token_lexeme_links').get()).toEqual({
      attachment: 'detached',
    });
    expect(readLexemeLinks(project.db)[0]).toMatchObject({
      attachment: 'detached',
      linkState: 'active',
    });
    expect(countActiveLexemeLinks(project.db)).toBe(0);
    project.close();
  });

  it('rejects a version 10 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 10');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });
});

function seedUnit(db: InstanceType<typeof Database>): void {
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
    `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES (?, ?, 'transcription', ?, ?)`,
  ).run('tx1', 'u1', 'ka', T);
  db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('tok-1', 'u1', 0, '{"default":"ka"}', '{}', T, T);
}

function bareGraph() {
  return {
    payloadVersion: 1 as const,
    id: 'g0',
    text: 'ka',
    nodes: [
      {
        id: 'tok-1',
        type: 'token' as const,
        label: 'ka',
        domain: { form: { default: 'ka' }, index: 0, createdAt: T, updatedAt: T },
      },
    ],
    relations: [],
  };
}

function linkedGraph() {
  return {
    payloadVersion: 1 as const,
    id: 'g1',
    text: 'ka',
    nodes: [
      {
        id: 'n1',
        type: 'token' as const,
        label: 'ka',
        domain: {
          form: { default: 'ka' },
          gloss: { zh: '过去', en: 'past' },
          index: 0,
          lexemeId: 'lexemeA',
          createdAt: T,
          updatedAt: T,
        },
      },
      { id: 'lex', type: 'lexemeRef' as const, label: 'lexemeA' },
    ],
    relations: [
      {
        id: 'l1',
        type: 'linksLexeme' as const,
        sourceId: 'n1',
        targetId: 'lex',
        link: { lexemeId: 'lexemeA', senseId: 'sense1', createdAt: T, updatedAt: T },
      },
    ],
  };
}
