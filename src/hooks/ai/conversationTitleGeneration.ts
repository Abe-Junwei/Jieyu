import { getDb } from '../../db';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import { APP_LOCALES, t, type Locale } from '../../i18n';
import { createLogger } from '../../observability/logger';
import { nowIso } from './useAiChat.helpers';
import { notifyConversationListMutated } from './conversationListSync';
import {
  CONVERSATION_TITLE_LLM_TIMEOUT_MS,
  CONVERSATION_TITLE_MAX_CHARS,
  generateConversationTitleWithLlm,
  isLlmTitleGenerationDisabled,
} from './conversationTitleLlm';

const log = createLogger('conversationTitleGeneration');

export { CONVERSATION_TITLE_MAX_CHARS };

const inFlightTitlePatches = new Map<string, Promise<boolean>>();

export function buildConversationTitleRuleBased(userText: string): string {
  const withoutCode = userText.replace(/```[\s\S]*?```/g, '\n').replace(/`[^`]+`/g, ' ');
  const firstLine =
    withoutCode
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find((line) => line.length > 0) ?? '';
  const stripped = firstLine.replace(/^#+\s*/, '').trim();
  if (!stripped) return '';

  const sentenceMatch = stripped.match(/^(.+?[。！？!?])(?:\s|$)/);
  const candidate = (sentenceMatch?.[1] ?? stripped).trim();
  if (!candidate) return '';
  if (candidate.length <= CONVERSATION_TITLE_MAX_CHARS) return candidate;
  return `${candidate.slice(0, CONVERSATION_TITLE_MAX_CHARS)}…`;
}

const DEFAULT_CONVERSATION_TITLES = new Set(
  APP_LOCALES.map((locale) => t(locale, 'ai.chat.defaultConversationTitle')),
);

export function isPersistedTitleEmptyOrDefault(
  title: string | undefined | null,
  locale?: Locale,
): boolean {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) return true;
  if (locale !== undefined && trimmed === t(locale, 'ai.chat.defaultConversationTitle')) {
    return true;
  }
  return DEFAULT_CONVERSATION_TITLES.has(trimmed);
}

export function isDefaultConversationTitle(
  locale: Locale,
  title: string | undefined | null,
): boolean {
  return isPersistedTitleEmptyOrDefault(title, locale);
}

async function resolveConversationTitleCandidate(
  userText: string,
  options: Readonly<{ locale: Locale; settings: AiChatSettings }>,
): Promise<string> {
  if (!isLlmTitleGenerationDisabled()) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      CONVERSATION_TITLE_LLM_TIMEOUT_MS,
    );
    try {
      const llmTitle = await generateConversationTitleWithLlm(userText, {
        locale: options.locale,
        settings: options.settings,
        signal: controller.signal,
      });
      if (llmTitle) return llmTitle;
    } catch (error) {
      log.debug('LLM conversation title generation failed', { error });
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  return buildConversationTitleRuleBased(userText);
}

/**
 * G2d: patch Dexie title when row still has default/empty title.
 * Tries LLM first, then rule-based fallback.
 */
export async function patchConversationTitleIfNeeded(
  conversationId: string,
  userText: string,
  options?: Readonly<{ textId?: string; locale?: Locale; settings?: AiChatSettings }>,
): Promise<boolean> {
  const locale = options?.locale ?? 'zh-CN';
  const title =
    options?.settings && !isLlmTitleGenerationDisabled()
      ? await resolveConversationTitleCandidate(userText, {
          locale,
          settings: options.settings,
        })
      : buildConversationTitleRuleBased(userText);
  if (!title) return false;

  const db = await getDb();
  const conversation = await db.collections.ai_conversations
    .findOne({ selector: { id: conversationId } })
    .exec();
  if (!conversation) return false;

  const row = conversation.toJSON();
  const existing = row.title?.trim() ?? '';
  if (existing.length > 0 && !isPersistedTitleEmptyOrDefault(existing, locale)) {
    return false;
  }

  await db.collections.ai_conversations.update(conversationId, {
    title,
    updatedAt: nowIso(),
  });

  const textId = options?.textId ?? row.textId;
  notifyConversationListMutated({
    conversationId,
    ...(textId ? { textId } : {}),
  });
  return true;
}

export type ScheduleConversationTitlePatchOptions = Readonly<{
  textId?: string;
  locale?: Locale;
  settings?: AiChatSettings;
}>;

/** Schedule LLM title patch off the hot path (first user turn). */
export function scheduleConversationTitlePatch(
  conversationId: string,
  userText: string,
  options?: ScheduleConversationTitlePatchOptions,
): void {
  if (inFlightTitlePatches.has(conversationId)) return;

  const job = patchConversationTitleIfNeeded(conversationId, userText, options).finally(() => {
    inFlightTitlePatches.delete(conversationId);
  });
  inFlightTitlePatches.set(conversationId, job);
  void job;
}
