import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-edit-receipts-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fresh() {
  const dir = folder();
  return openDesktopSession(dir, [dir]);
}

function layer(sessionId: string): string {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 3,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
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

function create(sessionId: string, layerId: string, text: string, operationId?: string): string {
  return (
    callDesktopSession(sessionId, 'units.create', {
      layerId,
      startMs: 0,
      endMs: 1000,
      text,
      ...(operationId === undefined ? {} : { operationId }),
    }) as { id: string }
  ).id;
}

function rows(sessionId: string, table: string): number {
  return (
    requireDesktopSession(sessionId).db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;
}

describe('desktop edit receipts', () => {
  it('replays a committed edit without running it again and refuses a reused id', () => {
    const session = fresh();
    const layerId = layer(session.sessionId);
    const id = create(session.sessionId, layerId, '句');
    const move = { unitId: id, edge: 'end', time: 1500, operationId: 'op-move' };
    const first = callDesktopSession(session.sessionId, 'units.moveEdge', move);
    expect(callDesktopSession(session.sessionId, 'units.moveEdge', move)).toEqual(first);
    expect(rows(session.sessionId, 'edit_receipts')).toBe(1);

    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveEdge', { ...move, time: 1700 }),
    ).toThrow('operation id conflict');
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toMatchObject({
      endMs: 1500,
    });
    // One move frame above the create frame: the replay added none.
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({ endMs: 1000 });
    callDesktopSession(session.sessionId, 'units.undo', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toBeNull();
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(/is empty$/);
  });

  it('keeps receipts when the unit is deleted and across reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = create(session.sessionId, layer(session.sessionId), '句', 'op-create');
    callDesktopSession(session.sessionId, 'units.delete', { unitId: id, operationId: 'op-delete' });
    callDesktopSession(session.sessionId, 'units.undo', { operationId: 'op-undo' });
    callDesktopSession(session.sessionId, 'units.delete', {
      unitId: id,
      operationId: 'op-delete-2',
    });
    closeDesktopSession(session.sessionId);

    const again = openDesktopSession(dir, [dir]);
    expect(rows(again.sessionId, 'edit_receipts')).toBe(4);
    expect(
      callDesktopSession(again.sessionId, 'units.inspectEdit', {
        operationId: 'op-delete',
        kind: 'delete',
        payload: { unitId: id },
      }),
    ).toEqual({ status: 'committed', result: { id } });
    expect(
      callDesktopSession(again.sessionId, 'units.inspectEdit', {
        operationId: 'op-delete',
        kind: 'delete',
        payload: { unitId: 'other' },
      }),
    ).toEqual({ status: 'conflict' });
    expect(
      callDesktopSession(again.sessionId, 'units.inspectEdit', {
        operationId: 'op-never',
        kind: 'delete',
        payload: { unitId: id },
      }),
    ).toEqual({ status: 'not-submitted' });
    expect(
      callDesktopSession(again.sessionId, 'units.delete', { unitId: id, operationId: 'op-delete' }),
    ).toEqual({ id });
    expect(callDesktopSession(again.sessionId, 'units.get', { id })).toBeNull();
  });

  it('writes no receipt when the edit is refused', () => {
    const session = fresh();
    const id = create(session.sessionId, layer(session.sessionId), '句');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.moveEdge', {
        unitId: id,
        edge: 'end',
        time: 9000,
        operationId: 'op-out',
      }),
    ).toThrow();
    expect(rows(session.sessionId, 'edit_receipts')).toBe(0);
  });

  it('keeps a stale redo on the stack until it is dropped explicitly', () => {
    const session = fresh();
    const id = create(session.sessionId, layer(session.sessionId), '句');
    callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: id,
      edge: 'end',
      time: 1500,
    });
    callDesktopSession(session.sessionId, 'units.undo', {});
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE units SET end_ms = 1200 WHERE id = ?')
      .run(id);
    for (let i = 0; i < 2; i += 1) {
      expect(() => callDesktopSession(session.sessionId, 'units.redo', {})).toThrow(/is stale$/);
    }
    expect(callDesktopSession(session.sessionId, 'units.get', { id })).toMatchObject({
      endMs: 1200,
    });
    expect(callDesktopSession(session.sessionId, 'units.dropRedo', {})).toEqual({ dropped: true });
    expect(() => callDesktopSession(session.sessionId, 'units.redo', {})).toThrow(/is empty$/);
  });

  it('counts exactly what a delete removes', () => {
    const session = fresh();
    const id = create(session.sessionId, layer(session.sessionId), 'ka-ra na');
    callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: id });
    callDesktopSession(session.sessionId, 'analysis.segmentMorphemes', { unitId: id });
    const note = callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId: id },
      content: { zh: '注' },
    }) as { id: string };
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'note',
      name: { zh: '注' },
      fieldType: 'text',
      required: false,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: field.id,
      targetType: 'note',
      targetId: note.id,
      value: 'v',
      expectedRevision: 1,
    });
    callDesktopSession(session.sessionId, 'units.putTextDraft', {
      unitId: id,
      rawInput: 'ka-ra',
      baseBody: 'ka-ra na',
    });
    callDesktopSession(session.sessionId, 'units.putTimeDraft', {
      unitId: id,
      edge: 'end',
      rawInput: '1.',
      baseMs: 1000,
      issue: null,
    });
    const tables = {
      tokens: 'tokens',
      morphemes: 'morphemes',
      notes: 'notes',
      customFieldValues: 'custom_field_values',
    } as const;
    const before = Object.fromEntries(
      Object.entries(tables).map(([key, table]) => [key, rows(session.sessionId, table)]),
    );
    const drafts =
      rows(session.sessionId, 'unit_text_drafts') + rows(session.sessionId, 'unit_time_drafts');
    const preview = callDesktopSession(session.sessionId, 'units.deletePreview', {
      unitId: id,
    }) as Record<string, number>;
    expect(preview).toMatchObject({
      tokens: 2,
      morphemes: 2,
      notes: 1,
      customFieldValues: 1,
      drafts: 2,
    });

    callDesktopSession(session.sessionId, 'units.delete', { unitId: id });
    for (const [key, table] of Object.entries(tables)) {
      expect(before[key]! - rows(session.sessionId, table), key).toBe(preview[key]);
    }
    expect(
      drafts -
        rows(session.sessionId, 'unit_text_drafts') -
        rows(session.sessionId, 'unit_time_drafts'),
    ).toBe(preview.drafts);
  });

  it('marks a time draft typed against an older edge as a conflict, also after reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const id = create(session.sessionId, layer(session.sessionId), '句');
    callDesktopSession(session.sessionId, 'units.moveEdge', {
      unitId: id,
      edge: 'end',
      time: 1500,
    });
    callDesktopSession(session.sessionId, 'units.putTimeDraft', {
      unitId: id,
      edge: 'end',
      rawInput: '00:00:01.2',
      baseMs: 1500,
      issue: null,
    });
    expect(callDesktopSession(session.sessionId, 'units.readTimeDraft', { unitId: id })).toEqual([
      expect.objectContaining({ currentMs: 1500, conflict: false }),
    ]);
    callDesktopSession(session.sessionId, 'units.undo', {});
    closeDesktopSession(session.sessionId);

    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'units.readTimeDraft', { unitId: id })).toEqual([
      expect.objectContaining({
        rawInput: '00:00:01.2',
        baseMs: 1500,
        currentMs: 1000,
        conflict: true,
      }),
    ]);
  });
});

