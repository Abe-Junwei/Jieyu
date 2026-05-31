import { getDb } from '../../db';
import type { AiConversationListItem } from './aiConversationManager.types';

const RECENT_MESSAGE_SCAN_PER_CONVERSATION = 8;

export function normalizeConversationSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function conversationTitleMatchesQuery(title: string, query: string): boolean {
  if (!query) return true;
  return title.trim().toLowerCase().includes(query);
}

export function messageBodiesMatchQuery(bodies: readonly string[], query: string): boolean {
  if (!query) return true;
  return bodies.some((body) => body.toLowerCase().includes(query));
}

export function filterConversationsBySearch(
  items: readonly AiConversationListItem[],
  query: string,
  messageBodiesByConversationId?: ReadonlyMap<string, readonly string[]>,
): AiConversationListItem[] {
  const normalized = normalizeConversationSearchQuery(query);
  if (!normalized) return [...items];

  return items.filter((item) => {
    if (conversationTitleMatchesQuery(item.title, normalized)) return true;
    const bodies = messageBodiesByConversationId?.get(item.id);
    if (!bodies || bodies.length === 0) return false;
    return messageBodiesMatchQuery(bodies, normalized);
  });
}

/** G2c: scan recent message bodies per conversation for popover search. */
export async function loadRecentMessageBodiesByConversation(
  conversationIds: readonly string[],
  maxMessagesPerConversation = RECENT_MESSAGE_SCAN_PER_CONVERSATION,
): Promise<Map<string, string[]>> {
  if (conversationIds.length === 0) return new Map();

  const db = await getDb();
  const result = new Map<string, string[]>();

  await Promise.all(
    conversationIds.map(async (conversationId) => {
      const rows = (await db.collections.ai_messages.findByIndex('conversationId', conversationId))
        .map((doc) => doc.toJSON())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, maxMessagesPerConversation);
      const bodies = rows
        .map((row) => row.content?.trim() ?? '')
        .filter((content) => content.length > 0);
      if (bodies.length > 0) {
        result.set(conversationId, bodies);
      }
    }),
  );

  return result;
}
