import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finishAttachmentCleanup } from './attachments';
import { callDesktopSession } from './desktopCall';
import {
  clearOralEngines,
  commitOralTranscript,
  oralTextBaseline,
  proposeOralDraft,
} from './recordingClips';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-recording-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function createPair(
  sessionId: string,
  input: {
    hostLayerId: string;
    kind: 'voice' | 'oral';
    audioName: Record<string, string>;
    textName: Record<string, string>;
  },
) {
  const audio = callDesktopSession(sessionId, 'recordings.createPair', input) as {
    audioLayerId: string;
  };
  const host = requireDesktopSession(sessionId)
    .db.prepare('SELECT manuscript_id FROM layers WHERE id = ?')
    .get(input.hostLayerId) as { manuscript_id: string };
  const text = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: host.manuscript_id,
    key: `text-${input.kind}-${audio.audioLayerId.slice(0, 8)}`,
    name: input.textName,
    tierType: 'symbolic-association',
    contentType: input.kind === 'oral' ? 'translation' : 'transcription',
    hosts: [{ hostLayerId: input.hostLayerId, preferred: true }],
  }) as { id: string };
  return { audioLayerId: audio.audioLayerId, textLayerId: text.id };
}

describe('recording clips', () => {
  it('stores one pair, keeps a second clip, and deletes only the audio', async () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };

    expect(() =>
      createPair(session.sessionId, {
        hostLayerId: host.id,
        kind: 'voice',
        audioName: { zh: '又一' },
        textName: { zh: '又一文本' },
      }),
    ).toThrow('recording pair already exists');
    const oral = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string; textLayerId: string };
    expect(oral.audioLayerId).not.toBe(pair.audioLayerId);

    const layers = callDesktopSession(session.sessionId, 'layers.list', {
      manuscriptId: manuscript.id,
    }) as { id: string; modality: string; parentId: string | null }[];
    expect(layers.find((layer) => layer.id === pair.audioLayerId)?.modality).toBe('audio');
    expect(layers.find((layer) => layer.id === pair.textLayerId)).toMatchObject({
      modality: 'text',
      parentId: null,
    });
    expect(layers.some((layer) => layer.parentId === pair.audioLayerId)).toBe(false);

    const first = Buffer.from('first-clip');
    const attached = (await callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes: first,
      operationId: 'op-1',
    })) as { fileId: string; audioId: string };
    callDesktopSession(session.sessionId, 'reopen', {});
    const read = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
    }) as { mimeType: string; bytes: Uint8Array };
    expect(read.mimeType).toBe('audio/webm;codecs=opus');
    expect(Buffer.from(read.bytes)).toEqual(first);

    const second = Buffer.from('second-clip');
    const again = (await callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes: second,
      operationId: 'op-2',
    })) as { audioId: string };
    const kept = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      audioId: again.audioId,
    }) as { bytes: Uint8Array };
    expect(Buffer.from(kept.bytes)).toEqual(second);
    const db = requireDesktopSession(session.sessionId).db;
    const oldState = db
      .prepare('SELECT state FROM attachment_files WHERE id = ?')
      .get(attached.fileId) as {
      state: string;
    };
    expect(oldState.state).toBe('ready');

    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '慢说',
    });
    await callDesktopSession(session.sessionId, 'recordings.detach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      audioId: attached.audioId,
    });
    const detached = (await callDesktopSession(session.sessionId, 'recordings.detach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      audioId: again.audioId,
    })) as { fileId: string };
    const listed = callDesktopSession(session.sessionId, 'units.list', {
      layerId: pair.textLayerId,
    }) as { id: string; text: string }[];
    expect(listed.find((item) => item.id === unit.id)?.text).toBe('慢说');
    const audioRows = db
      .prepare('SELECT COUNT(*) AS n FROM unit_texts WHERE layer_id = ? AND unit_id = ?')
      .get(pair.audioLayerId, unit.id) as { n: number };
    expect(audioRows.n).toBe(0);
    const object = join(dir, 'attachments', 'objects', sha256(second));
    expect(existsSync(object)).toBe(true);
    const cleaned = await finishAttachmentCleanup(db, dir, detached.fileId, async (absolute) => {
      rmSync(absolute);
      return 'moved';
    });
    expect(cleaned.state).toBe('removed');
    expect(existsSync(object)).toBe(false);
  });

  it('removes an unreferenced clip from the product entry and keeps a shared file', async () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string; textLayerId: string };
    const trash = async (absolute: string) => {
      rmSync(absolute);
      return 'moved' as const;
    };
    const kept = (await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('kept'),
        operationId: 'op-kept',
      },
      trash,
    )) as { fileId: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: host.id,
      text: '另一句',
    }) as { id: string };
    const shared = (await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: other.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('shared'),
        operationId: 'op-shared',
      },
      trash,
    )) as { fileId: string };
    const db = requireDesktopSession(session.sessionId).db;
    const otherText = db
      .prepare('SELECT id FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(other.id, pair.audioLayerId) as { id: string };
    db.prepare('DELETE FROM unit_text_audios WHERE unit_text_id = ?').run(otherText.id);
    db.prepare(
      `INSERT INTO unit_text_audios (id, unit_text_id, file_id, position) VALUES (?, ?, ?, 1)`,
    ).run(randomUUID(), otherText.id, kept.fileId);
    await callDesktopSession(
      session.sessionId,
      'recordings.detach',
      { unitId: other.id, layerId: pair.audioLayerId },
      trash,
    );
    expect(
      db.prepare('SELECT state FROM attachment_files WHERE id = ?').get(kept.fileId),
    ).toMatchObject({ state: 'ready' });
    expect(
      commitOralTranscript(db, {
        baseline: oralTextBaseline(db, { unitId: unit.id, textLayerId: pair.textLayerId }),
        unitId: unit.id,
        audioLayerId: pair.audioLayerId,
        textLayerId: pair.textLayerId,
        fileId: kept.fileId,
        text: '听到',
        model: 'local',
        modelVersion: '1',
      }).textLayerId,
    ).toBeTypeOf('string');
    expect(() =>
      commitOralTranscript(db, {
        baseline: '',
        unitId: unit.id,
        audioLayerId: pair.audioLayerId,
        textLayerId: pair.textLayerId,
        fileId: shared.fileId,
        text: '旧结果',
        model: 'local',
        modelVersion: '1',
      }),
    ).toThrow('oral source changed');
    await callDesktopSession(
      session.sessionId,
      'recordings.detach',
      { unitId: unit.id, layerId: pair.audioLayerId },
      trash,
    );
    const row = db.prepare('SELECT state FROM attachment_files WHERE id = ?').get(kept.fileId);
    const refs = db
      .prepare('SELECT COUNT(*) AS n FROM unit_text_audios WHERE file_id = ?')
      .get(kept.fileId);
    expect({ row, refs }).toEqual({ row: undefined, refs: { n: 0 } });
  });

  it('keeps a transcript as a draft and stamps the model only when that draft is saved', async () => {
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
      text: '原句',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: host.id,
      text: '另一句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };
    const db = requireDesktopSession(session.sessionId).db;

    await expect(
      callDesktopSession(session.sessionId, 'recordings.transcribe', {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        targetLayerId: pair.textLayerId,
      }),
    ).rejects.toThrow('recording is missing');
    callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/wav',
      bytes: Buffer.from('stored-clip'),
      operationId: 'op-clip',
    });
    await expect(
      callDesktopSession(session.sessionId, 'recordings.transcribe', {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        targetLayerId: pair.textLayerId,
      }),
    ).rejects.toThrow('local whisper is not granted');
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM unit_text_drafts').get() as { n: number }).n,
    ).toBe(0);

    const heard = {
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    };
    expect(proposeOralDraft(db, { unitId: unit.id, text: '慢说', ...heard }).textLayerId).toBe(
      pair.textLayerId,
    );
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '慢说',
      operationId: 'op-save-oral',
    });
    callDesktopSession(session.sessionId, 'reopen', {});
    const saved = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string };
    expect(saved.body).toBe('慢说');
    expect(JSON.parse(saved.provenance_json)).toMatchObject({
      method: 'auto-transcription',
      model: 'app.jieyu.whisper.tiny',
    });

    const live = requireDesktopSession(session.sessionId).db;
    proposeOralDraft(live, { unitId: other.id, text: '候选', ...heard });
    callDesktopSession(session.sessionId, 'units.discardTextDraft', {
      unitId: other.id,
      textLayerId: pair.textLayerId,
    });
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: other.id,
      textLayerId: pair.textLayerId,
      text: '手写',
      operationId: 'op-save-hand',
    });
    const handwritten = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(other.id, pair.textLayerId) as { provenance_json: string | null };
    expect(handwritten.provenance_json).toBeNull();
    proposeOralDraft(live, { unitId: unit.id, text: '再说', ...heard });
    expect(() => proposeOralDraft(live, { unitId: unit.id, text: '改稿', ...heard })).toThrow(
      'oral draft exists',
    );
    expect(
      live
        .prepare('SELECT raw_input FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?')
        .get(unit.id, pair.textLayerId),
    ).toEqual({ raw_input: '再说' });
  });

  it('undo of a confirmed transcript restores the previous text without the model stamp', () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string; textLayerId: string };
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '手写',
      operationId: 'op-hand',
    });
    const db = requireDesktopSession(session.sessionId).db;
    proposeOralDraft(db, {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      text: '慢说',
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    });
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '慢说',
      operationId: 'op-stt',
    });
    callDesktopSession(session.sessionId, 'units.undoText', {});
    const undone = db
      .prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string | null };
    expect(undone).toEqual({ body: '手写', provenance_json: null });
    callDesktopSession(session.sessionId, 'units.redo', {});
    const redone = db
      .prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string | null };
    expect(redone.body).toBe('慢说');
    expect(JSON.parse(redone.provenance_json ?? '')).toMatchObject({
      method: 'auto-transcription',
      model: 'app.jieyu.whisper.tiny',
    });
  });

  it('keeps the model on a draft across restart and clears it after a later hand edit', () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };
    proposeOralDraft(requireDesktopSession(session.sessionId).db, {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      text: '慢说',
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    });
    clearOralEngines();
    callDesktopSession(session.sessionId, 'reopen', {});
    const draft = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT provenance_json FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { provenance_json: string };
    expect(JSON.parse(draft.provenance_json)).toMatchObject({
      method: 'auto-transcription',
      model: 'app.jieyu.whisper.tiny',
    });
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '慢说',
      operationId: 'op-after-restart',
    });
    callDesktopSession(session.sessionId, 'reopen', {});
    const saved = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string };
    expect(saved.body).toBe('慢说');
    expect(JSON.parse(saved.provenance_json)).toMatchObject({ model: 'app.jieyu.whisper.tiny' });

    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '改过',
      operationId: 'op-hand-edit',
    });
    callDesktopSession(session.sessionId, 'reopen', {});
    const edited = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string | null };
    expect(edited).toEqual({ body: '改过', provenance_json: null });
  });

  it('restores the recording when a deleted unit is undone', () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string; textLayerId: string };
    const bytes = Buffer.from('kept-clip');
    callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes,
      operationId: 'op-keep',
    });
    callDesktopSession(session.sessionId, 'units.delete', { unitId: unit.id });
    expect(
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT state FROM attachment_files')
        .get(),
    ).toEqual({ state: 'cleanup_pending' });
    callDesktopSession(session.sessionId, 'units.undo', {});
    callDesktopSession(session.sessionId, 'reopen', {});
    const read = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
    }) as { bytes: Uint8Array };
    expect(Buffer.from(read.bytes)).toEqual(bytes);
    expect(
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT state FROM attachment_files')
        .get(),
    ).toEqual({ state: 'ready' });
  });

  it('clears draft provenance when the draft text changes', () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };
    proposeOralDraft(requireDesktopSession(session.sessionId).db, {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      text: '慢说',
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    });
    callDesktopSession(session.sessionId, 'units.putTextDraft', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      rawInput: '改过',
      baseBody: '',
    });
    const draft = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT provenance_json FROM unit_text_drafts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { provenance_json: string | null };
    expect(draft.provenance_json).toBeNull();
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '改过',
      operationId: 'op-retype',
    });
    const saved = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT body, provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { body: string; provenance_json: string | null };
    expect(saved).toEqual({ body: '改过', provenance_json: null });
  });

  it('repacks a later clip into 1..5 when the first clip of a written row is removed', async () => {
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
      text: '原句',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: host.id,
      text: '另一句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音' },
      textName: { zh: '文本' },
    }) as { audioLayerId: string; textLayerId: string };
    const discard = async (absolute: string) => {
      rmSync(absolute);
      return 'moved' as const;
    };
    await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('first'),
        operationId: 'op-first',
      },
      discard,
    );
    const second = (await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: other.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('second'),
        operationId: 'op-second',
      },
      discard,
    )) as { fileId: string };
    const db = requireDesktopSession(session.sessionId).db;
    const text = db
      .prepare('SELECT id FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.audioLayerId) as { id: string };
    db.prepare('UPDATE unit_texts SET body = ? WHERE id = ?').run('有字', text.id);
    db.prepare(
      `INSERT INTO unit_text_audios (id, unit_text_id, file_id, position) VALUES (?, ?, ?, 2)`,
    ).run(randomUUID(), text.id, second.fileId);
    await callDesktopSession(
      session.sessionId,
      'recordings.detach',
      { unitId: unit.id, layerId: pair.audioLayerId },
      discard,
    );
    expect(
      db
        .prepare('SELECT position, file_id FROM unit_text_audios WHERE unit_text_id = ?')
        .all(text.id),
    ).toEqual([{ position: 1, file_id: second.fileId }]);
  });

  it('lists every clip and deletes the one named by audioId', async () => {
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
      text: '原句',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: host.id,
      text: '另一句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音' },
      textName: { zh: '文本' },
    }) as { audioLayerId: string; textLayerId: string };
    const discard = async (absolute: string) => {
      rmSync(absolute);
      return 'moved' as const;
    };
    await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('first'),
        operationId: 'op-first',
      },
      discard,
    );
    const second = (await callDesktopSession(
      session.sessionId,
      'recordings.attach',
      {
        unitId: other.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/webm;codecs=opus',
        bytes: Buffer.from('second'),
        operationId: 'op-second',
      },
      discard,
    )) as { fileId: string };
    const db = requireDesktopSession(session.sessionId).db;
    const text = db
      .prepare('SELECT id FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.audioLayerId) as { id: string };
    const later = randomUUID();
    db.prepare(
      `INSERT INTO unit_text_audios (id, unit_text_id, file_id, position) VALUES (?, ?, ?, 2)`,
    ).run(later, text.id, second.fileId);
    const listed = callDesktopSession(session.sessionId, 'recordings.list', {
      layerId: pair.audioLayerId,
    }) as { id: string; unitId: string }[];
    expect(listed.map((row) => row.id)).toContain(later);
    await callDesktopSession(
      session.sessionId,
      'recordings.detach',
      { unitId: unit.id, layerId: pair.audioLayerId, audioId: later },
      discard,
    );
    expect(
      db.prepare('SELECT id FROM unit_text_audios WHERE unit_text_id = ?').all(text.id),
    ).toHaveLength(1);
    expect(db.prepare('SELECT id FROM unit_text_audios WHERE id = ?').get(later)).toBeUndefined();
  });

  it('appends a second clip and refuses a sixth', async () => {
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
      text: '原句',
    }) as { id: string };
    const pair = createPair(session.sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string; textLayerId: string };
    const attach = (n: number) =>
      callDesktopSession(session.sessionId, 'recordings.attach', {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/wav',
        bytes: Buffer.from(`clip-${n}`),
        operationId: `op-${n}`,
      }) as Promise<{ fileId: string; audioId: string }>;
    const first = await attach(1);
    const second = await attach(2);
    const db = requireDesktopSession(session.sessionId).db;
    expect(
      db
        .prepare(
          `SELECT position, file_id FROM unit_text_audios
           JOIN unit_texts ON unit_texts.id = unit_text_audios.unit_text_id
           WHERE unit_texts.unit_id = ? ORDER BY position`,
        )
        .all(unit.id),
    ).toEqual([
      { position: 1, file_id: first.fileId },
      { position: 2, file_id: second.fileId },
    ]);
    commitOralTranscript(db, {
      baseline: oralTextBaseline(db, { unitId: unit.id, textLayerId: pair.textLayerId }),
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      fileId: second.fileId,
      text: '第二条',
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    });
    await callDesktopSession(session.sessionId, 'recordings.detach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      audioId: second.audioId,
    });
    expect(() =>
      commitOralTranscript(db, {
        baseline: '',
        unitId: unit.id,
        audioLayerId: pair.audioLayerId,
        textLayerId: pair.textLayerId,
        fileId: second.fileId,
        text: '没了',
        model: 'app.jieyu.whisper.tiny',
        modelVersion: '1',
      }),
    ).toThrow('oral source changed');
    await attach(3);
    await attach(4);
    await attach(5);
    await attach(6);
    await expect(attach(7)).rejects.toThrow('oral clip cap');
  });
});

