import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { finishAttachmentCleanup } from './attachments';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-attachment-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('lexeme attachments', () => {
  it('publishes the bytes before the row and reads the same link after reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const bytes = Buffer.from('ping');
    expect(() => publish(session.sessionId, 'missing', bytes, 'op-bad-kind', 'nope')).toThrow(
      'attachment kind is invalid',
    );
    expect(() =>
      callDesktopSession(session.sessionId, 'attachments.publish', {
        lexemeId: 'missing',
        displayName: 'a.png',
        kind: 'image',
        mimeType: 'image/png',
        bytes: 'ping',
        operationId: 'op-bad-bytes',
      }),
    ).toThrow('attachment bytes are invalid');
    expect(() =>
      callDesktopSession(session.sessionId, 'attachments.publish', {
        lexemeId: 'missing',
        displayName: 'a.png',
        kind: 'image',
        mimeType: 'image/png',
        bytes,
        operationId: 'op-extra',
        refCount: 1,
      }),
    ).toThrow('desktop call field refCount is not supported');
    expect(existsSync(join(dir, 'attachments'))).toBe(false);

    expect(() => publish(session.sessionId, 'missing', bytes, 'op-missing')).toThrow(
      'lexeme is missing',
    );
    const object = join(dir, 'attachments', 'objects', sha256(bytes));
    expect(readFileSync(object)).toEqual(bytes);
    expect(count(session.sessionId, 'attachment_files')).toBe(0);

    entry(session.sessionId, 'one');
    entry(session.sessionId, 'two');
    const first = publish(session.sessionId, 'one', bytes, 'op-1');
    const second = publish(session.sessionId, 'two', bytes, 'op-2');
    expect(second.fileId).toBe(first.fileId);
    expect(second.linkId).not.toBe(first.linkId);
    expect(count(session.sessionId, 'attachment_files')).toBe(1);
    expect(count(session.sessionId, 'attachment_links')).toBe(2);

    callDesktopSession(session.sessionId, 'reopen', {});
    expect(readFileSync(object)).toEqual(bytes);
    expect(state(session.sessionId, first.fileId)).toBe('ready');
    expect(count(session.sessionId, 'attachment_links')).toBe(2);
    expect(() =>
      callDesktopSession(session.sessionId, 'attachments.removeLink', { linkId: 'missing' }),
    ).toThrow('attachment link is missing');
  });

  it('keeps the file when one link remains and returns it to ready if linked again', async () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const bytes = Buffer.from('shared');
    entry(session.sessionId, 'one');
    entry(session.sessionId, 'two');
    const first = publish(session.sessionId, 'one', bytes, 'op-1');
    const second = publish(session.sessionId, 'two', bytes, 'op-2');
    const object = join(dir, 'attachments', 'objects', sha256(bytes));

    const kept = callDesktopSession(session.sessionId, 'attachments.removeLink', {
      linkId: first.linkId,
    }) as { state: string };
    expect(kept.state).toBe('ready');
    expect(existsSync(object)).toBe(true);
    expect(count(session.sessionId, 'attachment_links')).toBe(1);

    const pending = callDesktopSession(session.sessionId, 'attachments.removeLink', {
      linkId: second.linkId,
    }) as { fileId: string; state: string };
    expect(pending).toEqual({ fileId: first.fileId, state: 'cleanup_pending' });
    expect(existsSync(object)).toBe(true);

    const again = publish(session.sessionId, 'one', bytes, 'op-3');
    expect(again.fileId).toBe(first.fileId);
    expect(state(session.sessionId, first.fileId)).toBe('ready');
    let trashed = 0;
    const finished = await finishAttachmentCleanup(
      requireDesktopSession(session.sessionId).db,
      dir,
      first.fileId,
      async () => {
        trashed += 1;
        return 'moved';
      },
    );
    expect(finished.state).toBe('ready');
    expect(trashed).toBe(0);
    expect(existsSync(object)).toBe(true);
  });

  it('refuses republishing while trash is in flight and can publish again after cleanup', async () => {
    const item = await pending();
    let release!: () => void;
    let calls = 0;
    const finish = finishAttachmentCleanup(item.db, item.dir, item.fileId, async (file) => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      rmSync(file);
      return 'moved';
    });
    expect(() => publish(item.sessionId, 'one', item.bytes, 'op-during-trash')).toThrow(
      'attachment file is unresolved',
    );
    expect((await finishAttachmentCleanup(item.db, item.dir, item.fileId, moved)).state).toBe(
      'cleanup_unknown',
    );
    expect(calls).toBe(1);
    release();
    expect((await finish).state).toBe('removed');
    callDesktopSession(item.sessionId, 'reopen', {});
    const next = publish(item.sessionId, 'one', item.bytes, 'op-after-trash');
    callDesktopSession(item.sessionId, 'reopen', {});
    expect(
      callDesktopSession(item.sessionId, 'attachments.read', { linkId: next.linkId }),
    ).toMatchObject({ bytes: item.bytes });
  });

  it('drops the row only after the hashed file is confirmed gone', async () => {
    const thrown = await pending();
    let calls = 0;
    const failed = await finishAttachmentCleanup(thrown.db, thrown.dir, thrown.fileId, async () => {
      calls += 1;
      throw new Error('trash down');
    });
    expect(failed.state).toBe('cleanup_unknown');
    expect(calls).toBe(1);
    callDesktopSession(thrown.sessionId, 'reopen', {});
    expect(state(thrown.sessionId, thrown.fileId)).toBe('cleanup_unknown');
    await finishAttachmentCleanup(
      requireDesktopSession(thrown.sessionId).db,
      thrown.dir,
      thrown.fileId,
      async () => {
        calls += 1;
        return 'moved';
      },
    );
    expect(calls).toBe(1);
    expect(() => publish(thrown.sessionId, 'one', thrown.bytes, 'op-again')).toThrow(
      'attachment file is unresolved',
    );
    expect(count(thrown.sessionId, 'attachment_links')).toBe(0);

    const missing = await pending();
    rmSync(missing.object);
    expect(
      (await finishAttachmentCleanup(missing.db, missing.dir, missing.fileId, moved)).state,
    ).toBe('cleanup_unknown');
    expect(state(missing.sessionId, missing.fileId)).toBe('cleanup_unknown');

    const mismatched = await pending();
    writeFileSync(mismatched.object, 'other');
    expect(
      (await finishAttachmentCleanup(mismatched.db, mismatched.dir, mismatched.fileId, moved))
        .state,
    ).toBe('cleanup_unknown');
    expect(existsSync(mismatched.object)).toBe(true);

    const stayed = await pending();
    expect(
      (await finishAttachmentCleanup(stayed.db, stayed.dir, stayed.fileId, async () => 'moved'))
        .state,
    ).toBe('cleanup_unknown');
    expect(existsSync(stayed.object)).toBe(true);
    expect(state(stayed.sessionId, stayed.fileId)).toBe('cleanup_unknown');

    const gone = await pending();
    expect((await finishAttachmentCleanup(gone.db, gone.dir, gone.fileId, moved)).state).toBe(
      'removed',
    );
    expect(existsSync(gone.object)).toBe(false);
    const reopened = openDesktopSession(gone.dir, [gone.dir]);
    expect(count(reopened.sessionId, 'attachment_files')).toBe(0);
  });

  it('sweeps only unfinished temp files and refuses a linked object directory', () => {
    const dir = folder();
    openProject(dir).close();
    mkdirSync(join(dir, 'attachments', 'tmp'), { recursive: true });
    mkdirSync(join(dir, 'attachments', 'objects'), { recursive: true });
    const outside = folder();
    writeFileSync(join(outside, 'secret'), 'keep');
    writeFileSync(join(dir, 'attachments', 'tmp', 'left'), 'x');
    symlinkSync(join(outside, 'secret'), join(dir, 'attachments', 'tmp', 'linked'));
    writeFileSync(join(dir, 'attachments', 'objects', 'orphan'), 'y');
    openDesktopSession(dir, [dir]);
    expect(existsSync(join(dir, 'attachments', 'tmp', 'left'))).toBe(false);
    expect(existsSync(join(dir, 'attachments', 'tmp', 'linked'))).toBe(true);
    expect(readFileSync(join(outside, 'secret'))).toEqual(Buffer.from('keep'));
    expect(readFileSync(join(dir, 'attachments', 'objects', 'orphan'))).toEqual(Buffer.from('y'));

    resetDesktopSessions();
    rmSync(join(dir, 'attachments', 'objects'), { recursive: true });
    symlinkSync(outside, join(dir, 'attachments', 'objects'));
    const linked = openDesktopSession(dir, [dir]);
    entry(linked.sessionId, 'one');
    expect(() => publish(linked.sessionId, 'one', Buffer.from('no'), 'op-link')).toThrow(
      'attachment path escapes the project folder',
    );
    expect(readFileSync(join(outside, 'secret'))).toEqual(Buffer.from('keep'));
    expect(count(linked.sessionId, 'attachment_files')).toBe(0);
  });

  it('reads a link by id and refuses another project, a path, or a bad hash', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const otherDir = folder();
    entry(session.sessionId, 'one');
    const first = publish(session.sessionId, 'one', Buffer.from('alpha'), 'op-1');
    const second = publish(session.sessionId, 'one', Buffer.from('beta'), 'op-2');
    const listed = callDesktopSession(session.sessionId, 'attachments.list', {
      lexemeId: 'one',
    }) as { id: string; displayName: string }[];
    expect(listed.map((row) => row.displayName)).toEqual(['a.png', 'a.png']);
    expect(listed.map((row) => row.id).sort()).toEqual([first.linkId, second.linkId].sort());
    const alpha = callDesktopSession(session.sessionId, 'attachments.read', {
      linkId: first.linkId,
    }) as { mimeType: string; bytes: Uint8Array };
    const beta = callDesktopSession(session.sessionId, 'attachments.read', {
      linkId: second.linkId,
    }) as { mimeType: string; bytes: Uint8Array };
    expect(alpha.mimeType).toBe('image/png');
    expect(Buffer.from(alpha.bytes).equals(Buffer.from('alpha'))).toBe(true);
    expect(Buffer.from(beta.bytes).equals(Buffer.from('beta'))).toBe(true);
    expect(() =>
      callDesktopSession(session.sessionId, 'attachments.read', {
        linkId: first.linkId,
        path: join(otherDir, 'secret'),
      }),
    ).toThrow('desktop call field path is not supported');
    writeFileSync(join(dir, 'attachments', 'objects', sha256(Buffer.from('alpha'))), 'nope');
    expect(() =>
      callDesktopSession(session.sessionId, 'attachments.read', { linkId: first.linkId }),
    ).toThrow('attachment hash does not match');
    const other = openDesktopSession(otherDir, [otherDir]);
    entry(other.sessionId, 'one');
    expect(() =>
      callDesktopSession(other.sessionId, 'attachments.read', { linkId: first.linkId }),
    ).toThrow('attachment link is missing');
    expect(existsSync(join(dir, 'attachments', 'objects', sha256(Buffer.from('beta'))))).toBe(true);
  });

  it('rejects a version 23 library without changing its bytes', () => {
    const dir = folder();
    openProject(dir).close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 23');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});

function entry(sessionId: string, id: string): void {
  callDesktopSession(sessionId, 'lexicon.saveEntry', {
    id,
    entry: { headword: id, senses: [{ id: 's', definitions: [{ text: 't' }] }] },
  });
}

function publish(
  sessionId: string,
  lexemeId: string,
  bytes: Buffer,
  operationId: string,
  kind = 'image',
): { fileId: string; linkId: string; state: string } {
  return callDesktopSession(sessionId, 'attachments.publish', {
    lexemeId,
    displayName: 'a.png',
    kind,
    mimeType: 'image/png',
    bytes,
    operationId,
  }) as { fileId: string; linkId: string; state: string };
}

function count(sessionId: string, table: 'attachment_files' | 'attachment_links'): number {
  const row = requireDesktopSession(sessionId)
    .db.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .get() as { n: number };
  return row.n;
}

function state(sessionId: string, fileId: string): string {
  const row = requireDesktopSession(sessionId)
    .db.prepare('SELECT state FROM attachment_files WHERE id = ?')
    .get(fileId) as { state: string };
  return row.state;
}

function pending(): {
  dir: string;
  sessionId: string;
  db: ReturnType<typeof requireDesktopSession>['db'];
  fileId: string;
  object: string;
  bytes: Buffer;
} {
  const dir = folder();
  const session = openDesktopSession(dir, [dir]);
  const bytes = Buffer.from(`byte-${dir}`);
  entry(session.sessionId, 'one');
  const published = publish(session.sessionId, 'one', bytes, 'op-1');
  callDesktopSession(session.sessionId, 'attachments.removeLink', { linkId: published.linkId });
  return {
    dir,
    sessionId: session.sessionId,
    db: requireDesktopSession(session.sessionId).db,
    fileId: published.fileId,
    object: join(dir, 'attachments', 'objects', sha256(bytes)),
    bytes,
  };
}

async function moved(absolute: string): Promise<'moved'> {
  rmSync(absolute);
  return 'moved';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
