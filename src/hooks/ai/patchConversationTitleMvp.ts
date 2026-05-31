import {
  buildConversationTitleRuleBased,
  patchConversationTitleIfNeeded,
  scheduleConversationTitlePatch,
} from './conversationTitleGeneration';

/** @deprecated Use `buildConversationTitleRuleBased` (G2d). */
export function buildConversationTitleMvpFromUserText(userText: string): string {
  return buildConversationTitleRuleBased(userText);
}

/** G1d/G2d: patch Dexie title once from first user message when row still has default/empty title. */
export async function patchConversationTitleMvpIfNeeded(
  conversationId: string,
  userText: string,
): Promise<void> {
  await patchConversationTitleIfNeeded(conversationId, userText);
}

export { scheduleConversationTitlePatch };
