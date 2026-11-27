import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createContentNote } from './notes';
import { callDesktopSession } from './desktopCall';
import type { DesktopOperations } from './operationContract';
import {
  openDesktopSession,
  closeDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
const roots: string[] = [];
afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-bugbot-'));
  roots.push(root);
  const { sessionId } = openDesktopSession(root, [root]);
  const call = <K extends keyof DesktopOperations>(method: K, input: unknown = {}) =>
    callDesktopSession(sessionId, method, input) as DesktopOperations[K]['output'];
  const manuscript = call('manuscripts.create', { title: { und: 'Review' } });
  const layer = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { und: 'Tx' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  });
  const unit = call('units.create', { layerId: layer.id, startMs: 0, endMs: 1000, text: 'a' });
  return {
    root,
    sessionId,
    call,
    manuscript,
    layer,
    unit,
    db: requireDesktopSession(sessionId).db,
  };
}
it.each(['text', 'split', 'merge'] as const)(
  'keeps %s undo after certainty undo retargets generation',
  (kind) => {
    const { call, unit, layer } = setup();
    let target = unit.id;
    if (kind === 'text') call('units.updateText', { unitId: unit.id, text: 'changed' });
    if (kind === 'split') target = call('units.split', { unitId: unit.id, time: 500 }).left.id;
    if (kind === 'merge') {
      const right = call('units.create', {
        layerId: layer.id,
        startMs: 1000,
        endMs: 2000,
        text: 'b',
      });
      target = call('units.merge', { keepId: unit.id, removeId: right.id }).id;
    }
    call('units.setSelfCertainty', {
      unitId: target,
      textLayerId: layer.id,
      selfCertainty: 'certain',
    });
    call('units.undo');
    call('units.undo');
    expect(call('units.get', { id: unit.id })).toMatchObject({
      text: 'a',
      startMs: 0,
      endMs: 1000,
    });
  },
);
it('undoes a first note carrier before text undo and recreates it with the same identity on redo', () => {
  const { call, unit, layer, root, sessionId } = setup();
  call('units.updateText', { unitId: unit.id, text: '' });
  const note = call('notes.createForUnitText', {
    unitId: unit.id,
    textLayerId: layer.id,
    value: { default: 'memo' },
  });
  call('units.undo');
  expect(call('units.get', { id: unit.id })?.textId).toBeNull();
  call('units.undo');
  expect(call('units.get', { id: unit.id })?.text).toBe('a');
  call('units.redo');
  call('units.redo');
  expect(call('units.get', { id: unit.id })?.textId).toBe(note.unitTextId);
  closeDesktopSession(sessionId);
  const reopened = openDesktopSession(root, [root]);
  expect(callDesktopSession(reopened.sessionId, 'notes.list', { unitId: unit.id })).toMatchObject([
    { id: note.id, unitTextId: note.unitTextId },
  ]);
});
it('restores both first-note carriers when a note batch is redone', () => {
  const { call, unit, layer } = setup();
  const right = call('units.create', { layerId: layer.id, startMs: 1000, endMs: 2000, text: 'b' });
  for (const id of [unit.id, right.id]) call('units.updateText', { unitId: id, text: '' });
  const notes = call('notes.createManyForUnitText', {
    unitIds: [unit.id, right.id],
    textLayerId: layer.id,
    value: { default: 'batch' },
  });
  call('units.undo');
  for (const id of [unit.id, right.id]) expect(call('units.get', { id })?.textId).toBeNull();
  call('units.undo');
  call('units.redo');
  call('units.redo');
  for (const note of notes)
    expect(call('notes.list', { unitId: note.unitId! })).toMatchObject([
      { id: note.id, unitTextId: note.unitTextId },
    ]);
});
it('rejects certainty on a deleted manuscript without changing rows or generation', () => {
  const { call, unit, layer, manuscript, db } = setup();
  call('manuscripts.delete', { id: manuscript.id });
  const before = db.prepare('SELECT * FROM manuscripts WHERE id = ?').get(manuscript.id);
  expect(() =>
    call('units.setSelfCertainty', {
      unitId: unit.id,
      textLayerId: layer.id,
      selfCertainty: 'certain',
    }),
  ).toThrow('manuscript is deleted');
  expect(db.prepare('SELECT * FROM manuscripts WHERE id = ?').get(manuscript.id)).toEqual(before);
});
it('clears certainty before deciding whether an empty text carrier is still needed', () => {
  const { call, unit, layer, root, sessionId } = setup();
  call('units.setSelfCertainty', {
    unitId: unit.id,
    textLayerId: layer.id,
    selfCertainty: 'certain',
  });
  call('units.updateText', { unitId: unit.id, text: '' });
  expect(call('units.get', { id: unit.id })).toMatchObject({
    text: '',
    textId: null,
    selfCertainty: null,
  });
  call('units.undo');
  expect(call('units.get', { id: unit.id })).toMatchObject({ text: 'a', selfCertainty: 'certain' });
  call('units.redo');
  closeDesktopSession(sessionId);
  const reopened = openDesktopSession(root, [root]);
  expect(callDesktopSession(reopened.sessionId, 'units.get', { id: unit.id })).toMatchObject({
    text: '',
    textId: null,
    selfCertainty: null,
  });
});
it.each([
  ['split', true],
  ['merge', true],
  ['split', false],
  ['merge', false],
] as const)('%s protects the complete subtree (hidden=%s)', (kind, hidden) => {
  const { call, unit, layer, manuscript, db } = setup();
  const childLayer = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'child',
    name: { und: 'Child' },
    tierType: 'time-subdivision',
    contentType: 'transcription',
    hosts: [{ hostLayerId: layer.id }],
  });
  const child = call('units.create', {
    layerId: childLayer.id,
    parentUnitId: unit.id,
    startMs: 100,
    endMs: 900,
    text: 'child',
  });
  const grandLayer = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'grand',
    name: { und: 'Grand' },
    tierType: 'time-subdivision',
    contentType: 'transcription',
    hosts: [{ hostLayerId: layer.id }],
  });
  // Exercise an existing deep hierarchy; the current layer editor only offers root hosts.
  db.prepare('UPDATE layer_links SET host_layer_id = ? WHERE layer_id = ?').run(
    childLayer.id,
    grandLayer.id,
  );
  const grand = call('units.create', {
    layerId: grandLayer.id,
    parentUnitId: child.id,
    startMs: 200,
    endMs: 800,
    text: 'hidden',
  });
  const speaker = call('speakers.create', { name: 'hidden speaker' });
  call('speakers.assign', { unitIds: [grand.id], speakerId: speaker.id });
  const scope = {
    viewScope: {
      kind: 'speakers',
      manuscriptId: manuscript.id,
      speakerIds: hidden ? [] : [speaker.id],
      includeUnassigned: true,
    },
  };
  const right =
    kind === 'merge'
      ? call('units.create', { layerId: layer.id, startMs: 1000, endMs: 2000, text: 'b' })
      : null;
  const expectedAffectedUnitIds = [unit.id, child.id, grand.id, ...(right ? [right.id] : [])];
  const execute = () =>
    kind === 'split'
      ? call('units.split', { unitId: unit.id, time: 500, ...scope, expectedAffectedUnitIds })
      : call('units.merge', {
          keepId: unit.id,
          removeId: right!.id,
          ...scope,
          expectedAffectedUnitIds,
        });
  if (hidden) {
    expect(execute).toThrow('unit is outside view scope');
    expect(call('units.get', { id: grand.id })).toMatchObject({
      id: grand.id,
      parentUnitId: child.id,
      text: 'hidden',
    });
    expect(call('units.get', { id: unit.id })).toMatchObject({ id: unit.id, text: 'a' });
  } else {
    expect(execute).not.toThrow();
    call('units.undo');
    expect(call('units.get', { id: grand.id })).toMatchObject({
      id: grand.id,
      parentUnitId: child.id,
      text: 'hidden',
    });
  }
});
it.each(['single', 'batch'] as const)(
  'refuses %s structural deletion with a child, even without filtering',
  (kind) => {
    const { call, unit, layer, manuscript } = setup();
    const sub = call('layers.create', {
      manuscriptId: manuscript.id,
      key: 'sub',
      name: { und: 'Sub' },
      tierType: 'time-subdivision',
      contentType: 'transcription',
      hosts: [{ hostLayerId: layer.id }],
    });
    const child = call('units.create', {
      layerId: sub.id,
      parentUnitId: unit.id,
      startMs: 100,
      endMs: 900,
      text: 'child',
    });
    const right = call('units.create', {
      layerId: layer.id,
      startMs: 1000,
      endMs: 2000,
      text: 'b',
    });
    expect(() =>
      kind === 'single'
        ? call('units.delete', { unitId: unit.id })
        : call('units.deleteMany', { unitIds: [unit.id, right.id] }),
    ).toThrow('unit has time subdivisions');
    expect(call('units.get', { id: child.id })).toMatchObject({
      parentUnitId: unit.id,
      text: 'child',
    });
  },
);

