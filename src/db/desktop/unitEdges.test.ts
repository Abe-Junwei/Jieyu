import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDesktopSession } from './desktopCall';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-edges-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  vi.useRealTimers();
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function layer(sessionId: string, media: boolean): string {
  const mediaId = media
    ? (
        callDesktopSession(sessionId, 'media.create', {
          relpath: 'a.wav',
          sha256: 'aa',
          duration: 3,
        }) as { id: string }
      ).id
    : null;
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId,
  }) as { id: string };
  return (
    callDesktopSession(sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string }
  ).id;
}

function unit(
  sessionId: string,
  layerId: string,
  startMs: number,
  endMs: number,
  text: string,
): string {
  return (
    callDesktopSession(sessionId, 'units.create', {
      layerId,
      startMs,
      endMs,
      text,
    }) as { id: string }
  ).id;
}

describe('desktop unit edges', () => {
  it('writes one edge, rejects overlap and a short span, and skips the range without media', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const layerId = layer(session.sessionId, true);
    expect(() => unit(session.sessionId, layerId, 0, 4000, '越')).toThrow(
      'edge is outside the media',
    );
    expect(unit(session.sessionId, layerId, 2500, 2600, '')).toEqual(expect.any(String));
    const left = unit(session.sessionId, layerId, 0, 1000, '前');
    const right = unit(session.sessionId, layerId, 1000, 2000, '后');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveEdge', {
        unitId: left,
        edge: 'end',
        time: 1500,
      }),
    ).toThrow('same speaker intervals overlap');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: left })).toMatchObject({
      endMs: 1000,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveEdge', {
        unitId: left,
        edge: 'end',
        time: 5,
      }),
    ).toThrow('edge span is under 10ms');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveEdge', {
        unitId: right,
        edge: 'end',
        time: 4000,
      }),
    ).toThrow('edge is outside the media');

    const moved = callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: right,
      edge: 'end',
      time: 2500,
    }) as { endMs: number };
    expect(moved.endMs).toBe(2500);
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.get', { id: right })).toMatchObject({
      endMs: 2500,
    });
    expect(() => callDesktopSession(again.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );

    const bare = layer(again.sessionId, false);
    const free = unit(again.sessionId, bare, 0, 1000, '无');
    expect(
      callDesktopSession(again.sessionId, 'units.moveEdge', {
        unitId: free,
        edge: 'end',
        time: 9000,
      }),
    ).toMatchObject({ endMs: 9000 });
  });

  it('moves a shared boundary only when the edges already touch', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const layerId = layer(session.sessionId, true);
    const left = unit(session.sessionId, layerId, 0, 1000, '前');
    const right = unit(session.sessionId, layerId, 1200, 2000, '后');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveSharedBoundary', {
        leftId: left,
        rightId: right,
        time: 1100,
      }),
    ).toThrow('boundary units are not adjacent');
    callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: right,
      edge: 'start',
      time: 1000,
    });
    expect(
      callDesktopSession(session.sessionId, 'units.moveSharedBoundary', {
        leftId: left,
        rightId: right,
        time: 1400,
      }),
    ).toEqual({
      left: expect.objectContaining({ endMs: 1400 }),
      right: expect.objectContaining({ startMs: 1400 }),
    });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, endMs: 1000 }),
      expect.objectContaining({ id: right, startMs: 1000 }),
    ]);
  });

  it('undoes and redoes a single edge move and reads the time back', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = unit(session.sessionId, layer(session.sessionId, true), 0, 1000, '句');
    callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: id,
      edge: 'end',
      time: 1500,
    });
    callDesktopSession(session.sessionId, 'units.undo', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toMatchObject({
      endMs: 1000,
    });
    callDesktopSession(session.sessionId, 'units.redo', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toMatchObject({
      endMs: 1500,
    });
  });

  it('keeps a time draft across reopen without changing the official time', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = unit(session.sessionId, layer(session.sessionId, true), 0, 1000, '句');
    callDesktopSession(session.sessionId, 'units.putTimeDraft', {
      unitId: id,
      edge: 'end',
      rawInput: '00:00:01.',
      baseMs: 1000,
      issue: null,
    });
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.get', { id })).toMatchObject({
      startMs: 0,
      endMs: 1000,
    });
    expect(callDesktopSession(again.sessionId, 'units.readTimeDraft', { unitId: id })).toEqual([
      expect.objectContaining({ edge: 'end', rawInput: '00:00:01.', baseMs: 1000 }),
    ]);
  });

  it('restores a deleted unit with the same id, and redo puts the edge back', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = unit(session.sessionId, layer(session.sessionId, true), 0, 1000, '句');
    callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: id,
      edge: 'end',
      time: 1600,
    });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({
      id,
      endMs: 1000,
    });
    expect(callDesktopSession(session.sessionId, 'units.redo', {})).toMatchObject({
      id,
      endMs: 1600,
    });
    expect(callDesktopSession(session.sessionId, 'units.deletePreview', { unitId: id })).toEqual({
      fingerprint: expect.any(String),
      linkedTexts: 0,
      tokens: 0,
      morphemes: 0,
      notes: 0,
      lexemeLinks: 0,
      analysisCandidates: 0,
      customFieldValues: 0,
      drafts: 0,
      receptionRecords: 0,
    });
    expect(callDesktopSession(session.sessionId, 'units.delete', { unitId: id })).toEqual({ id });
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({
      id,
      text: '句',
      endMs: 1600,
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toMatchObject({
      id,
      text: '句',
    });
  });
  it('counts only non-empty texts of linked layers in the delete preview', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = session.sessionId;
    const tx = layer(id, true);
    const manuscriptId = (
      requireDesktopSession(id)
        .db.prepare('SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?')
        .get(tx) as { manuscriptId: string }
    ).manuscriptId;
    const tl = (
      callDesktopSession(id, 'layers.create', {
        manuscriptId,
        key: 'tl',
        name: { zh: '翻译' },
        tierType: 'symbolic-association',
        contentType: 'translation',
        hosts: [{ hostLayerId: tx }],
      }) as { id: string }
    ).id;
    const host = unit(id, tx, 0, 1000, '句');
    const linked = () =>
      (callDesktopSession(id, 'units.deletePreview', { unitId: host }) as { linkedTexts: number })
        .linkedTexts;
    expect(linked()).toBe(0);
    callDesktopSession(id, 'units.updateText', { unitId: host, textLayerId: tl, text: 'gloss' });
    expect(linked()).toBe(1);
    callDesktopSession(id, 'units.updateText', { unitId: host, textLayerId: tl, text: '' });
    expect(linked()).toBe(0);
  });
  it('deletes selected units in one transaction and restores them in one undo step', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const layerId = layer(session.sessionId, true);
    const first = unit(session.sessionId, layerId, 0, 500, 'one');
    const second = unit(session.sessionId, layerId, 500, 1000, 'two');
    const preview = callDesktopSession(session.sessionId, 'units.deleteManyPreview', {
      unitIds: [first, second],
    }) as { linkedTexts: number; fingerprint: string };
    expect(preview).toMatchObject({ linkedTexts: 0 });
    expect(typeof preview.fingerprint).toBe('string');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.deleteMany', {
        unitIds: [first, 'missing'],
      }),
    ).toThrow();
    expect(callDesktopSession(session.sessionId, 'units.get', { id: first })).not.toBeNull();
    expect(
      callDesktopSession(session.sessionId, 'units.deleteMany', {
        unitIds: [first, second],
        fingerprint: preview.fingerprint,
      }),
    ).toEqual({ ids: [first, second] });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: first })).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.get', { id: second })).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: first, text: 'one' }),
      expect.objectContaining({ id: second, text: 'two' }),
    ]);
    expect(callDesktopSession(session.sessionId, 'units.redo', {})).toHaveLength(2);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: first })).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.get', { id: second })).toBeNull();
    closeDesktopSession(session.sessionId);
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'units.get', { id: first })).toBeNull();
    expect(callDesktopSession(reopened.sessionId, 'units.get', { id: second })).toBeNull();
  });

  it('rejects structure delete when the preview fingerprint no longer matches', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const layerId = layer(session.sessionId, true);
    const first = unit(session.sessionId, layerId, 0, 500, 'one');
    const second = unit(session.sessionId, layerId, 500, 1000, 'two');
    const preview = callDesktopSession(session.sessionId, 'units.deleteManyPreview', {
      unitIds: [first, second],
    }) as { fingerprint: string };
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: first,
      text: 'changed',
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'units.deleteMany', {
        unitIds: [first, second],
        fingerprint: preview.fingerprint,
      }),
    ).toThrow(/unit delete preview is stale/);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: first })).toMatchObject({
      text: 'changed',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: second })).not.toBeNull();
    closeDesktopSession(session.sessionId);
  });
  it('moves a whole segment with its subdivision children as one undoable step', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = session.sessionId;
    const tx = layer(id, true);
    const manuscriptId = (
      requireDesktopSession(id)
        .db.prepare('SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?')
        .get(tx) as { manuscriptId: string }
    ).manuscriptId;
    const sub = (
      callDesktopSession(id, 'layers.create', {
        manuscriptId,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: tx }],
      }) as { id: string }
    ).id;
    const parent = unit(id, tx, 0, 1500, '父');
    const next = unit(id, tx, 2000, 2800, '后');
    const child = (startMs: number, endMs: number) =>
      (
        callDesktopSession(id, 'units.create', {
          layerId: sub,
          parentUnitId: parent,
          startMs,
          endMs,
          text: '',
        }) as { id: string }
      ).id;
    const a = child(100, 700);
    const b = child(800, 1400);
    const get = (unitId: string) =>
      callDesktopSession(id, 'units.get', { id: unitId }) as { startMs: number; endMs: number };
    const move = (delta: number, operationId?: string) =>
      callDesktopSession(id, 'units.moveUnit', {
        unitId: parent,
        delta,
        ...(operationId === undefined ? {} : { operationId }),
      });
    expect(() => move(-100)).toThrow('edge is outside the media');
    expect(() => move(700)).toThrow('same speaker intervals overlap');
    expect(get(parent)).toMatchObject({ startMs: 0, endMs: 1500 });
    expect(get(a)).toMatchObject({ startMs: 100, endMs: 700 });
    expect(() => callDesktopSession(id, 'units.moveUnit', { unitId: b, delta: 200 })).toThrow(
      'time subdivision is outside its parent',
    );
    const operationId = globalThis.crypto.randomUUID();
    move(400, operationId);
    expect(move(400, operationId)).toMatchObject({ startMs: 400, endMs: 1900 });
    expect(get(a)).toMatchObject({ startMs: 500, endMs: 1100 });
    expect(get(b)).toMatchObject({ startMs: 1200, endMs: 1800 });
    expect(get(next)).toMatchObject({ startMs: 2000 });
    closeDesktopSession(id);
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.get', { id: b })).toMatchObject({
      startMs: 1200,
      endMs: 1800,
    });
    callDesktopSession(again.sessionId, 'units.moveUnit', { unitId: parent, delta: -400 });
    callDesktopSession(again.sessionId, 'units.undo', {});
    expect(callDesktopSession(again.sessionId, 'units.get', { id: a })).toMatchObject({
      startMs: 500,
    });
    callDesktopSession(again.sessionId, 'units.redo', {});
    expect(callDesktopSession(again.sessionId, 'units.get', { id: a })).toMatchObject({
      startMs: 100,
    });
    callDesktopSession(again.sessionId, 'units.undo', {});
    expect(callDesktopSession(again.sessionId, 'units.get', { id: parent })).toMatchObject({
      startMs: 400,
    });
  });

  it('keeps a subdivision child inside its parent and pushes children with a parent edge', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = session.sessionId;
    const tx = layer(id, true);
    const manuscriptId = (
      requireDesktopSession(id)
        .db.prepare('SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?')
        .get(tx) as { manuscriptId: string }
    ).manuscriptId;
    const sub = (
      callDesktopSession(id, 'layers.create', {
        manuscriptId,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: tx }],
      }) as { id: string }
    ).id;
    const parent = unit(id, tx, 0, 2000, '父');
    const child = (startMs: number, endMs: number) =>
      (
        callDesktopSession(id, 'units.create', {
          layerId: sub,
          parentUnitId: parent,
          startMs,
          endMs,
          text: '',
        }) as { id: string }
      ).id;
    const a = child(100, 800);
    const b = child(900, 1900);
    const get = (unitId: string) =>
      callDesktopSession(id, 'units.get', { id: unitId }) as { startMs: number; endMs: number };
    expect(() =>
      callDesktopSession(id, 'units.moveEdge', { unitId: b, edge: 'end', time: 2100 }),
    ).toThrow('time subdivision is outside its parent');
    expect(() =>
      callDesktopSession(id, 'units.moveEdge', { unitId: parent, edge: 'start', time: 850 }),
    ).toThrow('edge span is under 10ms');
    callDesktopSession(id, 'units.moveEdge', { unitId: parent, edge: 'end', time: 1500 });
    expect(get(b)).toMatchObject({ startMs: 900, endMs: 1500 });
    callDesktopSession(id, 'units.moveEdge', { unitId: parent, edge: 'start', time: 300 });
    expect(get(a)).toMatchObject({ startMs: 300, endMs: 800 });
    expect(() => callDesktopSession(id, 'units.delete', { unitId: parent })).toThrow(
      'unit has time subdivisions',
    );
    expect(get(parent)).toMatchObject({ startMs: 300 });
    callDesktopSession(id, 'units.undo', {});
    expect(get(a)).toMatchObject({ startMs: 100, endMs: 800 });
    callDesktopSession(id, 'units.undo', {});
    expect(get(b)).toMatchObject({ startMs: 900, endMs: 1900 });
    callDesktopSession(id, 'units.redo', {});
    expect(get(b)).toMatchObject({ endMs: 1500 });
    callDesktopSession(id, 'units.delete', { unitId: a });
    expect(callDesktopSession(id, 'units.get', { id: a })).toBeNull();
    expect(get(parent)).toMatchObject({ startMs: 0, endMs: 1500 });
    expect(get(b)).toMatchObject({ endMs: 1500 });
    callDesktopSession(id, 'units.undo', {});
    expect(get(a)).toMatchObject({ startMs: 100, endMs: 800 });
    callDesktopSession(id, 'units.redo', {});
    closeDesktopSession(id);
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.get', { id: a })).toBeNull();
    expect(
      callDesktopSession(again.sessionId, 'units.get', { id: b }) as { endMs: number },
    ).toMatchObject({ endMs: 1500 });
  });
});

