import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import { getUnit, updateUnitText } from './units';
import { mergeLayerSelfCertainty } from './unitTextSelfCertainty';
import { mergeUnits } from './unitMerge';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-metadata-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seed(sessionId: string) {
  const call = (method: string, input: Record<string, unknown>) =>
    callDesktopSession(sessionId, method as never, input as never) as { id: string };
  const media = call('media.create', { relpath: 'a.wav', sha256: 'aa', duration: 3 });
  const manuscript = call('manuscripts.create', { title: { zh: '文稿' }, mediaId: media.id });
  const tx = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: 'tx' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }).id;
  const tr = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'tr',
    name: { zh: 'tr' },
    tierType: 'symbolic-association',
    contentType: 'translation',
    hosts: [{ hostLayerId: tx }],
  }).id;
  const unit = call('units.create', { layerId: tx, startMs: 0, endMs: 1000, text: 'hello' });
  return { db: requireDesktopSession(sessionId).db, tx, tr, unit };
}

describe('unit metadata (ADR-0144)', () => {
  it('merges certainty with missing or unmarked → null, else least certain', () => {
    expect(mergeLayerSelfCertainty('certain', 'uncertain')).toBe('uncertain');
    expect(mergeLayerSelfCertainty('certain', null)).toBe(null);
    expect(mergeLayerSelfCertainty(undefined, 'certain')).toBe(null);
    expect(mergeLayerSelfCertainty('not_understood', 'certain')).toBe('not_understood');
  });

  it('stores per-layer certainty, clears on body change, and reopens', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    callDesktopSession(sessionId, 'units.setSelfCertainty', {
      unitId: s.unit.id,
      textLayerId: s.tx,
      selfCertainty: 'certain',
    });
    callDesktopSession(sessionId, 'units.setSelfCertainty', {
      unitId: s.unit.id,
      textLayerId: s.tr,
      selfCertainty: 'uncertain',
    });
    expect(getUnit(s.db, s.unit.id, s.tx)?.selfCertainty).toBe('certain');
    expect(getUnit(s.db, s.unit.id, s.tr)?.selfCertainty).toBe('uncertain');

    updateUnitText(s.db, { unitId: s.unit.id, textLayerId: s.tx, text: 'hello!' });
    expect(getUnit(s.db, s.unit.id, s.tx)?.selfCertainty).toBe(null);
    expect(getUnit(s.db, s.unit.id, s.tr)?.selfCertainty).toBe('uncertain');

    closeDesktopSession(sessionId);
    const reopened = openProject(dir);
    expect(getUnit(reopened.db, s.unit.id, s.tr)?.selfCertainty).toBe('uncertain');
    reopened.close();
  });

  it('builds an empty carrier when noting a blank card', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    const blank = callDesktopSession(sessionId, 'units.create', {
      layerId: s.tx,
      startMs: 1200,
      endMs: 1800,
      text: '',
    }) as { id: string };
    const note = callDesktopSession(sessionId, 'notes.createForUnitText', {
      unitId: blank.id,
      textLayerId: s.tx,
      value: { default: 'memo' },
      category: 'comment',
    }) as { unitTextId: string | null };
    expect(note.unitTextId).toBeTruthy();
    expect(getUnit(s.db, blank.id, s.tx)?.textId).toBe(note.unitTextId);
  });

  it('merge takes the least certain marked value when both sides have rows', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    const right = callDesktopSession(sessionId, 'units.create', {
      layerId: s.tx,
      startMs: 1100,
      endMs: 2000,
      text: 'world',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.setSelfCertainty', {
      unitId: s.unit.id,
      textLayerId: s.tx,
      selfCertainty: 'certain',
    });
    callDesktopSession(sessionId, 'units.setSelfCertainty', {
      unitId: right.id,
      textLayerId: s.tx,
      selfCertainty: 'uncertain',
    });
    const merged = mergeUnits(s.db, { keepId: s.unit.id, removeId: right.id });
    expect(getUnit(s.db, merged.unit.id, s.tx)?.selfCertainty).toBe('uncertain');
  });

  it('undoes and redoes certainty without clearing the stack of other edits', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    callDesktopSession(sessionId, 'units.setSkipProcessing', { unitId: s.unit.id, skip: true });
    callDesktopSession(sessionId, 'units.setSelfCertainty', {
      unitId: s.unit.id,
      textLayerId: s.tx,
      selfCertainty: 'certain',
    });
    expect(getUnit(s.db, s.unit.id, s.tx)?.selfCertainty).toBe('certain');
    callDesktopSession(sessionId, 'units.undo', {});
    expect(getUnit(s.db, s.unit.id, s.tx)?.selfCertainty).toBe(null);
    callDesktopSession(sessionId, 'units.redo', {});
    expect(getUnit(s.db, s.unit.id, s.tx)?.selfCertainty).toBe('certain');
  });

  it('batch-creates layer notes and undoes them in one step', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    const right = callDesktopSession(sessionId, 'units.create', {
      layerId: s.tx,
      startMs: 1200,
      endMs: 1800,
      text: 'b',
    }) as { id: string };
    const notes = callDesktopSession(sessionId, 'notes.createManyForUnitText', {
      unitIds: [s.unit.id, right.id],
      textLayerId: s.tx,
      value: { default: 'batch' },
      category: 'comment',
    }) as { id: string }[];
    expect(notes).toHaveLength(2);
    callDesktopSession(sessionId, 'units.undo', {});
    const listed = callDesktopSession(sessionId, 'notes.list', {
      unitId: s.unit.id,
    }) as unknown[];
    expect(listed).toHaveLength(0);
  });
});
