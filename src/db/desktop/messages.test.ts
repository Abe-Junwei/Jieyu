import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { createConversation } from './conversations';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-messages-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('message append', () => {
  it('appends by id and leaves the earlier message in place', () => {
    const { dir, sessionId, conversationId } = seed();
    const first = callDesktopSession(sessionId, 'messages.append', {
      id: 'm1',
      conversationId,
      role: 'user',
      body: '第一句',
    });
    const second = callDesktopSession(sessionId, 'messages.append', {
      conversationId,
      role: 'assistant',
      body: '第二句',
    }) as { id: string };
    expect(first).toMatchObject({ id: 'm1', role: 'user', body: '第一句' });
    expect(callDesktopSession(sessionId, 'messages.list', { conversationId })).toEqual([
      expect.objectContaining({ id: 'm1', body: '第一句' }),
      expect.objectContaining({ id: second.id, body: '第二句' }),
    ]);
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        id: 'm1',
        conversationId,
        role: 'user',
        body: '再写',
      }),
    ).toThrow('message id is duplicated');
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        conversationId,
        role: 'user',
        body: '带引用',
        citations: [{ type: 'unit', refId: 'u1' }],
      }),
    ).toThrow('desktop call field citations is not supported');
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        conversationId,
        role: 'assistant',
        body: '推理',
        reasoningContent: 'hidden',
      }),
    ).toThrow('desktop call field reasoningContent is not supported');
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        conversationId,
        role: 'assistant',
        body: '快照',
        contextSnapshot: { turn: 1 },
      }),
    ).toThrow('desktop call field contextSnapshot is not supported');
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        conversationId: 'missing',
        role: 'user',
        body: '没有会话',
      }),
    ).toThrow('conversation is missing');
    expect(() =>
      callDesktopSession(sessionId, 'messages.append', {
        conversationId,
        role: 'narrator',
        body: '不行',
      }),
    ).toThrow('desktop call role must be a message role');
    expect(callDesktopSession(sessionId, 'messages.list', { conversationId })).toEqual([
      expect.objectContaining({ id: 'm1', body: '第一句' }),
      expect.objectContaining({ id: second.id, body: '第二句' }),
    ]);
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'messages.list', { conversationId })).toEqual([
      expect.objectContaining({ id: 'm1', body: '第一句', role: 'user' }),
      expect.objectContaining({ id: second.id, body: '第二句', role: 'assistant' }),
    ]);
  });

  it('rewrites one body and clears only that conversation', () => {
    const dir = folder();
    const project = openProject(dir);
    const first = createConversation(project.db, { title: '一' });
    const second = createConversation(project.db, { title: '二' });
    project.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', first.id);
    project.close();
    const sessionId = openDesktopSession(dir, [dir]).sessionId;
    const written = callDesktopSession(sessionId, 'messages.append', {
      id: 'm1',
      conversationId: first.id,
      role: 'user',
      body: '原句',
    }) as { createdAt: string; role: string };
    callDesktopSession(sessionId, 'messages.append', {
      id: 'm2',
      conversationId: second.id,
      role: 'assistant',
      body: '留下',
    });
    expect(
      callDesktopSession(sessionId, 'messages.update', { id: 'm1', body: '改后' }),
    ).toMatchObject({
      id: 'm1',
      role: written.role,
      body: '改后',
      createdAt: written.createdAt,
    });
    expect(() =>
      callDesktopSession(sessionId, 'messages.update', { id: 'missing', body: '没有' }),
    ).toThrow('message is missing');
    expect(() =>
      callDesktopSession(sessionId, 'messages.update', {
        id: 'm1',
        body: '带引用',
        citations: [],
      }),
    ).toThrow('desktop call field citations is not supported');
    expect(callDesktopSession(sessionId, 'messages.clear', { conversationId: first.id })).toEqual({
      conversationId: first.id,
      cleared: 1,
    });
    expect(callDesktopSession(sessionId, 'messages.list', { conversationId: first.id })).toEqual(
      [],
    );
    expect(callDesktopSession(sessionId, 'messages.list', { conversationId: second.id })).toEqual([
      expect.objectContaining({ id: 'm2', body: '留下' }),
    ]);
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reopened.sessionId, 'messages.list', { conversationId: first.id }),
    ).toEqual([]);
    expect(
      callDesktopSession(reopened.sessionId, 'messages.list', { conversationId: second.id }),
    ).toEqual([expect.objectContaining({ id: 'm2', body: '留下' })]);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const row = db
      .prepare('SELECT title, updated_at AS updatedAt FROM conversations WHERE id = ?')
      .get(first.id) as { title: string; updatedAt: string };
    db.close();
    expect(row.title).toBe('一');
    expect(row.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});

function seed(): { dir: string; sessionId: string; conversationId: string } {
  const dir = folder();
  const project = openProject(dir);
  const conversation = createConversation(project.db, { title: '对话' });
  project.close();
  return {
    dir,
    sessionId: openDesktopSession(dir, [dir]).sessionId,
    conversationId: conversation.id,
  };
}
