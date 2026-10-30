import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDesktopClient } from './client';
import { createDefinition, readFieldValue } from './customFields';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

it('creates a conversation and message with required values through the typed client and reloads them', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-client-fields-'));
  try {
    const { sessionId } = openDesktopSession(folder, [folder]);
    const db = requireDesktopSession(sessionId).db;
    const conversationField = createDefinition(db, {
      targetType: 'conversation',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    const messageField = createDefinition(db, {
      targetType: 'message',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    const client = createDesktopClient({
      desktopCall: async (id, method, args) => callDesktopSession(id, method, args),
    });
    await expect(client.createConversation(sessionId, 'missing')).rejects.toThrow('required');
    const conversation = await client.createConversation(sessionId, 'filled', {
      [conversationField.id]: 'conversation value',
    });
    await expect(
      client.appendMessage(sessionId, {
        conversationId: conversation.id,
        role: 'user',
        body: 'missing',
      }),
    ).rejects.toThrow('required');
    const message = await client.appendMessage(sessionId, {
      conversationId: conversation.id,
      role: 'user',
      body: 'filled',
      fieldValues: { [messageField.id]: 'message value' },
    });
    await client.reopen(sessionId);
    expect((await client.listConversations(sessionId)).map((item) => item.id)).toEqual([
      conversation.id,
    ]);
    expect((await client.listMessages(sessionId, conversation.id)).map((item) => item.id)).toEqual([
      message.id,
    ]);
    const reopened = requireDesktopSession(sessionId).db;
    expect(readFieldValue(reopened, conversationField.id, 'conversation', conversation.id)).toBe(
      'conversation value',
    );
    expect(readFieldValue(reopened, messageField.id, 'message', message.id)).toBe('message value');
  } finally {
    resetDesktopSessions();
    rmSync(folder, { recursive: true, force: true });
  }
});
