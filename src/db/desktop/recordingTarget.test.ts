import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { proposeOralDraft } from './recordingClips';
import {
  assertTranscriptionWrite,
  planTranscription,
  recordTranscriptionUnit,
} from './recordingTarget';
import { DESKTOP_PROJECT_USER_VERSION } from './schema';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const model = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock('../../desktop/projectTranscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../desktop/projectTranscription')>()),
  transcribeWavClip: model.transcribe,
}));

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-target-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function project() {
  const dir = folder();
  const session = openDesktopSession(dir, [dir]);
  const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
    title: { zh: '稿' },
  }) as { id: string };
  const host = callDesktopSession(session.sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const unit = callDesktopSession(session.sessionId, 'units.create', {
    layerId: host.id,
    startMs: 100,
    endMs: 200,
    text: '原句',
  }) as { id: string };
  const voice = callDesktopSession(session.sessionId, 'recordings.createPair', {
    hostLayerId: host.id,
    kind: 'voice',
    audioName: { zh: '语音' },
    textName: { zh: '不用' },
  }) as { audioLayerId: string };
  return {
    dir,
    sessionId: session.sessionId,
    manuscriptId: manuscript.id,
    hostId: host.id,
    unitId: unit.id,
    voiceId: voice.audioLayerId,
  };
}

