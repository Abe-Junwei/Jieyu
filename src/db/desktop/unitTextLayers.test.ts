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
import { deleteManuscript } from './manuscripts';
import { purgeManuscript } from './manuscriptPurge';
import { exportDesktopJyt, importDesktopJyt } from './projectExchange';
import { getUnit, listUnits } from './units';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-text-layers-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

interface Seeded {
  manuscriptId: string;
  tx: string;
  tr: string;
  loose: string;
  unitId: string;
}

function seed(sessionId: string): Seeded {
  const call = (method: string, input: Record<string, unknown>) =>
    callDesktopSession(sessionId, method as never, input as never) as { id: string };
  const media = call('media.create', { relpath: 'a.wav', sha256: 'aa', duration: 3 });
  const manuscript = call('manuscripts.create', { title: { zh: '文稿' }, mediaId: media.id });
  const layer = (key: string, contentType: string, extra: Record<string, unknown> = {}) =>
    call('layers.create', {
      manuscriptId: manuscript.id,
      key,
      name: { zh: key },
      tierType: 'time-aligned',
      contentType,
      ...extra,
    }).id;
  const tx = layer('tx', 'transcription');
  const tr = layer('tr', 'translation', {
    tierType: 'symbolic-association',
    hosts: [{ hostLayerId: tx }],
  });
  const loose = layer('loose', 'translation', { tierType: 'symbolic-association' });
  const unitId = call('units.create', { layerId: tx, startMs: 0, endMs: 1000, text: 'ka' }).id;
  return { manuscriptId: manuscript.id, tx, tr, loose, unitId };
}

function textRows(sessionId: string, unitId: string): Array<{ layer_id: string; body: string }> {
  return requireDesktopSession(sessionId)
    .db.prepare('SELECT layer_id, body FROM unit_texts WHERE unit_id = ? ORDER BY layer_id')
    .all(unitId) as Array<{ layer_id: string; body: string }>;
}

