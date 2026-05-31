import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import type { ChatMessage } from '../../ai/providers/LLMProvider';
import type { Locale } from '../../i18n';

export const CONVERSATION_TITLE_MAX_CHARS = 48;
export const CONVERSATION_TITLE_LLM_TIMEOUT_MS = 15_000;
export const CONVERSATION_TITLE_LLM_MAX_TOKENS = 64;

const TITLE_SYSTEM_PROMPT_ZH = [
  '你是转写页 AI 助手的会话标题生成器。',
  '根据用户首条消息，生成一条简短的中文会话标题（名词短语或动宾短语，不要句号）。',
  '只输出标题文本，不要引号、不要 Markdown、不要解释。',
  `长度不超过 ${CONVERSATION_TITLE_MAX_CHARS} 个字符（含标点）。`,
].join('\n');

const TITLE_SYSTEM_PROMPT_EN = [
  'You generate short conversation titles for a transcription AI assistant.',
  'From the user’s first message, output one concise title (phrase, no trailing period).',
  'Output title text only: no quotes, no Markdown, no explanation.',
  `Max ${CONVERSATION_TITLE_MAX_CHARS} characters.`,
].join('\n');

function buildTitleSystemPrompt(locale: Locale): string {
  return locale === 'en-US' ? TITLE_SYSTEM_PROMPT_EN : TITLE_SYSTEM_PROMPT_ZH;
}

function buildTitleUserPrompt(userText: string, locale: Locale): string {
  const clipped = userText.trim().slice(0, 2_000);
  if (locale === 'en-US') {
    return `First user message:\n${clipped}`;
  }
  return `用户首条消息：\n${clipped}`;
}

export function sanitizeLlmConversationTitle(raw: string): string | null {
  const firstLine = raw
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  let title = firstLine
    .replace(/^["'`「『【\[]+|["'`」』】\]]+$/gu, '')
    .replace(/^(title|标题)[：:\s]+/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return null;

  if (title.length <= CONVERSATION_TITLE_MAX_CHARS) return title;
  return `${title.slice(0, CONVERSATION_TITLE_MAX_CHARS)}…`;
}

export async function generateConversationTitleWithLlm(
  userText: string,
  options: Readonly<{
    locale: Locale;
    settings: AiChatSettings;
    signal?: AbortSignal;
  }>,
): Promise<string | null> {
  const trimmed = userText.trim();
  if (!trimmed) return null;

  const { createAiChatProvider } = await import('../../ai/providers/providerCatalog');
  const provider = createAiChatProvider(options.settings);

  const messages: ChatMessage[] = [
    { role: 'system', content: buildTitleSystemPrompt(options.locale) },
    { role: 'user', content: buildTitleUserPrompt(trimmed, options.locale) },
  ];

  let response = '';
  for await (const chunk of provider.chat(messages, {
    model: options.settings.model,
    temperature: 0.2,
    maxTokens: CONVERSATION_TITLE_LLM_MAX_TOKENS,
    ...(options.signal ? { signal: options.signal } : {}),
  })) {
    if (chunk.error) return null;
    response += chunk.delta;
    if (chunk.done) break;
  }

  return sanitizeLlmConversationTitle(response);
}

export function isLlmTitleGenerationDisabled(): boolean {
  const raw = import.meta.env.VITE_AI_CONVERSATION_LLM_TITLE_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false') return true;
  return false;
}