describe('recording text target', () => {
  it('clears an audio parent on open and does not bump the format', () => {
    const { sessionId, manuscriptId, voiceId } = project();
    const text = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'old-child',
      name: { zh: '旧文字' },
      tierType: 'symbolic-association',
      contentType: 'transcription',
      parentId: voiceId,
      hosts: [{ hostLayerId: projectHost(sessionId, voiceId), preferred: true }],
    }) as { id: string };
    callDesktopSession(sessionId, 'reopen', {});
    const db = requireDesktopSession(sessionId).db;
    const parent = db.prepare('SELECT parent_id FROM layers WHERE id = ?').get(text.id) as {
      parent_id: string | null;
    };
    expect(parent.parent_id).toBeNull();
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(DESKTOP_PROJECT_USER_VERSION);
  });

  it('refuses a translation written onto a transcription layer', () => {
    const { sessionId, hostId, unitId } = project();
    const oral = callDesktopSession(sessionId, 'recordings.createPair', {
      hostLayerId: hostId,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '不用' },
    }) as { audioLayerId: string };
    const db = requireDesktopSession(sessionId).db;
    expect(
      callDesktopSession(sessionId, 'recordings.listTargets', { layerId: oral.audioLayerId }),
    ).toMatchObject({
      contentType: 'translation',
      targets: [],
    });
    expect(() =>
      planTranscription(db, { unitId, audioLayerId: oral.audioLayerId, targetLayerId: hostId }),
    ).toThrow('transcription target is not allowed');
  });

  it('writes on the host only after confirmation, and on one containing segment', () => {
    const { sessionId, manuscriptId, hostId, unitId, voiceId } = project();
    const db = requireDesktopSession(sessionId).db;
    expect(() =>
      assertTranscriptionWrite(db, { unitId, audioLayerId: voiceId, targetLayerId: hostId }),
    ).toThrow('transcription host overwrite');
    expect(
      assertTranscriptionWrite(db, {
        unitId,
        audioLayerId: voiceId,
        targetLayerId: hostId,
        confirmHost: true,
      }),
    ).toMatchObject({ kind: 'write', unitId });

    const other = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-2',
      name: { zh: '另一层' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.create', {
      layerId: other.id,
      startMs: 0,
      endMs: 500,
      text: '',
    });
    const longer = planTranscription(db, {
      unitId,
      audioLayerId: voiceId,
      targetLayerId: other.id,
    });
    expect(longer).toMatchObject({ action: 'write', longer: true });
    expect(() =>
      assertTranscriptionWrite(db, { unitId, audioLayerId: voiceId, targetLayerId: other.id }),
    ).toThrow('transcription target is longer');

    const partial = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-3',
      name: { zh: '部分' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.create', {
      layerId: partial.id,
      startMs: 0,
      endMs: 150,
      text: '',
    });
    expect(
      planTranscription(db, { unitId, audioLayerId: voiceId, targetLayerId: partial.id }),
    ).toMatchObject({
      action: 'create',
      empty: false,
    });
    expect(() =>
      assertTranscriptionWrite(db, { unitId, audioLayerId: voiceId, targetLayerId: partial.id }),
    ).toThrow('transcription target needs a segment');

    const empty = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-4',
      name: { zh: '空层' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    expect(
      assertTranscriptionWrite(db, { unitId, audioLayerId: voiceId, targetLayerId: empty.id }),
    ).toMatchObject({ kind: 'create', startMs: 100, endMs: 200 });
  });

  it('asks for one segment when several contain the recording', () => {
    const { sessionId, manuscriptId, unitId, voiceId } = project();
    const layer = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-many',
      name: { zh: '多条' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const firstSpeaker = callDesktopSession(sessionId, 'speakers.create', { name: '甲' }) as {
      id: string;
    };
    const secondSpeaker = callDesktopSession(sessionId, 'speakers.create', { name: '乙' }) as {
      id: string;
    };
    const first = callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startMs: 0,
      endMs: 400,
      speakerId: firstSpeaker.id,
      text: '',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startMs: 50,
      endMs: 300,
      speakerId: secondSpeaker.id,
      text: '',
    });
    const db = requireDesktopSession(sessionId).db;
    const plan = planTranscription(db, { unitId, audioLayerId: voiceId, targetLayerId: layer.id });
    expect(plan.action).toBe('choose');
    expect(() =>
      assertTranscriptionWrite(db, { unitId, audioLayerId: voiceId, targetLayerId: layer.id }),
    ).toThrow('transcription target is ambiguous');
    expect(
      assertTranscriptionWrite(db, {
        unitId,
        audioLayerId: voiceId,
        targetLayerId: layer.id,
        targetUnitId: first.id,
        confirmLonger: true,
      }),
    ).toMatchObject({ kind: 'write', unitId: first.id });
  });

  it('stops when the copied speaker would overlap, and the new segment can be undone', () => {
    const { sessionId, manuscriptId, unitId } = project();
    const speaker = callDesktopSession(sessionId, 'speakers.create', { name: '甲' }) as {
      id: string;
    };
    const db = requireDesktopSession(sessionId).db;
    db.prepare('UPDATE units SET speaker_id = ? WHERE id = ?').run(speaker.id, unitId);
    const layer = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-overlap',
      name: { zh: '重叠' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startMs: 0,
      endMs: 150,
      speakerId: speaker.id,
      text: '',
    });
    expect(() =>
      recordTranscriptionUnit(db, sessionId, {
        layerId: layer.id,
        startMs: 100,
        endMs: 200,
        speakerId: speaker.id,
        operationId: 'op-overlap',
      }),
    ).toThrow('speaker time overlaps');

    const empty = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-new',
      name: { zh: '新建' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const created = recordTranscriptionUnit(db, sessionId, {
      layerId: empty.id,
      startMs: 100,
      endMs: 200,
      speakerId: speaker.id,
      operationId: 'op-create',
    });
    expect(created.speakerId).toBe(speaker.id);
    expect(
      db.prepare('SELECT operation_id FROM edit_receipts WHERE operation_id = ?').get('op-create'),
    ).toMatchObject({ operation_id: 'op-create' });
    callDesktopSession(sessionId, 'units.undo', {});
    expect(db.prepare('SELECT id FROM units WHERE id = ?').get(created.id)).toBeUndefined();
  });

  it.each(['removed source', 'draft storage failure'])(
    'leaves no unit or receipt after %s through recordings.transcribe',
    async (failure) => {
      const { sessionId, manuscriptId, unitId, voiceId } = project();
      const target = callDesktopSession(sessionId, 'layers.create', {
        manuscriptId,
        key: 'handler',
        name: { zh: '目标' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      }) as { id: string };
      const clip = (await callDesktopSession(sessionId, 'recordings.attach', {
        unitId,
        layerId: voiceId,
        mimeType: 'audio/wav',
        bytes: Buffer.from('audio'),
        operationId: 'clip',
      })) as { audioId: string };
      let resolve!: (value: unknown) => void;
      model.transcribe.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const task = callDesktopSession(sessionId, 'recordings.transcribe', {
        unitId,
        layerId: voiceId,
        targetLayerId: target.id,
        audioId: clip.audioId,
        createUnit: true,
        operationId: 'target-handler',
      }) as Promise<unknown>;
      const db = requireDesktopSession(sessionId).db;
      if (failure === 'removed source') {
        await callDesktopSession(sessionId, 'recordings.detach', {
          unitId,
          layerId: voiceId,
          audioId: clip.audioId,
        });
      } else {
        db.exec(`CREATE TEMP TRIGGER fail_draft BEFORE INSERT ON unit_text_drafts
        BEGIN SELECT RAISE(ABORT, 'injected draft failure'); END`);
      }
      const rejected = expect(task).rejects.toThrow(
        failure === 'removed source' ? 'oral source changed' : 'injected draft failure',
      );
      resolve({ text: '识别', model: 'local', modelVersion: '1' });
      await rejected;
      expect(db.prepare('SELECT 1 FROM units WHERE layer_id = ?').get(target.id)).toBeUndefined();
      expect(
        db.prepare('SELECT 1 FROM edit_receipts WHERE operation_id = ?').get('target-handler'),
      ).toBeUndefined();
      expect(() => callDesktopSession(sessionId, 'units.undo', {})).toThrow('undo is empty');
      callDesktopSession(sessionId, 'reopen', {});
      expect(
        requireDesktopSession(sessionId)
          .db.prepare('SELECT 1 FROM units WHERE layer_id = ?')
          .get(target.id),
      ).toBeUndefined();
    },
  );

  it('creates the draft through recordings.transcribe and restores it across undo, redo and reopen', async () => {
    const { sessionId, manuscriptId, unitId, voiceId } = project();
    const target = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'handler-success',
      name: { zh: '目标' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const clip = (await callDesktopSession(sessionId, 'recordings.attach', {
      unitId,
      layerId: voiceId,
      mimeType: 'audio/wav',
      bytes: Buffer.from('audio'),
      operationId: 'source',
    })) as { audioId: string };
    model.transcribe.mockResolvedValueOnce({ text: '识别草稿', model: 'local', modelVersion: '1' });
    await callDesktopSession(sessionId, 'recordings.transcribe', {
      unitId,
      layerId: voiceId,
      targetLayerId: target.id,
      audioId: clip.audioId,
      operationId: 'transcribed-unit',
      createUnit: true,
    });
    const [created] = callDesktopSession(sessionId, 'units.list', { layerId: target.id }) as {
      id: string;
    }[];
    expect(created).toBeDefined();
    const read = () =>
      callDesktopSession(sessionId, 'units.readTextDraft', {
        unitId: created!.id,
        textLayerId: target.id,
      });
    const before = read();
    expect(before).toMatchObject({ rawInput: '识别草稿', baseBody: '' });
    callDesktopSession(sessionId, 'units.undo', {});
    expect(callDesktopSession(sessionId, 'units.list', { layerId: target.id })).toEqual([]);
    callDesktopSession(sessionId, 'units.redo', {});
    expect(read()).toEqual(before);
    callDesktopSession(sessionId, 'reopen', {});
    expect(read()).toEqual(before);
    expect(
      requireDesktopSession(sessionId)
        .db.prepare('SELECT 1 FROM edit_receipts WHERE operation_id = ?')
        .get('transcribed-unit'),
    ).toBeDefined();
  });

  it('rolls back the created unit, receipt and undo frame when committing the draft fails', () => {
    const { sessionId, manuscriptId } = project();
    const layer = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'atomic',
      name: { zh: '目标' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const db = requireDesktopSession(sessionId).db;
    expect(() =>
      recordTranscriptionUnit(
        db,
        sessionId,
        {
          layerId: layer.id,
          startMs: 100,
          endMs: 200,
          speakerId: null,
          operationId: 'failed-target',
        },
        () => {
          throw new Error('oral source changed');
        },
      ),
    ).toThrow('oral source changed');
    expect(db.prepare('SELECT id FROM units WHERE layer_id = ?').all(layer.id)).toEqual([]);
    expect(
      db.prepare('SELECT 1 FROM edit_receipts WHERE operation_id = ?').get('failed-target'),
    ).toBeUndefined();
    // No in-memory undo frame was registered for the rolled-back write.
    expect(() => callDesktopSession(sessionId, 'units.undo', {})).toThrow('undo is empty');
    callDesktopSession(sessionId, 'reopen', {});
    expect(
      requireDesktopSession(sessionId)
        .db.prepare('SELECT id FROM units WHERE layer_id = ?')
        .all(layer.id),
    ).toEqual([]);
  });

  it('restores the recognized draft and provenance on redo and refuses undo after draft edits', () => {
    const { sessionId, manuscriptId, voiceId } = project();
    const layer = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'redo-draft',
      name: { zh: '目标' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const db = requireDesktopSession(sessionId).db;
    const created = recordTranscriptionUnit(
      db,
      sessionId,
      {
        layerId: layer.id,
        startMs: 100,
        endMs: 200,
        speakerId: null,
      },
      (unitId) => {
        proposeOralDraft(db, {
          unitId,
          audioLayerId: voiceId,
          textLayerId: layer.id,
          text: '识别草稿',
          model: 'local',
          modelVersion: '1',
          audioId: 'source-audio',
        });
      },
    );
    const read = () =>
      callDesktopSession(sessionId, 'units.readTextDraft', {
        unitId: created.id,
        textLayerId: layer.id,
      });
    const before = read();
    expect(before).toMatchObject({ rawInput: '识别草稿', baseBody: '' });
    callDesktopSession(sessionId, 'units.undo', {});
    expect(
      db.prepare('SELECT 1 FROM unit_text_drafts WHERE unit_id = ?').get(created.id),
    ).toBeUndefined();
    callDesktopSession(sessionId, 'units.redo', {});
    expect(read()).toEqual(before);
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: created.id,
      textLayerId: layer.id,
      rawInput: '手改',
      baseBody: '',
    });
    expect(() => callDesktopSession(sessionId, 'units.undo', {})).toThrow(
      'unit create undo is stale',
    );
    callDesktopSession(sessionId, 'reopen', {});
    expect(read()).toMatchObject({ rawInput: '手改' });
  });

  it('refuses a second draft and keeps the text layer when the recording layer is deleted', () => {
    const { sessionId, manuscriptId, hostId, unitId, voiceId } = project();
    const text = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'beside',
      name: { zh: '旁边' },
      tierType: 'symbolic-association',
      contentType: 'transcription',
      hosts: [{ hostLayerId: hostId, preferred: true }],
    }) as { id: string };
    const db = requireDesktopSession(sessionId).db;
    proposeOralDraft(db, {
      unitId,
      audioLayerId: voiceId,
      textLayerId: text.id,
      text: '草稿',
      model: 'local',
      modelVersion: '1',
    });
    expect(() =>
      planTranscription(db, { unitId, audioLayerId: voiceId, targetLayerId: text.id }),
    ).toThrow('oral draft exists');
    callDesktopSession(sessionId, 'layers.delete', { id: voiceId, mode: 'soft' });
    const row = db.prepare('SELECT deleted_at FROM layers WHERE id = ?').get(text.id) as {
      deleted_at: string | null;
    };
    expect(row.deleted_at).toBeNull();
  });
});

function projectHost(sessionId: string, audioLayerId: string): string {
  const row = requireDesktopSession(sessionId)
    .db.prepare('SELECT host_layer_id FROM layer_links WHERE layer_id = ? AND is_preferred = 1')
    .get(audioLayerId) as { host_layer_id: string };
  return row.host_layer_id;
}
