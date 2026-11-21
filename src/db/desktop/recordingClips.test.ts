import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finishAttachmentCleanup } from './attachments';
import { callDesktopSession } from './desktopCall';
import { clearOralEngines, commitOralTranscript, proposeOralDraft } from './recordingClips';
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

describe('recording clips', () => {
  it('stores one pair, replaces the clip, and deletes only the audio', async () => {
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };

    expect(() =>
      callDesktopSession(session.sessionId, 'recordings.createPair', {
        hostLayerId: host.id,
        kind: 'voice',
        audioName: { zh: '又一' },
        textName: { zh: '又一文本' },
      }),
    ).toThrow('recording pair already exists');
    const oral = callDesktopSession(session.sessionId, 'recordings.createPair', {
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
      parentId: pair.audioLayerId,
    });

    const first = Buffer.from('first-clip');
    const attached = (await callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes: first,
      operationId: 'op-1',
    })) as { fileId: string };
    callDesktopSession(session.sessionId, 'reopen', {});
    const read = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
    }) as { mimeType: string; bytes: Uint8Array };
    expect(read.mimeType).toBe('audio/webm;codecs=opus');
    expect(Buffer.from(read.bytes)).toEqual(first);

    const second = Buffer.from('second-clip');
    callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes: second,
      operationId: 'op-2',
    });
    const replaced = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
    }) as { bytes: Uint8Array };
    expect(Buffer.from(replaced.bytes)).toEqual(second);
    const db = requireDesktopSession(session.sessionId).db;
    const oldState = db
      .prepare('SELECT state FROM attachment_files WHERE id = ?')
      .get(attached.fileId) as {
      state: string;
    };
    expect(oldState.state).toBe('cleanup_pending');

    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: pair.textLayerId,
      text: '慢说',
    });
    const detached = (await callDesktopSession(session.sessionId, 'recordings.detach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string };
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
    db.prepare(`UPDATE unit_texts SET audio_file_id = ? WHERE unit_id = ? AND layer_id = ?`).run(
      kept.fileId,
      other.id,
      pair.audioLayerId,
    );
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
        unitId: unit.id,
        audioLayerId: pair.audioLayerId,
        fileId: kept.fileId,
        text: '听到',
        model: 'local',
        modelVersion: '1',
      }).textLayerId,
    ).toBeTypeOf('string');
    expect(() =>
      commitOralTranscript(db, {
        unitId: unit.id,
        audioLayerId: pair.audioLayerId,
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
      .prepare('SELECT COUNT(*) AS n FROM unit_texts WHERE audio_file_id = ?')
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
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
      }),
    ).rejects.toThrow('local whisper is not granted');
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM unit_text_drafts').get() as { n: number }).n,
    ).toBe(0);

    const heard = {
      audioLayerId: pair.audioLayerId,
      model: 'app.jieyu.whisper.tiny',
      modelVersion: '1',
    };
    expect(proposeOralDraft(db, { unitId: unit.id, text: '慢说', ...heard }).textLayerId).toBe(
      pair.textLayerId,
    );
    expect(() => proposeOralDraft(db, { unitId: unit.id, text: '再说', ...heard })).toThrow(
      'oral draft exists',
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };
    proposeOralDraft(requireDesktopSession(session.sessionId).db, {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'oral',
      audioName: { zh: '口译' },
      textName: { zh: '口译文' },
    }) as { audioLayerId: string };
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音转写' },
      textName: { zh: '语音转写文本' },
    }) as { audioLayerId: string; textLayerId: string };
    proposeOralDraft(requireDesktopSession(session.sessionId).db, {
      unitId: unit.id,
      audioLayerId: pair.audioLayerId,
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
});
