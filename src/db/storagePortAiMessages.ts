import { getDb } from './engine';

export async function listAiMessageIdsByConversation(conversationId: string): Promise<string[]> {
  if (conversationId.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.ai_messages
    .where('conversationId')
    .equals(conversationId)
    .toArray();
  return rows.map((row) => row.id);
}

export async function readAiMessageConversationId(messageId: string): Promise<string | undefined> {
  if (messageId.length === 0) return undefined;
  const database = await getDb();
  const message = await database.dexie.ai_messages.get(messageId);
  const conversationId = message?.conversationId?.trim() ?? '';
  return conversationId.length > 0 ? conversationId : undefined;
}