describe('desktop client receipted edits', () => {
  const input = { layerId: 'layer', startMs: 0, endMs: 1, text: '句' };

  it('adopts the stored result when the lost call had committed', async () => {
    const methods: string[] = [];
    const client = createDesktopClient({
      desktopCall: (_session, method) => {
        methods.push(method);
        if (method === 'units.create') return Promise.reject(new Error('response lost'));
        return Promise.resolve({ status: 'committed', result: { id: 'u1' } });
      },
    });
    await expect(client.createUnit('s', input)).resolves.toEqual({ id: 'u1' });
    expect(methods).toEqual(['units.create', 'units.inspectEdit']);
  });

  it('retries once with the same id when the call never reached the library', async () => {
    const ids: unknown[] = [];
    const client = createDesktopClient({
      desktopCall: (_session, method, args) => {
        if (method === 'units.inspectEdit') return Promise.resolve({ status: 'not-submitted' });
        ids.push((args as { operationId: string }).operationId);
        return ids.length === 1
          ? Promise.reject(new Error('response lost'))
          : Promise.resolve({ id: 'u2' });
      },
    });
    await expect(client.createUnit('s', input)).resolves.toEqual({ id: 'u2' });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('reports an unknown outcome when the library cannot be asked', async () => {
    let calls = 0;
    const client = createDesktopClient({
      desktopCall: () => {
        calls += 1;
        return Promise.reject(new Error('response lost'));
      },
    });
    await expect(client.createUnit('s', input)).rejects.toThrow('edit outcome is unknown');
    expect(calls).toBe(2);
  });
});
