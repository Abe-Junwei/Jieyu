import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
