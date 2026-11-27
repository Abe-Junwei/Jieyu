import { updateUnitText } from './units';
import { storeAttachmentFile, readAttachmentFile } from './attachments';
import { insertTextAudio } from './unitTextAudios';
import { requireDesktopSession } from './projectSession';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openDesktopSession, closeDesktopSession, resetDesktopSessions } from './projectSession';
import { callDesktopSession } from './desktopCall';
import { createDesktopClient } from './client';
import type { DesktopOperations } from './operationContract';
const roots: string[] = [];
afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-review-'));
  roots.push(root);
  const { sessionId } = openDesktopSession(root, [root]);
  const call = <K extends keyof DesktopOperations>(method: K, input: unknown = {}) =>
    callDesktopSession(sessionId, method, input) as DesktopOperations[K]['output'];
  const m = call('manuscripts.create', { title: { und: 'Review' } });
  const tx = call('layers.create', {
    manuscriptId: m.id,
    key: 'tx',
    name: { und: 'Tx' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  });
  const tr = call('layers.create', {
    manuscriptId: m.id,
    key: 'tr',
    name: { und: 'Tr' },
    tierType: 'symbolic-association',
    contentType: 'translation',
    hosts: [{ hostLayerId: tx.id }],
  });
  const u = call('units.create', { layerId: tx.id, startMs: 0, endMs: 1000, text: 'a' });
  return { call, m, tx, tr, u, root, sessionId };
}
it('clear → certainty → undo certainty → undo clear restores original text', () => {
  const { call, u, tr } = setup();
  const target = { unitId: u.id, textLayerId: tr.id };
  call('units.updateText', { ...target, text: 'translation' });
  const preview = call('units.deletePreview', target);
  call('units.delete', { ...target, fingerprint: preview.fingerprint });
  call('units.setSelfCertainty', { ...target, selfCertainty: 'certain' });
  call('units.undo');
  call('units.undo');
  expect(call('units.list', { layerId: tr.id })[0]!.text).toBe('translation');
});
it('filtered assignment replay returns its committed result after the target becomes hidden', () => {
  const { call, u, m } = setup();
  const a = call('speakers.create', { name: 'A' }),
    b = call('speakers.create', { name: 'B' });
  call('speakers.assign', { unitIds: [u.id], speakerId: a.id });
  const input = {
    unitIds: [u.id],
    speakerId: b.id,
    operationId: 'replay-filter',
    viewScope: {
      manuscriptId: m.id,
      kind: 'speakers',
      speakerIds: [a.id],
      includeUnassigned: false,
    },
    expectedAffectedUnitIds: [u.id],
  };
  const first = call('speakers.assign', input);
  expect(call('speakers.assign', input)).toEqual(first);
});
it('receipted project notes retain the existing project anchor support', () => {
  const { call } = setup();
  expect(
    call('notes.create', {
      anchor: { kind: 'project' },
      content: { default: 'project note' },
      operationId: 'project-note',
    }),
  ).toMatchObject({ anchorKind: 'project' });
});

it('merges three sources once, restores all ids in one undo, redoes and reopens', () => {
  const { call, u, tx, tr, m, root, sessionId } = setup();
  const b = call('units.create', { layerId: tx.id, startMs: 1100, endMs: 1800, text: 'b' });
  const c = call('units.create', { layerId: tx.id, startMs: 2000, endMs: 2800, text: 'c' });
  const ids = [u.id, b.id, c.id];
  for (const id of ids)
    call('units.updateText', {
      unitId: id,
      textLayerId: tr.id,
      text: id === u.id ? 'first' : id === b.id ? 'second' : 'third',
    });
  const preview = call('units.mergePreview', { keepId: u.id, removeId: c.id, unitIds: ids });
  expect(preview.texts.find((row) => row.layerId === tr.id)!.result).toBe('first second third');
  const args = {
    keepId: u.id,
    removeId: c.id,
    unitIds: ids,
    baseline: preview.baseline,
    operationId: 'merge-three',
  };
  const result = call('units.merge', args);
  expect(call('units.list', { layerId: tx.id }).map((row) => row.text)).toEqual(['a b c']);
  expect(call('units.merge', args).id).toBe(result.id);
  call('units.undo', { manuscriptId: m.id });
  expect(call('units.list', { layerId: tx.id }).map((row) => row.id)).toEqual(ids);
  call('units.redo', { manuscriptId: m.id });
  expect(call('units.list', { layerId: tx.id })).toMatchObject([{ id: result.id, text: 'a b c' }]);
  closeDesktopSession(sessionId);
  const reopened = openDesktopSession(root, [root]);
  expect(callDesktopSession(reopened.sessionId, 'units.list', { layerId: tx.id })).toMatchObject([
    { id: result.id, text: 'a b c' },
  ]);
});

