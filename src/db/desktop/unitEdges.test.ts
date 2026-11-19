import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { closeDesktopSession, openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-edges-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
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
});
