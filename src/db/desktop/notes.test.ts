import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { projectAnalysisGraph } from '../../annotation/analysisGraphDomainProjection';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { replaceProjection } from './analysis';
import { callDesktopSession } from './desktopCall';
import { saveLexemeEntry } from './lexicon';
import {
  createContentNote,
  deleteManuscriptNotes,
  detachAnalysisNotes,
  detachNotesForDeletedTarget,
  listContentNotes,
  listLexemeNotes,
  readContentNote,
  restoreAnalysisNote,
  saveLexemeNote,
} from './notes';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import { writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-notes-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function provenance() {
  return { actorType: 'human' as const, method: 'manual' as const, createdAt: T };
}

describe('content notes', () => {
  it('keeps the eight anchors apart and still lists a detached note', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p1', '{"zh":"项目"}', T, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
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
      text: 'ka',
    });
    const root = writeAnalysisRoot(project.db, {
      unitId: unit.id,
      expectedAnalysisGeneration: 0,
      graph: {
        payloadVersion: 1,
        id: 'g1',
        text: 'ka',
        nodes: [
          {
            id: 'n1',
            type: 'token',
            label: 'n1',
            domain: {
              form: { default: 'ka' },
              index: 0,
              createdAt: T,
              updatedAt: T,
              provenance: provenance(),
            },
          },
          {
            id: 'm1',
            type: 'morpheme',
            label: 'k',
            domain: { form: { default: 'k' }, index: 0, createdAt: T, updatedAt: T },
            surfaceParts: [{ tokenId: 'n1', formKey: 'default' }],
          },
        ],
        relations: [{ id: 'h', type: 'hasPart', sourceId: 'n1', targetId: 'm1' }],
      },
    });
    if (root.graph === null) throw new Error('graph missing');
    const projected = projectAnalysisGraph(root.graph, unit.id);
    replaceProjection(project.db, unit.id, projected.tokens, projected.morphemes);
    project.db
      .prepare(
        `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES ('tr1', ?, 'translation', '你好', ?)`,
      )
      .run(unit.id, T);

    const written = [
      createContentNote(project.db, {
        id: 'project',
        anchor: { kind: 'project' },
        content: { zh: '项目备注' },
      }),
      createContentNote(project.db, {
        id: 'manuscript',
        anchor: { kind: 'manuscript', manuscriptId: manuscript.id },
        content: { zh: '文稿头注' },
      }),
      createContentNote(project.db, {
        id: 'layer',
        anchor: { kind: 'layer', layerId: layer.id },
        content: { zh: '层' },
      }),
      createContentNote(project.db, {
        id: 'unit',
        anchor: { kind: 'unit', unitId: unit.id },
        content: { zh: '语段' },
        category: 'comment',
        provenance: provenance(),
      }),
      createContentNote(project.db, {
        id: 'token',
        anchor: { kind: 'token', unitId: unit.id, tokenId: 'n1' },
        content: { default: '词', zh: '词注' },
      }),
      createContentNote(project.db, {
        id: 'morpheme',
        anchor: { kind: 'morpheme', unitId: unit.id, morphemeId: 'm1' },
        content: { zh: '词素' },
      }),
      createContentNote(project.db, {
        id: 'timeline',
        anchor: { kind: 'unit', unitId: unit.id, view: 'timeline' },
        content: { zh: '时间轴' },
      }),
      createContentNote(project.db, {
        id: 'waveform',
        anchor: { kind: 'unit', unitId: unit.id, view: 'waveform' },
        content: { zh: '波形' },
      }),
      createContentNote(project.db, {
        id: 'comment',
        anchor: { kind: 'unit_text', unitTextId: 'tr1' },
        content: { zh: '评论' },
      }),
      createContentNote(project.db, {
        id: 'node',
        anchor: { kind: 'analysis_node', unitId: unit.id, nodeId: 'n1' },
        content: { zh: '图节点' },
      }),
    ];
    expect(written.map((note) => note.projectId)).toEqual(Array(10).fill('p1'));
    expect(project.db.prepare(`SELECT body FROM unit_texts WHERE id = 'tr1'`).get()).toEqual({
      body: '你好',
    });
    expect(readContentNote(project.db, 'comment')).toMatchObject({
      anchorKind: 'unit_text',
      unitTextId: 'tr1',
    });
    expect(readContentNote(project.db, 'timeline')).toMatchObject({
      anchorKind: 'unit',
      view: 'timeline',
    });
    expect(readContentNote(project.db, 'waveform')).toMatchObject({
      anchorKind: 'unit',
      view: 'waveform',
    });
    expect(readContentNote(project.db, 'morpheme')).toMatchObject({ tokenId: 'n1' });
    expect(() =>
      createContentNote(project.db, {
        anchor: { kind: 'analysis_node', unitId: unit.id, nodeId: 'missing' },
        content: { zh: '没有映射' },
      }),
    ).toThrow('note target is missing');
    expect(() =>
      createContentNote(project.db, {
        anchor: { kind: 'token', unitId: unit.id, tokenId: 'missing' },
        content: { zh: '没有词' },
      }),
    ).toThrow('note target is missing');

    project.db.prepare(`UPDATE notes SET attachment = 'detached' WHERE id = 'token'`).run();
    restoreAnalysisNote(
      project.db,
      {
        id: 'token',
        targetType: 'token',
        targetId: 'n1',
        body: 'snapshot',
        content: { default: 'snapshot' },
        category: 'todo',
        createdAt: T,
        updatedAt: T,
      },
      unit.id,
      'active',
      '2099-01-01T00:00:00.000Z',
      '2099-01-01T00:00:00.000Z',
    );
    expect(readContentNote(project.db, 'token')).toMatchObject({
      attachment: 'active',
      content: { default: '词', zh: '词注' },
      category: null,
    });
    project.db
      .prepare(`UPDATE notes SET content_json = ?, category = ?, updated_at = ? WHERE id = 'token'`)
      .run('{"default":"later","zh":"后来"}', 'comment', '2100-01-01T00:00:00.000Z');
    restoreAnalysisNote(
      project.db,
      {
        id: 'token',
        targetType: 'token',
        targetId: 'n1',
        body: 'snapshot',
        content: { default: 'snapshot' },
        category: 'todo',
        createdAt: T,
        updatedAt: T,
      },
      unit.id,
      'detached',
      '2099-01-01T00:00:00.000Z',
      '2099-01-02T00:00:00.000Z',
    );
    expect(readContentNote(project.db, 'token')).toMatchObject({
      attachment: 'detached',
      content: { default: 'later', zh: '后来' },
      category: 'comment',
    });
    project.close();

    const reopened = openProject(dir);
    expect(
      listContentNotes(reopened.db)
        .map((note) => note.id)
        .sort(),
    ).toEqual(written.map((note) => note.id).sort());
    expect(
      listContentNotes(reopened.db, { attachment: 'detached' }).map((note) => note.id),
    ).toEqual(['token']);
    expect(
      listContentNotes(reopened.db, { attachment: 'active' }).map((note) => note.id),
    ).not.toContain('token');
    expect(readContentNote(reopened.db, 'unit')?.provenance).toMatchObject({ method: 'manual' });
    expect(readContentNote(reopened.db, 'morpheme')).toMatchObject({
      morphemeId: 'm1',
      tokenId: 'n1',
      unitId: unit.id,
    });
    restoreAnalysisNote(
      reopened.db,
      {
        id: 'gone',
        targetType: 'token',
        targetId: 'n1',
        body: 'revived',
        createdAt: T,
        updatedAt: T,
      },
      unit.id,
      'active',
      T,
      T,
    );
    expect(readContentNote(reopened.db, 'gone')).toBeNull();
    reopened.close();
  });

  it('keeps the same sense id on two lexemes apart from the notes table', () => {
    const dir = folder();
    const project = openProject(dir);
    const entry = {
      headword: 'run',
      senses: [{ id: 's1', definitions: [{ text: 'to move' }] }],
    };
    saveLexemeEntry(project.db, {
      id: 'left',
      entry,
      jieyu: {
        notes: [{ owner: 'entry', ref: 'left', text: 'kept' }],
        exampleRefs: [{ senseId: 's1', exampleIndex: 0, segmentId: 'seg-1' }],
      },
    });
    saveLexemeEntry(project.db, { id: 'right', entry });
    saveLexemeNote(project.db, {
      lexemeId: 'left',
      id: 'n1',
      senseId: 's1',
      content: { zh: '左' },
      category: 'fieldwork',
    });
    saveLexemeNote(project.db, {
      lexemeId: 'right',
      id: 'n1',
      senseId: 's1',
      content: { zh: '右' },
    });
    expect(listLexemeNotes(project.db, 'left')).toEqual([
      {
        id: 'n1',
        scope: 'sense',
        senseId: 's1',
        content: { zh: '左' },
        category: 'fieldwork',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
    expect(listLexemeNotes(project.db, 'right').map((note) => note.content)).toEqual([
      { zh: '右' },
    ]);
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 0 });
    project.close();

    const reopened = openProject(dir);
    const left = reopened.db.prepare('SELECT jieyu_json FROM lexemes WHERE id = ?').get('left') as {
      jieyu_json: string;
    };
    expect(JSON.parse(left.jieyu_json)).toMatchObject({
      notes: [{ owner: 'entry', ref: 'left', text: 'kept' }],
      exampleRefs: [{ senseId: 's1', exampleIndex: 0, segmentId: 'seg-1' }],
      anchoredNotes: [{ id: 'n1', content: { zh: '左' } }],
    });
    expect(() =>
      saveLexemeNote(reopened.db, {
        lexemeId: 'left',
        senseId: 'missing',
        content: { zh: '无' },
      }),
    ).toThrow('sense is missing');
    reopened.close();
  });

  it('reads unit, tier, and sense notes back through a new desktop session', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    project.db
      .prepare(
        `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES ('tr1', ?, 'translation', '你好', ?)`,
      )
      .run(unit.id, T);
    const entry = {
      headword: 'run',
      senses: [{ id: 's1', definitions: [{ text: 'to move' }] }],
    };
    saveLexemeEntry(project.db, { id: 'left', entry });
    saveLexemeEntry(project.db, { id: 'right', entry });
    project.close();

    const session = openDesktopSession(dir, [dir]);
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'unit-note',
      anchor: { kind: 'unit', unitId: unit.id },
      content: { zh: '语段' },
      category: 'comment',
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'timeline',
      anchor: { kind: 'unit', unitId: unit.id, view: 'timeline' },
      content: { zh: '时间轴' },
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'waveform',
      anchor: { kind: 'unit', unitId: unit.id, view: 'waveform' },
      content: { zh: '波形' },
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'comment',
      anchor: { kind: 'unit_text', unitTextId: 'tr1' },
      content: { zh: '评论' },
    });
    callDesktopSession(session.sessionId, 'notes.saveLexeme', {
      lexemeId: 'left',
      id: 'n1',
      senseId: 's1',
      content: { zh: '左' },
    });
    callDesktopSession(session.sessionId, 'notes.saveLexeme', {
      lexemeId: 'right',
      id: 'n1',
      senseId: 's1',
      content: { zh: '右' },
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'notes.create', {
        anchor: { kind: 'annotation', targetId: unit.id },
        content: { zh: '没有映射' },
      }),
    ).toThrow('note anchor is invalid');
    expect(
      callDesktopSession(session.sessionId, 'notes.list', { anchorKind: 'unit', unitId: unit.id }),
    ).toMatchObject([{ id: 'timeline' }, { id: 'unit-note' }, { id: 'waveform' }]);
    expect(
      callDesktopSession(session.sessionId, 'notes.listLexeme', { lexemeId: 'left' }),
    ).toMatchObject([{ content: { zh: '左' } }]);
    resetDesktopSessions();

    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'notes.list', { unitId: unit.id })).toMatchObject(
      [
        { id: 'comment', anchorKind: 'unit_text', unitTextId: 'tr1' },
        { id: 'timeline', anchorKind: 'unit', view: 'timeline' },
        { id: 'unit-note', content: { zh: '语段' }, category: 'comment', view: null },
        { id: 'waveform', anchorKind: 'unit', view: 'waveform' },
      ],
    );
    expect(
      callDesktopSession(reopened.sessionId, 'notes.listLexeme', { lexemeId: 'right' }),
    ).toMatchObject([{ content: { zh: '右' } }]);
    resetDesktopSessions();

    const stored = openProject(dir);
    expect(stored.db.prepare(`SELECT body FROM unit_texts WHERE id = 'tr1'`).get()).toEqual({
      body: '你好',
    });
    stored.close();
  });

  it('detaches notes for a deleted layer or text and drops them when the manuscript is cleared', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    const text = project.db.prepare(`SELECT id FROM unit_texts WHERE unit_id = ?`).get(unit.id) as {
      id: string;
    };
    createContentNote(project.db, {
      id: 'layer-note',
      anchor: { kind: 'layer', layerId: layer.id },
      content: { zh: '层' },
    });
    createContentNote(project.db, {
      id: 'text-note',
      anchor: { kind: 'unit_text', unitTextId: text.id },
      content: { zh: '正文' },
    });
    const other = project.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: 'ta',
    });
    writeAnalysisRoot(project.db, {
      unitId: other.id,
      expectedAnalysisGeneration: 0,
      graph: {
        payloadVersion: 1,
        id: 'g2',
        text: 'ta',
        nodes: [
          {
            id: 'shared',
            type: 'gloss',
            label: 'G',
          },
        ],
        relations: [],
      },
    });
    writeAnalysisRoot(project.db, {
      unitId: unit.id,
      expectedAnalysisGeneration: 0,
      graph: {
        payloadVersion: 1,
        id: 'g1',
        text: 'ka',
        nodes: [{ id: 'shared', type: 'gloss', label: 'G' }],
        relations: [],
      },
    });
    createContentNote(project.db, {
      id: 'node-a',
      anchor: { kind: 'analysis_node', unitId: unit.id, nodeId: 'shared' },
      content: { zh: '甲' },
    });
    createContentNote(project.db, {
      id: 'node-b',
      anchor: { kind: 'analysis_node', unitId: other.id, nodeId: 'shared' },
      content: { zh: '乙' },
    });
    detachAnalysisNotes(project.db, unit.id, ['shared'], T);
    expect(readContentNote(project.db, 'node-a')?.attachment).toBe('detached');
    expect(readContentNote(project.db, 'node-b')?.attachment).toBe('active');
    expect(
      listContentNotes(project.db, { unitId: other.id, nodeId: 'shared' }).map((note) => note.id),
    ).toEqual(['node-b']);
    detachNotesForDeletedTarget(project.db, { kind: 'unit_text', unitTextId: text.id }, T);
    expect(readContentNote(project.db, 'text-note')).toMatchObject({
      attachment: 'detached',
      content: { zh: '正文' },
    });
    detachNotesForDeletedTarget(project.db, { kind: 'layer', layerId: layer.id }, T);
    expect(readContentNote(project.db, 'layer-note')?.attachment).toBe('detached');
    deleteManuscriptNotes(project.db, manuscript.id);
    expect(listContentNotes(project.db)).toEqual([]);
    project.close();
  });

  it('rejects a library written before the note carrier', () => {
    const dir = folder();
    openProject(dir).close();
    const db = new Database(join(dir, 'project.sqlite'));
    db.exec('PRAGMA user_version = 14');
    db.close();
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
  });
});
