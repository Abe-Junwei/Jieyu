import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attachmentSweepSettled, type AttachmentTrash } from './attachments';
import { callDesktopSession } from './desktopCall';
import {
  expireAndSweepAttachments,
  openDesktopSession,
  resetDesktopSessions,
  sweepCurrentAttachments,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-hold-'));
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

const trash: AttachmentTrash = async (absolute) => {
  rmSync(absolute);
  return 'moved';
};

function objectOf(dir: string, bytes: Buffer): string {
  return join(dir, 'attachments', 'objects', sha256(bytes));
}

function seedClip(): {
  dir: string;
  sessionId: string;
  hostId: string;
  unitId: string;
  layerId: string;
  bytes: Buffer;
} {
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
    audioName: { zh: '语音' },
    textName: { zh: '文本' },
  }) as { audioLayerId: string };
  const bytes = Buffer.from('held-clip');
  callDesktopSession(session.sessionId, 'recordings.attach', {
    unitId: unit.id,
    layerId: pair.audioLayerId,
    mimeType: 'audio/webm;codecs=opus',
    bytes,
    operationId: 'op-hold',
  });
  return {
    dir,
    sessionId: session.sessionId,
    hostId: host.id,
    unitId: unit.id,
    layerId: pair.audioLayerId,
    bytes,
  };
}

describe('attachment hold', () => {
  it('does not trash a file the undo book still cites', async () => {
    const { dir, sessionId, hostId, unitId, layerId, bytes } = seedClip();
    const other = callDesktopSession(sessionId, 'units.create', {
      layerId: hostId,
      text: '另一句',
    }) as { id: string };
    callDesktopSession(sessionId, 'recordings.attach', {
      unitId: other.id,
      layerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes,
      operationId: 'op-share',
    });
    callDesktopSession(sessionId, 'units.delete', { unitId, operationId: 'op-del' });
    await callDesktopSession(sessionId, 'recordings.detach', { unitId: other.id, layerId }, trash);
    const object = objectOf(dir, bytes);
    expect(existsSync(object)).toBe(true);
    callDesktopSession(sessionId, 'units.undo', { operationId: 'op-undo' });
    const read = callDesktopSession(sessionId, 'recordings.read', { unitId, layerId }) as {
      bytes: Uint8Array;
    };
    expect(Buffer.from(read.bytes)).toEqual(bytes);
  });

  it('trashes pending files after the session book expires', async () => {
    const { dir, sessionId, unitId, bytes } = seedClip();
    callDesktopSession(sessionId, 'units.delete', { unitId, operationId: 'op-del' });
    await expireAndSweepAttachments(trash);
    expect(existsSync(objectOf(dir, bytes))).toBe(false);
  });

  it('trashes pending files when a project opens with an empty book', async () => {
    const { dir, sessionId, unitId, bytes } = seedClip();
    callDesktopSession(sessionId, 'units.delete', { unitId, operationId: 'op-del' });
    resetDesktopSessions();
    openDesktopSession(dir, [dir]);
    expect(existsSync(objectOf(dir, bytes))).toBe(true);
    await sweepCurrentAttachments(trash);
    expect(existsSync(objectOf(dir, bytes))).toBe(false);
  });

  it('trashes a file once a new edit drops the redo frame that cited it', async () => {
    const { dir, sessionId, hostId, unitId, layerId, bytes } = seedClip();
    callDesktopSession(sessionId, 'units.delete', { unitId, operationId: 'op-del' });
    callDesktopSession(sessionId, 'units.undo', { operationId: 'op-undo' });
    await callDesktopSession(sessionId, 'recordings.detach', { unitId, layerId }, trash);
    expect(existsSync(objectOf(dir, bytes))).toBe(true);
    callDesktopSession(sessionId, 'units.create', { layerId: hostId, text: '后' }, trash);
    await attachmentSweepSettled();
    expect(existsSync(objectOf(dir, bytes))).toBe(false);
  });

  it('restores a clip attached after create when that create is undone and redone', async () => {
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
    const pair = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: host.id,
      kind: 'voice',
      audioName: { zh: '语音' },
      textName: { zh: '文本' },
    }) as { audioLayerId: string };
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: host.id,
      text: '原句',
    }) as { id: string };
    const bytes = Buffer.from('after-create');
    await callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes,
      operationId: 'op-after',
    });
    callDesktopSession(session.sessionId, 'units.undo', { operationId: 'op-undo-create' });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toBeNull();
    callDesktopSession(session.sessionId, 'units.redo', { operationId: 'op-redo-create' });
    const read = callDesktopSession(session.sessionId, 'recordings.read', {
      unitId: unit.id,
      layerId: pair.audioLayerId,
    }) as { bytes: Uint8Array };
    expect(Buffer.from(read.bytes)).toEqual(bytes);
    expect(existsSync(objectOf(dir, bytes))).toBe(true);
  });

  it('finishes an in-flight cleanup before sweeping and returning for close', async () => {
    const { dir, sessionId, hostId, unitId, layerId, bytes } = seedClip();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const slow: AttachmentTrash = async (absolute) => {
      entered = true;
      await gate;
      rmSync(absolute);
      return 'moved';
    };
    callDesktopSession(sessionId, 'units.delete', { unitId, operationId: 'op-del' });
    callDesktopSession(sessionId, 'units.undo', { operationId: 'op-undo' });
    await callDesktopSession(sessionId, 'recordings.detach', { unitId, layerId }, trash);
    callDesktopSession(sessionId, 'units.create', { layerId: hostId, text: '后' }, slow);
    for (let i = 0; i < 20 && !entered; i += 1) await Promise.resolve();
    expect(entered).toBe(true);
    let finished = false;
    const done = expireAndSweepAttachments(trash).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    release?.();
    await done;
    expect(finished).toBe(true);
    expect(existsSync(objectOf(dir, bytes))).toBe(false);
  });
});