it('refuses a skipped middle source and rolls back conflicting field/text edits', () => {
  const { call, u, tx } = setup();
  const b = call('units.create', { layerId: tx.id, startMs: 1100, endMs: 1800, text: 'b' });
  const c = call('units.create', { layerId: tx.id, startMs: 2000, endMs: 2800, text: 'c' });
  expect(() =>
    call('units.merge', { keepId: u.id, removeId: c.id, unitIds: [u.id, c.id] }),
  ).toThrow('a unit sits between');
  expect(call('units.list', { layerId: tx.id }).map((row) => row.id)).toEqual([u.id, b.id, c.id]);
  const p = call('units.mergePreview', {
    keepId: u.id,
    removeId: c.id,
    unitIds: [u.id, b.id, c.id],
  });
  call('units.setSelfCertainty', { unitId: b.id, textLayerId: tx.id, selfCertainty: 'uncertain' });
  expect(() =>
    call('units.merge', {
      keepId: u.id,
      removeId: c.id,
      unitIds: [u.id, b.id, c.id],
      baseline: p.baseline,
    }),
  ).toThrow('merge baseline changed');
  expect(call('units.list', { layerId: tx.id })).toHaveLength(3);
});
it('recovers committed replies for single certainty, unit notes and project notes', async () => {
  const { sessionId, u, tx } = setup();
  const bridge = {
    desktopCall: async (id: string, method: string, args: unknown) => {
      const result = callDesktopSession(id, method, args);
      if (method !== 'units.inspectEdit') throw new Error('response lost after commit');
      return result;
    },
  };
  const api = createDesktopClient(bridge);
  expect(
    (
      await api.setUnitSelfCertainty(sessionId, {
        unitId: u.id,
        textLayerId: tx.id,
        selfCertainty: 'certain',
      })
    ).selfCertainty,
  ).toBe('certain');
  expect(
    (
      await api.createNote(sessionId, {
        anchor: { kind: 'unit', unitId: u.id },
        content: { default: 'unit' },
      })
    ).anchorKind,
  ).toBe('unit');
  expect(
    (
      await api.createNote(sessionId, {
        anchor: { kind: 'project' },
        content: { default: 'project' },
      })
    ).anchorKind,
  ).toBe('project');
});

it('handles six recordings across three sources atomically, holds files through undo, and reopens', () => {
  const { call, u, tx, root, sessionId } = setup();
  const b = call('units.create', { layerId: tx.id, startMs: 1100, endMs: 1800, text: 'b' });
  const c = call('units.create', { layerId: tx.id, startMs: 2000, endMs: 2800, text: 'c' });
  const db = requireDesktopSession(sessionId).db;
  const ids = [u.id, b.id, c.id];
  const clips = ids.flatMap((unitId, index) =>
    [0, 1].map((position) => {
      const bytes = Buffer.from(`recording-${index}-${position}`);
      const file = storeAttachmentFile(db, root, {
        kind: 'audio',
        mimeType: 'audio/wav',
        bytes,
        operationId: `audio-${index}-${position}`,
      });
      const id = `clip-${index}-${position}`;
      insertTextAudio(db, {
        id,
        unit_text_id: call('units.get', { id: unitId })!.textId!,
        file_id: file.fileId,
        position: position + 1,
      });
      return { id, fileId: file.fileId, bytes };
    }),
  );
  const target = { keepId: u.id, removeId: c.id, unitIds: ids };
  expect(() => call('units.merge', target)).toThrow('too many recordings');
  expect(call('units.list', { layerId: tx.id })).toHaveLength(3);
  expect(db.prepare('SELECT COUNT(*) AS n FROM unit_text_audios').get()).toEqual({ n: 6 });
  const discardAudioIds = [clips[5]!.id];
  const p = call('units.mergePreview', { ...target, discardAudioIds });
  const merged = call('units.merge', { ...target, discardAudioIds, baseline: p.baseline });
  expect(db.prepare('SELECT COUNT(*) AS n FROM unit_text_audios').get()).toEqual({ n: 5 });
  call('units.undo');
  expect(call('units.list', { layerId: tx.id }).map((row) => row.id)).toEqual(ids);
  for (const clip of clips)
    expect(readAttachmentFile(db, root, clip.fileId).bytes).toEqual(clip.bytes);
  call('units.redo');
  expect(call('units.list', { layerId: tx.id })).toMatchObject([{ id: merged.id }]);
  closeDesktopSession(sessionId);
  const reopened = openDesktopSession(root, [root]);
  expect(callDesktopSession(reopened.sessionId, 'units.list', { layerId: tx.id })).toMatchObject([
    { id: merged.id },
  ]);
});

it('refuses certainty redo after the judged body changes out of band', () => {
  const { call, u, tx, sessionId } = setup();
  call('units.setSelfCertainty', { unitId: u.id, textLayerId: tx.id, selfCertainty: 'certain' });
  call('units.undo');
  updateUnitText(requireDesktopSession(sessionId).db, {
    unitId: u.id,
    textLayerId: tx.id,
    text: 'changed body',
  });
  expect(() => call('units.redo')).toThrow('self certainty redo is stale');
  expect(call('units.get', { id: u.id })).toMatchObject({
    text: 'changed body',
    selfCertainty: null,
  });
});
