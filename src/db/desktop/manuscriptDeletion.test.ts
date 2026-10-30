import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { readContentNote, readStoredContentNote } from './notes';
import { applyAnalysis } from './analysis';
import { queryCorpus } from './corpusQuery';
import { readAnalysisMaterial } from './analysisCandidates';
import {
  acceptAnalysis,
  readAnalysisState,
  segmentUnitMorphemes,
  segmentUnitWords,
  submitAnalysis,
} from './analysisRestore';
import { readFieldValue, readStoredFieldValue } from './customFields';
import { getLayer } from './layers';
import { readLexemeLinks } from './referenceState';
import { listAcceptableRuns, startModelRun } from './modelRuns';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { createUnit, getUnit, readStoredUnit, updateBoundary } from './units';
import { splitUnit } from './unitSpan';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-manuscript-delete-'));
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

describe('manuscript mark delete', () => {
  it('hides lexeme links of a deleted manuscript and keeps the graph', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const words = callDesktopSession(session.sessionId, 'analysis.segmentWords', {
      unitId: unit.id,
    }) as { id: string }[];
    const word = words[0];
    if (word === undefined) throw new Error('word missing');
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'lex1',
      entry: {
        headword: 'keep',
        senses: [{ id: 's1', definitions: [{ text: 's1' }] }],
      },
    });
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: word.id,
      lexemeId: 'lex1',
      senseId: 's1',
    });
    expect(
      callDesktopSession(session.sessionId, 'lexicon.listTokenLinks', { unitId: unit.id }),
    ).toEqual([expect.objectContaining({ tokenId: word.id, lexemeId: 'lex1', senseId: 's1' })]);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    expect(
      callDesktopSession(session.sessionId, 'lexicon.listTokenLinks', { unitId: unit.id }),
    ).toEqual([]);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const row = db
      .prepare('SELECT analysis_graph_json AS graph FROM units WHERE id = ?')
      .get(unit.id) as { graph: string };
    db.close();
    expect(row.graph).toContain('linksLexeme');
  });

  it('hides a deleted manuscript, blocks its text, and leaves another manuscript writable', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const first = seed(session.sessionId, '文稿', media.id);
    const second = seed(session.sessionId, '另一份', media.id);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: first.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: second.layerId,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId: unit.id },
      content: { zh: '语段' },
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId: other.id },
      content: { zh: '另一份' },
    });
    expect(
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id }),
    ).toEqual([expect.objectContaining({ form: 'keep' })]);
    const deleted = callDesktopSession(session.sessionId, 'manuscripts.delete', {
      id: first.manuscriptId,
    }) as {
      deletedAt: string | null;
      retainUntil: string | null;
      reminderShownAt: string | null;
      lifecycleGeneration: number;
    };
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(deleted.lifecycleGeneration).toBe(1);
    expect(deleted.reminderShownAt).toBeNull();
    const retainUntil = new Date(String(deleted.deletedAt));
    retainUntil.setUTCDate(retainUntil.getUTCDate() + 90);
    expect(deleted.retainUntil).toBe(retainUntil.toISOString());
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: second.manuscriptId, deletedAt: null }),
    ]);
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toEqual([
      expect.objectContaining({ id: first.manuscriptId, lifecycleGeneration: 1 }),
    ]);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.delete', { id: first.manuscriptId }),
    ).toThrow('manuscript is deleted');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: unit.id, text: 'gone' }),
    ).toThrow('manuscript is deleted');
    expect(
      callDesktopSession(session.sessionId, 'layers.list', { manuscriptId: first.manuscriptId }),
    ).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'units.list', { layerId: first.layerId })).toEqual(
      [],
    );
    expect(
      callDesktopSession(session.sessionId, 'analysis.listWords', { unitId: unit.id }),
    ).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'notes.list', {})).toEqual([
      expect.objectContaining({ content: { zh: '另一份' } }),
    ]);
    expect(
      callDesktopSession(session.sessionId, 'layers.list', { manuscriptId: second.manuscriptId }),
    ).toEqual([expect.objectContaining({ id: second.layerId })]);
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: other.id, text: 'kept' }),
    ).toMatchObject({ text: 'kept' });
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: second.manuscriptId }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.listDeleted', {})).toEqual([
      expect.objectContaining({
        id: first.manuscriptId,
        deletedAt: deleted.deletedAt,
        retainUntil: deleted.retainUntil,
        reminderShownAt: null,
      }),
    ]);
    expect(
      callDesktopSession(reopened.sessionId, 'units.list', { layerId: first.layerId }),
    ).toEqual([]);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const body = db.prepare('SELECT body FROM unit_texts WHERE unit_id = ?').get(unit.id) as {
      body: string;
    };
    const words = db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unit.id) as {
      n: number;
    };
    db.close();
    expect(body).toEqual({ body: 'keep' });
    expect(words).toEqual({ n: 1 });
  });

  it('hides a deleted manuscript from getUnit and shows the unit again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(getUnit(db, unit.id)).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toBeNull();
    expect(readStoredUnit(db, unit.id)?.text).toBe('keep');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: unit.id, text: 'gone' }),
    ).toThrow('manuscript is deleted');
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(getUnit(db, unit.id)?.text).toBe('keep');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'keep',
    });
  });

  it('hides analysis state of a deleted manuscript and shows it again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => readAnalysisState(db, unit.id)).toThrow('manuscript is deleted');
    expect(() =>
      callDesktopSession(session.sessionId, 'analysis.readState', { unitId: unit.id }),
    ).toThrow('manuscript is deleted');
    expect(readAnalysisMaterial(db, unit.id).text).toBe('keep');
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(readAnalysisState(db, unit.id).text).toBe('keep');
    expect(
      callDesktopSession(session.sessionId, 'analysis.readState', { unitId: unit.id }),
    ).toMatchObject({ text: 'keep' });
  });

  it('hides a note on a deleted manuscript and shows it again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const note = callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId: unit.id },
      content: { zh: '语段' },
    }) as { id: string };
    const projectNote = callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'project' },
      content: { zh: '项目' },
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(readContentNote(db, note.id)).toBeNull();
    expect(callDesktopSession(session.sessionId, 'notes.list', {})).toEqual([
      expect.objectContaining({ id: projectNote.id, content: { zh: '项目' } }),
    ]);
    expect(readStoredContentNote(db, note.id)?.content).toEqual({ zh: '语段' });
    expect(() =>
      callDesktopSession(session.sessionId, 'notes.update', {
        id: note.id,
        content: { zh: 'gone' },
      }),
    ).toThrow('manuscript is deleted');
    expect(() => callDesktopSession(session.sessionId, 'notes.delete', { id: note.id })).toThrow(
      'manuscript is deleted',
    );
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(readContentNote(db, note.id)?.content).toEqual({ zh: '语段' });
    expect(callDesktopSession(session.sessionId, 'notes.list', {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: note.id, content: { zh: '语段' } }),
        expect.objectContaining({ id: projectNote.id, content: { zh: '项目' } }),
      ]),
    );
  });

  it('hides a field value on a deleted manuscript and shows it again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
      required: true,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: field.id,
      targetType: 'unit',
      targetId: unit.id,
      value: 'keep',
      expectedRevision: 1,
    });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(readFieldValue(db, field.id, 'unit', unit.id)).toBeNull();
    expect(
      callDesktopSession(session.sessionId, 'customFields.missingUnitFields', { unitId: unit.id }),
    ).toEqual([field.id]);
    expect(readStoredFieldValue(db, field.id, 'unit', unit.id)).toBe('keep');
    expect(
      callDesktopSession(session.sessionId, 'customFields.locateValues', {
        definitionId: field.id,
      }),
    ).toEqual([{ targetType: 'unit', targetId: unit.id }]);
    expect(() =>
      callDesktopSession(session.sessionId, 'customFields.setValue', {
        definitionId: field.id,
        targetType: 'unit',
        targetId: unit.id,
        value: 'gone',
        expectedRevision: 1,
      }),
    ).toThrow('manuscript is deleted');
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(readFieldValue(db, field.id, 'unit', unit.id)).toBe('keep');
    expect(
      callDesktopSession(session.sessionId, 'customFields.missingUnitFields', { unitId: unit.id }),
    ).toEqual([]);
  });

  it('drops a finished run from the acceptable list after delete and keeps it stale after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const run = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    const db = requireDesktopSession(session.sessionId).db;
    expect(listAcceptableRuns(db, seeded.manuscriptId)).toEqual([
      expect.objectContaining({ id: run.id }),
    ]);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.listAcceptable', {
        manuscriptId: seeded.manuscriptId,
      }),
    ).toEqual([expect.objectContaining({ id: run.id })]);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    expect(listAcceptableRuns(db, seeded.manuscriptId)).toEqual([]);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.listAcceptable', {
        manuscriptId: seeded.manuscriptId,
      }),
    ).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'modelRuns.get', { runId: run.id })).toMatchObject(
      {
        id: run.id,
        status: 'ok',
      },
    );
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(listAcceptableRuns(db, seeded.manuscriptId)).toEqual([]);
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-old',
        runId: run.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 0,
        mediaEnd: 1,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: candidate.targetFingerprint,
        text: 'late',
      }),
    ).toThrow('transcription run is stale');
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    const again = requireDesktopSession(reopened.sessionId).db;
    expect(listAcceptableRuns(again, seeded.manuscriptId)).toEqual([]);
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: run.id }),
    ).toMatchObject({ id: run.id, status: 'ok' });
    const fresh = callDesktopSession(reopened.sessionId, 'modelRuns.finish', {
      runId: start(reopened.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    expect(listAcceptableRuns(again, seeded.manuscriptId)).toEqual([
      expect.objectContaining({ id: fresh.id }),
    ]);
  });

  it('hides a layer of a deleted manuscript and shows it again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(getLayer(db, seeded.layerId)).toBeNull();
    expect(
      callDesktopSession(session.sessionId, 'layers.list', { manuscriptId: seeded.manuscriptId }),
    ).toEqual([]);
    expect(db.prepare('SELECT key FROM layers WHERE id = ?').get(seeded.layerId)).toEqual({
      key: '文稿',
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId: seeded.manuscriptId,
        key: 'late',
        name: { zh: '迟到' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      }),
    ).toThrow('manuscript is deleted');
    resetDesktopSessions();
    const closed = openDesktopSession(dir, [dir]);
    expect(getLayer(requireDesktopSession(closed.sessionId).db, seeded.layerId)).toBeNull();
    callDesktopSession(closed.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    const restored = requireDesktopSession(closed.sessionId).db;
    expect(getLayer(restored, seeded.layerId)?.key).toBe('文稿');
    expect(
      callDesktopSession(closed.sessionId, 'layers.list', { manuscriptId: seeded.manuscriptId }),
    ).toEqual([expect.objectContaining({ id: seeded.layerId })]);
    expect(
      callDesktopSession(closed.sessionId, 'layers.create', {
        manuscriptId: seeded.manuscriptId,
        key: 'after',
        name: { zh: '恢复' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      }),
    ).toMatchObject({ key: 'after' });
  });

  it('hides a lexeme link on a deleted manuscript and shows it again after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const other = seed(session.sessionId, '另一份', seeded.mediaId);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const otherUnit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: other.layerId,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    }) as { id: string };
    const word = (
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id }) as {
        id: string;
      }[]
    )[0];
    const otherWord = (
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: otherUnit.id }) as {
        id: string;
      }[]
    )[0];
    if (word === undefined || otherWord === undefined) throw new Error('word missing');
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'lex1',
      entry: { headword: 'keep', senses: [{ id: 's1', definitions: [{ text: 's1' }] }] },
    });
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: word.id,
      lexemeId: 'lex1',
      senseId: 's1',
    });
    callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
      tokenId: otherWord.id,
      lexemeId: 'lex1',
      senseId: 's1',
    });
    const db = requireDesktopSession(session.sessionId).db;
    expect(
      readLexemeLinks(db)
        .map((link) => link.targetId)
        .sort(),
    ).toEqual([word.id, otherWord.id].sort());
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    expect(readLexemeLinks(db).map((link) => link.targetId)).toEqual([otherWord.id]);
    expect(
      (
        callDesktopSession(session.sessionId, 'references.listLinks', {}) as { targetId: string }[]
      ).map((link) => link.targetId),
    ).toEqual([otherWord.id]);
    expect(
      db.prepare('SELECT target_id AS targetId FROM token_lexeme_links ORDER BY target_id').all(),
    ).toEqual(
      [{ targetId: otherWord.id }, { targetId: word.id }].sort((left, right) =>
        left.targetId < right.targetId ? -1 : 1,
      ),
    );
    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
        tokenId: word.id,
        lexemeId: 'lex1',
        senseId: 's1',
      }),
    ).toThrow('manuscript is deleted');
    resetDesktopSessions();
    const closed = openDesktopSession(dir, [dir]);
    const closedDb = requireDesktopSession(closed.sessionId).db;
    expect(readLexemeLinks(closedDb).map((link) => link.targetId)).toEqual([otherWord.id]);
    callDesktopSession(closed.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(
      readLexemeLinks(closedDb)
        .map((link) => link.targetId)
        .sort(),
    ).toEqual([word.id, otherWord.id].sort());
  });

  it('rejects a late word split while the manuscript is deleted and allows it after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => segmentUnitWords(db, unit.id)).toThrow('manuscript is deleted');
    expect(() =>
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id }),
    ).toThrow('manuscript is deleted');
    expect(
      db.prepare('SELECT analysis_graph_json AS graph FROM units WHERE id = ?').get(unit.id),
    ).toEqual({ graph: null });
    resetDesktopSessions();
    const closed = openDesktopSession(dir, [dir]);
    expect(() => segmentUnitWords(requireDesktopSession(closed.sessionId).db, unit.id)).toThrow(
      'manuscript is deleted',
    );
    callDesktopSession(closed.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(
      callDesktopSession(closed.sessionId, 'analysis.segmentWords', { unitId: unit.id }),
    ).toEqual([expect.objectContaining({ form: 'keep' })]);
  });

  it('rejects a late analysis edit while the manuscript is deleted and applies it after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id });
    const state = readAnalysisState(requireDesktopSession(session.sessionId).db, unit.id);
    const nodeId = state.graph?.nodes[0]?.id;
    if (nodeId === undefined) throw new Error('word missing');
    const expected = {
      manuscriptGeneration: state.manuscriptGeneration,
      analysisGeneration: state.analysisGeneration,
      graphFingerprint: state.graphFingerprint,
    };
    const change = { action: 'node.setMapValue', nodeId, field: 'gloss', key: 'zh', value: '保留' };
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => applyAnalysis(db, { unitId: unit.id, expected, changes: [change] })).toThrow(
      'manuscript is deleted',
    );
    expect(() =>
      callDesktopSession(session.sessionId, 'analysis.apply', {
        unitId: unit.id,
        expected,
        changes: [change],
      }),
    ).toThrow('manuscript is deleted');
    expect(
      db
        .prepare('SELECT graph_fingerprint AS graphFingerprint FROM units WHERE id = ?')
        .get(unit.id),
    ).toEqual({ graphFingerprint: state.graphFingerprint });
    resetDesktopSessions();
    const closed = openDesktopSession(dir, [dir]);
    expect(() =>
      applyAnalysis(requireDesktopSession(closed.sessionId).db, {
        unitId: unit.id,
        expected,
        changes: [change],
      }),
    ).toThrow('manuscript is deleted');
    callDesktopSession(closed.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(
      callDesktopSession(closed.sessionId, 'analysis.apply', {
        unitId: unit.id,
        expected,
        changes: [change],
      }),
    ).toMatchObject({
      root: {
        graph: {
          nodes: [
            expect.objectContaining({ domain: expect.objectContaining({ gloss: { zh: '保留' } }) }),
          ],
        },
      },
    });
  });

  it('refuses delete while a run is going, then makes that run stale across restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const running = start(session.sessionId, seeded);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId }),
    ).toThrow('manuscript has a running task');
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, lifecycleGeneration: 0, deletedAt: null }),
    ]);
    callDesktopSession(session.sessionId, 'modelRuns.interrupt', {});
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: running.id }),
    ).toMatchObject({ status: 'interrupted' });
    const run = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    const deleted = callDesktopSession(session.sessionId, 'manuscripts.delete', {
      id: seeded.manuscriptId,
    }) as { lifecycleGeneration: number };
    expect(deleted.lifecycleGeneration).toBe(1);
    expect(() =>
      accept(session.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    const restored = callDesktopSession(session.sessionId, 'manuscripts.restore', {
      id: seeded.manuscriptId,
    }) as { deletedAt: string | null; lifecycleGeneration: number };
    expect(restored).toMatchObject({
      deletedAt: null,
      retainUntil: null,
      reminderShownAt: null,
      lifecycleGeneration: 2,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is active');
    expect(() =>
      accept(session.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    const next = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const fresh = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: next.id,
      candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const freshCandidate = fresh.candidates[0];
    if (freshCandidate === undefined) throw new Error('preview missing');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-new',
        runId: next.id,
        chunkIndex: 1,
        segmentIndex: 0,
        mediaStart: 2,
        mediaEnd: 3,
        timeMappingRevision: fresh.timeMappingRevision,
        targetFingerprint: freshCandidate.targetFingerprint,
        text: 'after',
      }),
    ).toMatchObject({ text: 'after' });
    const written = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 4,
      endTime: 5,
      text: 'hand',
    }) as { id: string };
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', {
        unitId: written.id,
        text: 'handed',
      }),
    ).toMatchObject({ text: 'handed' });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, lifecycleGeneration: 2, deletedAt: null }),
    ]);
    expect(
      callDesktopSession(session.sessionId, 'units.list', { layerId: seeded.layerId }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'after' }),
        expect.objectContaining({ text: 'handed' }),
      ]),
    );
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const row = db
      .prepare(
        `SELECT generation, lifecycle_generation AS lifecycleGeneration, deleted_at AS deletedAt,
                retain_until AS retainUntil, reminder_shown_at AS reminderShownAt
         FROM manuscripts WHERE id = ?`,
      )
      .get(seeded.manuscriptId) as {
      generation: number;
      lifecycleGeneration: number;
      deletedAt: string | null;
      retainUntil: string | null;
      reminderShownAt: string | null;
    };
    db.close();
    expect(row).toEqual({
      generation: 1,
      lifecycleGeneration: 2,
      deletedAt: null,
      retainUntil: null,
      reminderShownAt: null,
    });
  });

  it('rejects a deletion mark that has no retain-until', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'));
    expect(() =>
      db
        .prepare('UPDATE manuscripts SET deleted_at = ? WHERE id = ?')
        .run('2026-10-27T00:00:00.000Z', seeded.manuscriptId),
    ).toThrow(/CHECK constraint failed/);
    db.close();
  });

  it('deletes a recording and only lengthens manuscript deadlines', () => {
    const dir = folder();
    writeFileSync(join(dir, 'b.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const early = seed(session.sessionId, '较早');
    const current = seed(session.sessionId, '当前', early.mediaId);
    const otherMedia = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 8,
    }) as { id: string };
    const other = seed(session.sessionId, '别的', otherMedia.id);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: early.manuscriptId });
    resetDesktopSessions();
    const setup = new Database(join(dir, 'project.sqlite'));
    setup
      .prepare('UPDATE manuscripts SET retain_until = ? WHERE id = ?')
      .run('2099-01-01T00:00:00.000Z', early.manuscriptId);
    setup.close();

    const reopened = openDesktopSession(dir, [dir]);
    const deleted = callDesktopSession(reopened.sessionId, 'media.delete', {
      id: early.mediaId,
    }) as { deletedAt: string; retainUntil: string; reminderShownAt: null };
    expect(deleted.reminderShownAt).toBeNull();
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: other.manuscriptId, deletedAt: null }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.listDeleted', {})).toEqual([
      expect.objectContaining({
        id: early.manuscriptId,
        retainUntil: '2099-01-01T00:00:00.000Z',
      }),
      expect.objectContaining({ id: current.manuscriptId, retainUntil: deleted.retainUntil }),
    ]);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const media = db
      .prepare('SELECT relpath, deleted_at AS deletedAt FROM media WHERE id = ?')
      .get(early.mediaId) as { relpath: string; deletedAt: string | null };
    db.close();
    expect(media).toEqual({ relpath: 'a.wav', deletedAt: deleted.deletedAt });
  });

  it('stops only the targeted running transcription and leaves the delete mark for a later call', () => {
    const dir = folder();
    writeFileSync(join(dir, 'b.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const early = seed(session.sessionId, '较早');
    const current = seed(session.sessionId, '当前', early.mediaId);
    const otherMedia = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 8,
    }) as { id: string };
    const other = seed(session.sessionId, '别的', otherMedia.id);
    const earlyRun = start(session.sessionId, early);
    const currentRun = start(session.sessionId, current);
    const otherRun = start(session.sessionId, other);
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.stopManuscript', { id: 'missing' }),
    ).toThrow('manuscript is missing');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: earlyRun.id }),
    ).toMatchObject({
      status: 'running',
    });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.stopManuscript', { id: early.manuscriptId }),
    ).toMatchObject([{ id: earlyRun.id, status: 'interrupted' }]);
    expect(() =>
      callDesktopSession(session.sessionId, 'media.delete', { id: early.mediaId }),
    ).toThrow('manuscript has a running task');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: earlyRun.id }),
    ).toMatchObject({
      status: 'interrupted',
    });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: currentRun.id }),
    ).toMatchObject({
      status: 'running',
    });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.stopRecording', { id: early.mediaId }),
    ).toMatchObject([{ id: currentRun.id, status: 'interrupted' }]);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: otherRun.id }),
    ).toMatchObject({
      status: 'running',
    });
    callDesktopSession(session.sessionId, 'media.delete', { id: early.mediaId });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: earlyRun.id }),
    ).toMatchObject({
      status: 'interrupted',
    });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: otherRun.id }),
    ).toMatchObject({
      status: 'running',
    });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: other.manuscriptId, deletedAt: null }),
    ]);
  });

  it('rejects the pre-delete run after restore and still accepts a new one', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const other = seed(session.sessionId, '另一份', seeded.mediaId);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'saved',
    }) as { id: string };
    const otherUnit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: other.layerId,
      startTime: 0,
      endTime: 1,
      text: 'other',
    }) as { id: string };
    const running = start(session.sessionId, seeded);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId }),
    ).toThrow('manuscript has a running task');
    expect(() =>
      callDesktopSession(session.sessionId, 'media.delete', { id: seeded.mediaId }),
    ).toThrow('manuscript has a running task');
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seeded.manuscriptId,
          deletedAt: null,
          lifecycleGeneration: 0,
        }),
        expect.objectContaining({ id: other.manuscriptId, deletedAt: null }),
      ]),
    );
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: unit.id, text: 'kept' }),
    ).toMatchObject({ text: 'kept' });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.stopManuscript', {
        id: seeded.manuscriptId,
      }),
    ).toMatchObject([{ id: running.id, status: 'interrupted' }]);
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.finish', {
        runId: running.id,
        status: 'ok',
        chunkCount: 1,
      }),
    ).toThrow('transcription run is not running');
    const run = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: unit.id, text: 'gone' }),
    ).toThrow('manuscript is deleted');
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', {
        unitId: otherUnit.id,
        text: 'other-kept',
      }),
    ).toMatchObject({ text: 'other-kept' });
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.preview', {
        runId: run.id,
        candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
      }),
    ).toThrow('transcription run is stale');
    expect(() =>
      accept(session.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    resetDesktopSessions();
    const closed = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const body = closed.prepare('SELECT body FROM unit_texts WHERE unit_id = ?').get(unit.id) as {
      body: string;
    };
    closed.close();
    expect(body).toEqual({ body: 'kept' });

    const reopened = openDesktopSession(dir, [dir]);
    callDesktopSession(reopened.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(
      callDesktopSession(reopened.sessionId, 'units.updateText', {
        unitId: unit.id,
        text: 'rewritten',
      }),
    ).toMatchObject({ text: 'rewritten' });
    expect(() =>
      accept(reopened.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    const next = callDesktopSession(reopened.sessionId, 'modelRuns.finish', {
      runId: start(reopened.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const fresh = callDesktopSession(reopened.sessionId, 'modelRuns.preview', {
      runId: next.id,
      candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const freshCandidate = fresh.candidates[0];
    if (freshCandidate === undefined) throw new Error('preview missing');
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.accept', {
        operationId: 'op-new',
        runId: next.id,
        chunkIndex: 1,
        segmentIndex: 0,
        mediaStart: 2,
        mediaEnd: 3,
        timeMappingRevision: fresh.timeMappingRevision,
        targetFingerprint: freshCandidate.targetFingerprint,
        text: 'after',
      }),
    ).toMatchObject({ text: 'after' });
    resetDesktopSessions();
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.list', { layerId: seeded.layerId })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'rewritten' }),
        expect.objectContaining({ text: 'after' }),
      ]),
    );
  });

  it('rejects manuscript-owned link, batch, acceptance, and note writes while deleted', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const other = seed(session.sessionId, '另一份', seeded.mediaId);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const otherUnit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: other.layerId,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    }) as { id: string };
    const word = (
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id }) as {
        id: string;
      }[]
    )[0];
    const otherWord = (
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: otherUnit.id }) as {
        id: string;
      }[]
    )[0];
    if (word === undefined || otherWord === undefined) throw new Error('word missing');
    const note = callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId: unit.id },
      content: { zh: '语段' },
    }) as { id: string };
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'note',
      name: { zh: '注' },
      fieldType: 'text',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'lex1',
      entry: { headword: 'keep', senses: [{ id: 's1', definitions: [{ text: 's1' }] }] },
    });
    const run = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const db = requireDesktopSession(session.sessionId).db;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO morphemes (
        id, token_id, morpheme_index, form_json, gloss_json, surface_parts_json, created_at, updated_at
      ) VALUES ('m1', ?, 0, '{}', '{}', '[]', ?, ?)`,
    ).run(word.id, now, now);
    db.prepare(
      `INSERT INTO reception_batches (id, unit_id, source_kind, created_at) VALUES ('batch-kept', ?, 'manual', ?)`,
    ).run(unit.id, now);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });

    expect(() =>
      callDesktopSession(session.sessionId, 'lexicon.replaceTokenLink', {
        tokenId: word.id,
        lexemeId: 'lex1',
        senseId: 's1',
      }),
    ).toThrow('manuscript is deleted');
    expect(() =>
      db
        .prepare(
          `INSERT INTO token_lexeme_links (
            id, target_type, target_id, lexeme_id, created_at, updated_at
          ) VALUES ('link-deleted', 'token', ?, 'lex1', ?, ?)`,
        )
        .run(word.id, now, now),
    ).toThrow('manuscript is deleted');
    expect(() =>
      db
        .prepare(
          `INSERT INTO token_lexeme_links (
            id, target_type, target_id, lexeme_id, created_at, updated_at
          ) VALUES ('link-morpheme', 'morpheme', 'm1', 'lex1', ?, ?)`,
        )
        .run(now, now),
    ).toThrow('manuscript is deleted');
    expect(() =>
      db
        .prepare(
          `INSERT INTO reception_batches (id, unit_id, source_kind, created_at) VALUES ('batch-new', ?, 'manual', ?)`,
        )
        .run(unit.id, now),
    ).toThrow('manuscript is deleted');
    expect(() =>
      db
        .prepare(
          `INSERT INTO local_id_map (batch_id, scope, local_id, project_id) VALUES ('batch-kept', 'node', 'local', 'project')`,
        )
        .run(),
    ).toThrow('manuscript is deleted');
    expect(() =>
      db
        .prepare(
          `INSERT INTO transcription_acceptances (
            id, operation_id, run_id, candidate_id, unit_id, created_at
          ) VALUES ('acc-1', 'op-1', ?, 'cand', ?, ?)`,
        )
        .run(run.id, unit.id, now),
    ).toThrow('manuscript is deleted');
    expect(() =>
      callDesktopSession(session.sessionId, 'customFields.setValue', {
        definitionId: field.id,
        targetType: 'note',
        targetId: note.id,
        value: 'late',
        expectedRevision: 1,
      }),
    ).toThrow('manuscript is deleted');
    db.prepare(
      `INSERT INTO token_lexeme_links (
        id, target_type, target_id, lexeme_id, created_at, updated_at
      ) VALUES ('link-other', 'token', ?, 'lex1', ?, ?)`,
    ).run(otherWord.id, now, now);

    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    db.prepare(
      `INSERT INTO reception_batches (id, unit_id, source_kind, created_at) VALUES ('batch-after', ?, 'manual', ?)`,
    ).run(unit.id, now);
    expect(
      callDesktopSession(session.sessionId, 'customFields.setValue', {
        definitionId: field.id,
        targetType: 'note',
        targetId: note.id,
        value: 'after',
        expectedRevision: 1,
      }),
    ).toMatchObject({ value: 'after' });
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM reception_batches WHERE id = 'batch-after'`).get(),
    ).toEqual({ n: 1 });
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM token_lexeme_links WHERE id = 'link-deleted'`).get(),
    ).toEqual({ n: 0 });
  });

  it('refuses a recording delete while a manuscript run is going', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    start(session.sessionId, seeded);
    expect(() =>
      callDesktopSession(session.sessionId, 'media.delete', { id: seeded.mediaId }),
    ).toThrow('manuscript has a running task');
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, deletedAt: null }),
    ]);
  });

  it('rejects the remaining manuscript writes while deleted and allows a new unit after restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const left = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 0,
      endTime: 1,
      text: 'a-b',
    }) as { id: string };
    const right = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 1,
      endTime: 2,
      text: 'stay',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: left.id });
    const db = requireDesktopSession(session.sessionId).db;
    const state = readAnalysisState(db, left.id);
    const graph = readAnalysisMaterial(db, left.id).graph;
    const suggestion = {
      unitId: left.id,
      graph,
      expected: {
        manuscriptGeneration: state.manuscriptGeneration,
        analysisGeneration: state.analysisGeneration,
        graphFingerprint: state.graphFingerprint,
      },
      definitionRevisions: state.definitionRevisions,
    };
    const pending = submitAnalysis(db, suggestion);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    const rejected: [string, Record<string, unknown>][] = [
      ['units.create', { layerId: seeded.layerId, startTime: 2, endTime: 3, text: 'late' }],
      ['units.updateBoundary', { leftId: left.id, rightId: right.id, time: 0.5 }],
      ['units.split', { unitId: left.id, time: 0.5 }],
      ['units.merge', { keepId: left.id, removeId: right.id }],
      ['notes.create', { anchor: { kind: 'unit', unitId: left.id }, content: { zh: '迟到' } }],
      [
        'modelRuns.start',
        {
          manuscriptId: seeded.manuscriptId,
          layerId: seeded.layerId,
          modelId: 'local.whisper',
          modelVersion: '1',
          manifestSha256: 'abc',
          params: {},
          rangeStart: 0,
          rangeEnd: 8,
        },
      ],
      [
        'manuscripts.setTimeMapping',
        { manuscriptId: seeded.manuscriptId, expectedRevision: 0, offsetSec: 1, scale: 1 },
      ],
      ['analysis.segmentMorphemes', { unitId: left.id }],
    ];
    for (const [method, args] of rejected) {
      expect(() => callDesktopSession(session.sessionId, method, args), method).toThrow(
        'manuscript is deleted',
      );
    }
    expect(() =>
      createUnit(db, { layerId: seeded.layerId, startTime: 2, endTime: 3, text: 'late' }),
    ).toThrow('manuscript is deleted');
    expect(() => updateBoundary(db, { leftId: left.id, rightId: right.id, time: 0.5 })).toThrow(
      'manuscript is deleted',
    );
    expect(() => splitUnit(db, { unitId: left.id, time: 0.5 })).toThrow('manuscript is deleted');
    expect(() => segmentUnitMorphemes(db, left.id)).toThrow('manuscript is deleted');
    expect(() => submitAnalysis(db, suggestion)).toThrow('manuscript is deleted');
    expect(() => callDesktopSession(session.sessionId, 'analysis.submit', suggestion)).toThrow(
      'manuscript is deleted',
    );
    expect(() =>
      acceptAnalysis(db, { candidateId: pending.id, expected: suggestion.expected }),
    ).toThrow('analysis candidate is stale');
    expect(() =>
      callDesktopSession(session.sessionId, 'analysis.accept', {
        candidateId: pending.id,
        expected: suggestion.expected,
      }),
    ).toThrow('analysis candidate is stale');
    expect(() =>
      startModelRun(db, {
        manuscriptId: seeded.manuscriptId,
        layerId: seeded.layerId,
        modelId: 'local.whisper',
        modelVersion: '1',
        manifestSha256: 'abc',
        params: {},
        rangeStart: 0,
        rangeEnd: 8,
      }),
    ).toThrow('manuscript is deleted');
    expect(
      queryCorpus(db, {
        manuscriptId: seeded.manuscriptId,
        text: 'a-b',
        form: null,
        gloss: null,
        pos: null,
        lexemeId: null,
        senseId: null,
        limit: 10,
        cursor: null,
      }),
    ).toEqual({
      items: [],
      hasMore: false,
    });
    expect(
      callDesktopSession(session.sessionId, 'corpus.query', {
        manuscriptId: seeded.manuscriptId,
        text: 'a-b',
        limit: 10,
      }),
    ).toEqual({ items: [], hasMore: false });
    expect(db.prepare('SELECT end_time AS endTime FROM units WHERE id = ?').get(left.id)).toEqual({
      endTime: 1,
    });
    resetDesktopSessions();
    const closed = openDesktopSession(dir, [dir]);
    expect(() =>
      callDesktopSession(closed.sessionId, 'units.split', { unitId: left.id, time: 0.5 }),
    ).toThrow('manuscript is deleted');
    callDesktopSession(closed.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(closed.sessionId, 'analysis.accept', {
        candidateId: pending.id,
        expected: suggestion.expected,
      }),
    ).toThrow('analysis candidate is stale');
    expect(
      callDesktopSession(closed.sessionId, 'units.create', {
        layerId: seeded.layerId,
        startTime: 2,
        endTime: 3,
        text: 'after',
      }),
    ).toMatchObject({ text: 'after' });
    expect(
      callDesktopSession(closed.sessionId, 'corpus.query', {
        manuscriptId: seeded.manuscriptId,
        text: 'a-b',
        limit: 10,
      }),
    ).toMatchObject({ items: [expect.objectContaining({ unitId: left.id })] });
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

function start(
  sessionId: string,
  seeded: { manuscriptId: string; layerId: string },
): { id: string; status: string } {
  return callDesktopSession(sessionId, 'modelRuns.start', {
    manuscriptId: seeded.manuscriptId,
    layerId: seeded.layerId,
    modelId: 'local.whisper',
    modelVersion: '1',
    manifestSha256: 'abc',
    params: {},
    rangeStart: 0,
    rangeEnd: 8,
  }) as { id: string; status: string };
}

function accept(
  sessionId: string,
  runId: string,
  timeMappingRevision: number,
  targetFingerprint: string,
): void {
  callDesktopSession(sessionId, 'modelRuns.accept', {
    operationId: 'op-old',
    runId,
    chunkIndex: 0,
    segmentIndex: 0,
    mediaStart: 0,
    mediaEnd: 1,
    timeMappingRevision,
    targetFingerprint,
    text: 'late',
  });
}
