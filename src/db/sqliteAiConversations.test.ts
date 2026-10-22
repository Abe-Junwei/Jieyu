import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const NOW = '2026-10-22T00:00:00.000Z';
const LATER = '2026-10-22T03:00:00.000Z';
const roots: string[] = [];

function tempProject(): { root: string; folder: string; userData: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-chat-'));
  roots.push(root);
  const folder = join(root, 'project');
  mkdirSync(folder);
  const db = new Database(join(folder, 'project.sqlite'));
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${PROJECT_APPLICATION_ID}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(`
    CREATE TABLE ai_conversations (
      id TEXT PRIMARY KEY,
      text_id TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      archived INTEGER,
      cleared_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      generation_source TEXT,
      generation_model TEXT,
      error_message TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  db.close();
  return { root, folder, userData: join(root, 'user-data.sqlite') };
}

function insertConversation(
  folder: string,
  row: {
    id: string;
    title: string;
    updatedAt: string | null;
    createdAt?: string;
  },
): void {
  const db = new Database(join(folder, 'project.sqlite'));
  db.prepare(
    `INSERT INTO ai_conversations
      (id, text_id, title, mode, provider_id, model, created_at, updated_at)
     VALUES (?, 'text-1', ?, 'assistant', 'mock', 'mock', ?, ?)`,
  ).run(row.id, row.title, row.createdAt ?? NOW, row.updatedAt);
  db.close();
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sqlite project-library conversations', () => {
  it('reads a renamed conversation after the file is closed and opened again', async () => {
    const { folder, userData } = tempProject();
    insertConversation(folder, { id: 'older', title: 'Older', updatedAt: NOW });
    insertConversation(folder, { id: 'newer', title: 'Newer', updatedAt: LATER });
    const first = openSqliteStoragePort(userData, folder);
    await expect(first.port.listRecentAiConversations(1)).resolves.toMatchObject([{ id: 'newer' }]);
    await expect(
      first.port.patchAiConversation('older', { title: 'Renamed', updatedAt: LATER }),
    ).resolves.toMatchObject({ id: 'older', title: 'Renamed', updatedAt: LATER });
    first.close();
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.readAiConversation('older')).resolves.toMatchObject({
        id: 'older',
        title: 'Renamed',
        textId: 'text-1',
        updatedAt: LATER,
      });
    } finally {
      second.close();
    }
  });

  it('refuses a conversation that has no updated time and leaves the title', async () => {
    const { folder, userData } = tempProject();
    insertConversation(folder, { id: 'bare', title: 'Bare', updatedAt: null });
    const opened = openSqliteStoragePort(userData, folder);
    try {
      await expect(
        opened.port.patchAiConversation('bare', { title: 'Renamed', updatedAt: LATER }),
      ).rejects.toThrow(/conversation row is incomplete/);
      const db = new Database(join(folder, 'project.sqlite'));
      const title = db.prepare('SELECT title FROM ai_conversations WHERE id = ?').get('bare') as {
        title: string;
      };
      db.close();
      expect(title.title).toBe('Bare');
    } finally {
      opened.close();
    }
  });

  it('clears messages for one conversation and still has them gone after reopen', async () => {
    const { folder, userData } = tempProject();
    insertConversation(folder, { id: 'conv', title: 'Chat', updatedAt: NOW });
    const db = new Database(join(folder, 'project.sqlite'));
    db.prepare(
      `INSERT INTO ai_messages
        (id, conversation_id, role, content, status, created_at, updated_at)
       VALUES ('msg-1', 'conv', 'user', 'hello', 'done', ?, ?)`,
    ).run(NOW, NOW);
    db.close();
    const first = openSqliteStoragePort(userData, folder);
    await expect(first.port.clearAiConversationMessages('conv', LATER)).resolves.toBe(true);
    first.close();
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.listAiMessagesByConversation('conv')).resolves.toEqual([]);
      await expect(second.port.readAiConversation('conv')).resolves.toMatchObject({
        updatedAt: LATER,
        title: 'Chat',
      });
    } finally {
      second.close();
    }
  });

  it('reads a rewritten message after the file is closed and opened again', async () => {
    const { folder, userData } = tempProject();
    insertConversation(folder, { id: 'conv', title: 'Chat', updatedAt: NOW });
    const db = new Database(join(folder, 'project.sqlite'));
    db.prepare(
      `INSERT INTO ai_messages
        (id, conversation_id, role, content, status, created_at, updated_at)
       VALUES ('msg-1', 'conv', 'assistant', 'draft', 'streaming', ?, ?)`,
    ).run(NOW, NOW);
    db.close();
    const first = openSqliteStoragePort(userData, folder);
    await first.port.patchAiMessageContent('msg-1', {
      content: 'final',
      status: 'done',
      updatedAt: LATER,
    });
    first.close();
    const second = openSqliteStoragePort(userData, folder);
    try {
      await expect(second.port.listAiMessagesByConversation('conv')).resolves.toEqual([
        {
          id: 'msg-1',
          conversationId: 'conv',
          role: 'assistant',
          content: 'final',
          status: 'done',
          createdAt: NOW,
          updatedAt: LATER,
        },
      ]);
    } finally {
      second.close();
    }
  });

  it('does not open conversations when no project folder is open', async () => {
    const { userData } = tempProject();
    const opened = openSqliteStoragePort(userData);
    try {
      await expect(opened.port.listRecentAiConversations(1)).rejects.toThrow(
        /has not opened a project folder/,
      );
    } finally {
      opened.close();
    }
  });
});