it('preserves a preexisting empty carrier when undoing its first note', () => {
  const { call, unit, layer } = setup();
  call('units.updateText', { unitId: unit.id, text: '' });
  call('units.setSelfCertainty', {
    unitId: unit.id,
    textLayerId: layer.id,
    selfCertainty: 'uncertain',
  });
  const textId = call('units.get', { id: unit.id })!.textId;
  call('notes.createForUnitText', {
    unitId: unit.id,
    textLayerId: layer.id,
    value: { default: 'memo' },
  });
  call('units.undo');
  expect(call('units.get', { id: unit.id })).toMatchObject({ textId, selfCertainty: 'uncertain' });
});
it('retains an owned carrier if another active note now needs it', () => {
  const { call, unit, layer, db } = setup();
  call('units.updateText', { unitId: unit.id, text: '' });
  const note = call('notes.createForUnitText', {
    unitId: unit.id,
    textLayerId: layer.id,
    value: { default: 'memo' },
  });
  createContentNote(db, {
    anchor: { kind: 'unit_text', unitTextId: note.unitTextId! },
    content: { default: 'later' },
  });
  call('units.undo');
  expect(call('units.get', { id: unit.id })!.textId).toBe(note.unitTextId);
  call('units.redo');
  expect(call('notes.list', { unitId: unit.id })).toHaveLength(2);
});
it('rolls back all carrier restoration if a batch redo target was replaced', () => {
  const { call, unit, layer, db } = setup();
  const right = call('units.create', { layerId: layer.id, startMs: 1000, endMs: 2000, text: 'b' });
  for (const id of [unit.id, right.id]) call('units.updateText', { unitId: id, text: '' });
  call('notes.createManyForUnitText', {
    unitIds: [unit.id, right.id],
    textLayerId: layer.id,
    value: { default: 'batch' },
  });
  call('units.undo');
  db.prepare(
    "INSERT INTO unit_texts (id,unit_id,layer_id,role,body,updated_at) VALUES ('replacement',?,?,'transcription','','now')",
  ).run(right.id, layer.id);
  expect(() => call('units.redo')).toThrow('note carrier redo is stale');
  expect(call('units.get', { id: unit.id })!.textId).toBeNull();
  expect(call('units.get', { id: right.id })!.textId).toBe('replacement');
  expect(call('notes.list', { unitId: unit.id })).toEqual([]);
});

it.each(['single', 'batch'] as const)(
  'keeps text undo after a no-op %s certainty write',
  (kind) => {
    const { call, unit, layer, manuscript, db } = setup();
    call('units.updateText', { unitId: unit.id, text: 'changed' });
    const before = db.prepare('SELECT generation FROM manuscripts WHERE id = ?').get(manuscript.id);
    if (kind === 'single')
      call('units.setSelfCertainty', {
        unitId: unit.id,
        textLayerId: layer.id,
        selfCertainty: null,
      });
    else
      call('units.setSelfCertaintyMany', {
        unitIds: [unit.id],
        textLayerId: layer.id,
        selfCertainty: null,
      });
    expect(
      db.prepare('SELECT generation FROM manuscripts WHERE id = ?').get(manuscript.id),
    ).toEqual(before);
    call('units.undo');
    expect(call('units.get', { id: unit.id })?.text).toBe('a');
  },
);
