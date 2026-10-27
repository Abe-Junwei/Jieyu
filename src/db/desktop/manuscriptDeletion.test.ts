import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

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