describe('oral recording safety', () => {
  function seed() {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const sessionId = session.sessionId;
    const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
      title: { und: 'Safety' },
    }) as { id: string };
    const host = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { und: 'Tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: host.id,
      text: 'source',
    }) as { id: string };
    const pair = createPair(sessionId, {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { und: 'Audio' },
      textName: { und: 'Text' },
    }) as { audioLayerId: string; textLayerId: string };
    const db = requireDesktopSession(sessionId).db;
    const heard = {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
      textLayerId: pair.textLayerId,
      text: 'model result',
      model: 'local',
      modelVersion: '1',
    };
    return { sessionId, db, dir, unit, pair, heard };
  }

  it('keeps a manual draft when a model tries to propose another one, including after reopen', () => {
    const { sessionId, unit, pair, db, heard } = seed();
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      rawInput: 'my correction',
      baseBody: '',
    });
    expect(() => proposeOralDraft(db, heard)).toThrow('oral draft exists');
    callDesktopSession(sessionId, 'reopen', {});
    expect(
      callDesktopSession(sessionId, 'units.readTextDraft', {
        unitId: unit.id,
        textLayerId: pair.textLayerId,
      }),
    ).toMatchObject({ rawInput: 'my correction', provenanceJson: null });
  });

  it.each(['draft', 'body'])(
    'rejects late model output after a %s edit and keeps it after reopen',
    async (kind) => {
      const { sessionId, unit, pair, db, heard } = seed();
      const attached = (await callDesktopSession(sessionId, 'recordings.attach', {
        unitId: unit.id,
        layerId: pair.audioLayerId,
        mimeType: 'audio/wav',
        bytes: Buffer.from('clip'),
        operationId: 'capture',
      })) as { fileId: string; audioId: string };
      const baseline = oralTextBaseline(db, heard);
      if (kind === 'draft')
        callDesktopSession(sessionId, 'units.putTextDraft', {
          unitId: unit.id,
          textLayerId: pair.textLayerId,
          rawInput: 'new correction',
          baseBody: '',
        });
      else
        callDesktopSession(sessionId, 'units.updateText', {
          unitId: unit.id,
          textLayerId: pair.textLayerId,
          text: 'new correction',
        });
      expect(() => commitOralTranscript(db, { ...heard, ...attached, baseline })).toThrow(
        kind === 'draft' ? 'oral draft exists' : 'oral text changed',
      );
      callDesktopSession(sessionId, 'reopen', {});
      if (kind === 'draft')
        expect(
          callDesktopSession(sessionId, 'units.readTextDraft', {
            unitId: unit.id,
            textLayerId: pair.textLayerId,
          }),
        ).toMatchObject({ rawInput: 'new correction', provenanceJson: null });
      else
        expect(callDesktopSession(sessionId, 'units.list', { layerId: pair.textLayerId })).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: unit.id, text: 'new correction' }),
          ]),
        );
    },
  );

  it('keeps the chosen recording source through draft, confirmation, reopen and hand edit', async () => {
    const { sessionId, unit, pair, db, heard } = seed();
    const args = {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/wav',
      bytes: Buffer.from('first'),
      operationId: 'first',
    };
    await callDesktopSession(sessionId, 'recordings.attach', args);
    const second = (await callDesktopSession(sessionId, 'recordings.attach', {
      ...args,
      bytes: Buffer.from('second'),
      operationId: 'second',
    })) as { fileId: string; audioId: string };
    commitOralTranscript(db, { ...heard, ...second, baseline: oralTextBaseline(db, heard) });
    const source = {
      audioFileId: second.fileId,
      audioId: second.audioId,
      audioLayerId: pair.audioLayerId,
    };
    callDesktopSession(sessionId, 'reopen', {});
    const draft = callDesktopSession(sessionId, 'units.readTextDraft', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
    }) as { provenanceJson: string };
    expect(JSON.parse(draft.provenanceJson)).toMatchObject({ params: source });
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: heard.text,
    });
    await callDesktopSession(sessionId, 'recordings.detach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      audioId: second.audioId,
    });
    callDesktopSession(sessionId, 'reopen', {});
    const live = requireDesktopSession(sessionId).db;
    const saved = live
      .prepare('SELECT provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
      .get(unit.id, pair.textLayerId) as { provenance_json: string };
    expect(JSON.parse(saved.provenance_json)).toMatchObject({ params: source });
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: 'manual',
    });
    expect(
      live
        .prepare('SELECT provenance_json FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
        .get(unit.id, pair.textLayerId),
    ).toEqual({ provenance_json: null });
  });

  it('replays an attachment after a lost response even when the row is full', async () => {
    const { sessionId, unit, pair } = seed();
    const args = {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/wav',
      bytes: Buffer.from('replayed'),
      operationId: 'retry-same-take',
    };
    const first = await callDesktopSession(sessionId, 'recordings.attach', args);
    for (let i = 0; i < 4; i++)
      await callDesktopSession(sessionId, 'recordings.attach', {
        ...args,
        bytes: Buffer.from(`other-${i}`),
        operationId: `other-${i}`,
      });
    expect(await callDesktopSession(sessionId, 'recordings.attach', args)).toEqual(first);
    callDesktopSession(sessionId, 'reopen', {});
    const clips = callDesktopSession(sessionId, 'recordings.list', {
      layerId: pair.audioLayerId,
    }) as unknown[];
    expect(clips).toHaveLength(5);
    expect(
      await callDesktopSession(sessionId, 'recordings.attach', {
        ...args,
        operationId: 'same-content-new-id',
      }),
    ).toEqual(first);
  });
});