describe('layer-scoped unit text', () => {
  it('projects a host unit onto a linked layer as an empty text without a row', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    expect(
      callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId: s.manuscriptId }),
    ).toEqual([
      { layerId: s.tr, hostLayerId: s.tx, linkType: 'free', isPreferred: true, sortOrder: 0 },
    ]);
    const projected = listUnits(requireDesktopSession(sessionId).db, s.tr);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      id: s.unitId,
      layerId: s.tx,
      textLayerId: s.tr,
      text: '',
      textId: null,
      confidence: null,
    });
    expect(listUnits(requireDesktopSession(sessionId).db, s.loose)).toEqual([]);
    expect(textRows(sessionId, s.unitId).map((row) => row.layer_id)).toEqual([s.tx]);
  });

  it('keeps text, draft, receipt, and undo apart for two layers of one unit, across reopen', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: s.unitId,
      rawInput: 'kax',
      baseBody: 'ka',
    });
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: s.unitId,
      textLayerId: s.tr,
      rawInput: 'hello',
      baseBody: '',
    });
    const saved = callDesktopSession(sessionId, 'units.updateText', {
      unitId: s.unitId,
      textLayerId: s.tr,
      text: 'hello',
      operationId: 'op-tr',
    }) as { text: string; textLayerId: string };
    expect(saved).toMatchObject({ text: 'hello', textLayerId: s.tr });
    expect(textRows(sessionId, s.unitId)).toEqual(
      [
        { layer_id: s.tx, body: 'ka' },
        { layer_id: s.tr, body: 'hello' },
      ].sort((a, b) => a.layer_id.localeCompare(b.layer_id)),
    );
    expect(
      callDesktopSession(sessionId, 'units.readTextDraft', { unitId: s.unitId, textLayerId: s.tr }),
    ).toBeNull();
    expect(
      callDesktopSession(sessionId, 'units.readTextDraft', { unitId: s.unitId }),
    ).toMatchObject({ rawInput: 'kax', textLayerId: s.tx });
    expect(listUnits(requireDesktopSession(sessionId).db, s.tx)[0]).toMatchObject({
      text: 'ka',
      draftText: 'kax',
    });
    expect(listUnits(requireDesktopSession(sessionId).db, s.tr)[0]).toMatchObject({
      text: 'hello',
      draftText: null,
    });
    expect(
      callDesktopSession(sessionId, 'units.inspectTextSave', {
        operationId: 'op-tr',
        unitId: s.unitId,
        textLayerId: s.tr,
        text: 'hello',
      }),
    ).toBe('committed');
    expect(
      callDesktopSession(sessionId, 'units.inspectTextSave', {
        operationId: 'op-tr',
        unitId: s.unitId,
        text: 'hello',
      }),
    ).not.toBe('committed');

    requireDesktopSession(sessionId)
      .db.prepare('UPDATE units SET confidence = ? WHERE id = ?')
      .run(0.42, s.unitId);
    closeDesktopSession(sessionId);
    const reopened = openProject(dir);
    expect(listUnits(reopened.db, s.tr)[0]).toMatchObject({
      text: 'hello',
      textLayerId: s.tr,
      confidence: 0.42,
    });
    expect(getUnit(reopened.db, s.unitId)?.confidence).toBe(0.42);
    expect(listUnits(reopened.db, s.tx)[0]).toMatchObject({ text: 'ka', textLayerId: s.tx });
    reopened.close();

    const again = openDesktopSession(dir, [dir]);
    callDesktopSession(again.sessionId, 'units.updateText', {
      unitId: s.unitId,
      textLayerId: s.tr,
      text: 'hi',
    });
    callDesktopSession(again.sessionId, 'units.undoText', {});
    expect(textRows(again.sessionId, s.unitId).find((row) => row.layer_id === s.tr)?.body).toBe(
      'hello',
    );
    expect(textRows(again.sessionId, s.unitId).find((row) => row.layer_id === s.tx)?.body).toBe(
      'ka',
    );
  });

  it('clears a linked text by removing its row, and undo puts the row back', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: s.unitId,
      textLayerId: s.tr,
      text: 'hello',
    });
    const cleared = callDesktopSession(sessionId, 'units.updateText', {
      unitId: s.unitId,
      textLayerId: s.tr,
      text: '',
    }) as { text: string; textId: string | null };
    expect(cleared).toMatchObject({ text: '', textId: null });
    expect(textRows(sessionId, s.unitId).map((row) => row.layer_id)).toEqual([s.tx]);
    callDesktopSession(sessionId, 'units.undoText', {});
    expect(textRows(sessionId, s.unitId).find((row) => row.layer_id === s.tr)?.body).toBe('hello');
  });

  it('refuses text on a layer that is not linked to the unit host', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    expect(() =>
      callDesktopSession(sessionId, 'units.updateText', {
        unitId: s.unitId,
        textLayerId: s.loose,
        text: 'x',
      }),
    ).toThrow('unit text layer is not linked to its unit');
    expect(() =>
      requireDesktopSession(sessionId)
        .db.prepare(
          `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, updated_at)
           VALUES ('raw', ?, ?, 'translation', 'x', 't')`,
        )
        .run(s.unitId, s.loose),
    ).toThrow('unit text layer is not linked to its unit');
  });

  it('carries links and linked text through JYT, and purge removes the links', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: s.unitId,
      textLayerId: s.tr,
      text: 'hello',
    });
    const packed = exportDesktopJyt(requireDesktopSession(sessionId).db);
    closeDesktopSession(sessionId);

    const destDir = join(folder(), 'restored');
    importDesktopJyt(destDir, packed);
    const dest = openProject(destDir);
    expect(dest.db.prepare('SELECT layer_id, host_layer_id FROM layer_links').all()).toEqual([
      { layer_id: s.tr, host_layer_id: s.tx },
    ]);
    expect(listUnits(dest.db, s.tr)[0]).toMatchObject({ text: 'hello', textLayerId: s.tr });

    deleteManuscript(dest.db, s.manuscriptId);
    const past = '2020-01-01T00:00:00.000Z';
    dest.db
      .prepare('UPDATE manuscripts SET reminder_shown_at = ?, retain_until = ? WHERE id = ?')
      .run(past, past, s.manuscriptId);
    purgeManuscript(dest.db, s.manuscriptId);
    expect(dest.db.prepare('SELECT COUNT(*) AS n FROM layer_links').get()).toEqual({ n: 0 });
    expect(dest.db.prepare('SELECT COUNT(*) AS n FROM unit_texts').get()).toEqual({ n: 0 });
    dest.close();
  });

  it('keeps a created subdivision inside a host parent and gives it the parent speaker', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    const speaker = callDesktopSession(sessionId, 'speakers.create', { name: 'A' }) as {
      id: string;
    };
    requireDesktopSession(sessionId)
      .db.prepare('UPDATE units SET speaker_id = ? WHERE id = ?')
      .run(speaker.id, s.unitId);
    const sub = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId: s.manuscriptId,
        key: 'sub',
        name: { zh: 'sub' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: s.tx }],
      }) as { id: string }
    ).id;
    const create = (extra: Record<string, unknown>) =>
      callDesktopSession(sessionId, 'units.create', { layerId: sub, text: '', ...extra }) as {
        speakerId: string | null;
        parentUnitId: string | null;
      };
    expect(() => create({ startMs: 100, endMs: 400 })).toThrow(
      'time subdivision needs a parent on its host layer',
    );
    expect(() => create({ startMs: 800, endMs: 1200, parentUnitId: s.unitId })).toThrow(
      'time subdivision is outside its parent',
    );
    const created = create({ startMs: 100, endMs: 400, parentUnitId: s.unitId });
    expect(created).toMatchObject({ speakerId: speaker.id, parentUnitId: s.unitId });
  });

  it('keeps skip processing across close and reopen', () => {
    const dir = folder();
    const { sessionId } = openDesktopSession(dir, [dir]);
    const s = seed(sessionId);
    expect(listUnits(requireDesktopSession(sessionId).db, s.tx)[0]).toMatchObject({
      skipProcessing: false,
    });
    callDesktopSession(sessionId, 'units.setSkipProcessing', { unitId: s.unitId, skip: true });
    closeDesktopSession(sessionId);
    const reopened = openProject(dir);
    expect(getUnit(reopened.db, s.unitId)?.skipProcessing).toBe(true);
    reopened.close();
    const again = openDesktopSession(dir, [dir]);
    callDesktopSession(again.sessionId, 'units.setSkipProcessing', {
      unitId: s.unitId,
      skip: false,
    });
    expect(getUnit(requireDesktopSession(again.sessionId).db, s.unitId)?.skipProcessing).toBe(
      false,
    );
  });
});