describe('layer-scoped clear through desktop calls', () => {
  it('undoes and redoes clear after a later text edit is undone, and persists on reopen', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T00:00:00Z'));
    const root = folder();
    const { sessionId } = openDesktopSession(root, [root]);
    const host = layer(sessionId, false);
    const manuscriptId = (
      requireDesktopSession(sessionId)
        .db.prepare('SELECT manuscript_id FROM layers WHERE id = ?')
        .get(host) as {
        manuscript_id: string;
      }
    ).manuscript_id;
    const linked = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId,
        key: 'translation',
        name: { zh: '翻译' },
        tierType: 'symbolic-association',
        contentType: 'translation',
        hosts: [{ hostLayerId: host }],
      }) as { id: string }
    ).id;
    const id = unit(sessionId, host, 0, 1000, '原文');
    const target = { unitId: id, textLayerId: linked };
    callDesktopSession(sessionId, 'units.updateText', { ...target, text: 'original' });
    const preview = callDesktopSession(sessionId, 'units.deletePreview', target) as {
      fingerprint: string;
    };
    callDesktopSession(sessionId, 'units.delete', { ...target, fingerprint: preview.fingerprint });
    vi.setSystemTime(new Date('2026-11-25T00:00:01Z'));
    callDesktopSession(sessionId, 'units.updateText', { ...target, text: 'new' });
    callDesktopSession(sessionId, 'units.undo', { manuscriptId });
    callDesktopSession(sessionId, 'units.undo', { manuscriptId });
    const read = (sid: string) => callDesktopSession(sid, 'units.list', { layerId: linked });
    expect(read(sessionId)).toMatchObject([{ text: 'original' }]);
    callDesktopSession(sessionId, 'units.redo', { manuscriptId });
    expect(read(sessionId)).toMatchObject([{ text: '' }]);
    callDesktopSession(sessionId, 'units.redo', { manuscriptId });
    expect(read(sessionId)).toMatchObject([{ text: 'new' }]);
    callDesktopSession(sessionId, 'units.undo', { manuscriptId });
    callDesktopSession(sessionId, 'units.undo', { manuscriptId });
    closeDesktopSession(sessionId);
    const reopened = openDesktopSession(root, [root]);
    expect(read(reopened.sessionId)).toMatchObject([{ text: 'original' }]);
  });

  it('clears official text and draft, replays once, and undoes only that layer', () => {
    const root = folder();
    const { sessionId } = openDesktopSession(root, [root]);
    const host = layer(sessionId, false);
    const db = requireDesktopSession(sessionId).db;
    const manuscriptId = (
      db.prepare('SELECT manuscript_id FROM layers WHERE id = ?').get(host) as {
        manuscript_id: string;
      }
    ).manuscript_id;
    const spelling = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId,
        key: 'spelling',
        name: { zh: '拼音' },
        tierType: 'symbolic-association',
        contentType: 'transcription',
        hosts: [{ hostLayerId: host }],
      }) as { id: string }
    ).id;
    const id = unit(sessionId, host, 0, 1000, '原文');
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: id,
      textLayerId: spelling,
      text: 'ka',
    });
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: id,
      textLayerId: spelling,
      rawInput: 'kaa',
      baseBody: 'ka',
    });
    const preview = callDesktopSession(sessionId, 'units.deletePreview', {
      unitId: id,
      textLayerId: spelling,
    }) as { fingerprint: string };
    const input = {
      unitId: id,
      textLayerId: spelling,
      fingerprint: preview.fingerprint,
      operationId: 'clear-spelling',
    };
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: id,
      textLayerId: spelling,
      rawInput: 'kaaa',
      baseBody: 'ka',
    });
    expect(() => callDesktopSession(sessionId, 'units.delete', input)).toThrow(
      'text clear preview is stale',
    );
    expect(
      (callDesktopSession(sessionId, 'units.list', { layerId: spelling }) as { text: string }[])[0]
        ?.text,
    ).toBe('ka');
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: id,
      textLayerId: spelling,
      rawInput: 'kaa',
      baseBody: 'ka',
    });
    input.fingerprint = (
      callDesktopSession(sessionId, 'units.deletePreview', {
        unitId: id,
        textLayerId: spelling,
      }) as { fingerprint: string }
    ).fingerprint;
    callDesktopSession(sessionId, 'units.delete', input);
    callDesktopSession(sessionId, 'units.delete', input);
    expect(
      (
        callDesktopSession(sessionId, 'units.list', { layerId: spelling }) as {
          text: string;
          draftText: string | null;
        }[]
      )[0],
    ).toMatchObject({ text: '', draftText: null });
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: id,
      textLayerId: spelling,
      rawInput: 'newer',
      baseBody: '',
    });
    expect(() => callDesktopSession(sessionId, 'units.undo', { manuscriptId })).toThrow(
      'text clear undo is stale',
    );
    callDesktopSession(sessionId, 'units.discardTextDraft', { unitId: id, textLayerId: spelling });
    callDesktopSession(sessionId, 'units.undo', { manuscriptId });
    expect(
      (
        callDesktopSession(sessionId, 'units.list', { layerId: spelling }) as {
          text: string;
          draftText: string | null;
        }[]
      )[0],
    ).toMatchObject({ text: 'ka', draftText: 'kaa' });
    expect(
      (callDesktopSession(sessionId, 'units.list', { layerId: host }) as { text: string }[])[0]
        ?.text,
    ).toBe('原文');
    callDesktopSession(sessionId, 'units.redo', { manuscriptId });
    closeDesktopSession(sessionId);
    const reopened = openDesktopSession(root, [root]);
    expect(
      (
        callDesktopSession(reopened.sessionId, 'units.list', { layerId: spelling }) as {
          text: string;
          draftText: string | null;
        }[]
      )[0],
    ).toMatchObject({ text: '', draftText: null });
    expect(
      (
        callDesktopSession(reopened.sessionId, 'units.list', { layerId: host }) as {
          text: string;
        }[]
      )[0]?.text,
    ).toBe('原文');
    const second = unit(reopened.sessionId, host, 1000, 2000, '第二段');
    callDesktopSession(reopened.sessionId, 'units.updateText', {
      unitId: second,
      textLayerId: spelling,
      text: 'ta',
    });
    const bulk = callDesktopSession(reopened.sessionId, 'units.deleteManyPreview', {
      unitIds: [id, second],
      textLayerId: spelling,
    }) as { fingerprint: string };
    callDesktopSession(reopened.sessionId, 'units.deleteMany', {
      unitIds: [id, second],
      textLayerId: spelling,
      fingerprint: bulk.fingerprint,
      operationId: 'clear-two-spellings',
    });
    expect(
      (
        callDesktopSession(reopened.sessionId, 'units.list', { layerId: spelling }) as {
          text: string;
        }[]
      ).map((row) => row.text),
    ).toEqual(['', '']);
    callDesktopSession(reopened.sessionId, 'units.undo', { manuscriptId });
    expect(
      (
        callDesktopSession(reopened.sessionId, 'units.list', { layerId: spelling }) as {
          text: string;
        }[]
      ).map((row) => row.text),
    ).toEqual(['', 'ta']);
    expect(
      (
        callDesktopSession(reopened.sessionId, 'units.list', { layerId: host }) as {
          text: string;
        }[]
      ).map((row) => row.text),
    ).toEqual(['原文', '第二段']);
  });
});
