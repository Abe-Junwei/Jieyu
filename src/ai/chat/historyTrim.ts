import type { ChatMessage } from '../providers/LLMProvider';

export type HistoryChatMessage = ChatMessage & {
  messageId?: string;
  pinned?: boolean;
};

const SUMMARY_MESSAGE_PREFIX = 'Conversation summary:\n';

export function trimTextToMax(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  if (maxChars <= 3) return input.slice(0, maxChars);
  return `${input.slice(0, maxChars - 3)}...`;
}

/**
 * 压缩单条消息内容（截取首尾，保留关键信息） | Compress one message while preserving key tool info.
 */
const TOOL_RESULT_PREFIX = 'Local context tool';

function compressMessageContent(content: string, maxLen: number): string {
  const effectiveMax = content.startsWith(TOOL_RESULT_PREFIX) ? Math.max(maxLen, 280) : maxLen;
  if (content.length <= effectiveMax) return content;
  const toolMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
  if (toolMatch) {
    return `[tool: ${toolMatch[1]}] ${content.slice(0, Math.max(40, effectiveMax - 30))}...`;
  }
  // head/tail split: front half + "…" (1 char) + back portion = effectiveMax total
  const half = Math.floor(effectiveMax / 2);
  return `${content.slice(0, half)}…${content.slice(-Math.max(20, effectiveMax - half - 1))}`;
}

function sumChars(messages: HistoryChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function selectMessagesByPriority(messages: HistoryChatMessage[], maxChars: number): HistoryChatMessage[] {
  if (maxChars <= 0 || messages.length === 0) return [];

  const ranked = messages
    .map((message, index) => ({
      message,
      index,
      priority: message.pinned ? 2 : 1,
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.index - a.index;
    });

  let usedChars = 0;
  const selected = new Map<number, HistoryChatMessage>();
  for (const candidate of ranked) {
    const messageChars = candidate.message.content.length;
    if (usedChars + messageChars > maxChars) {
      const remaining = maxChars - usedChars;
      if (remaining >= 60) {
        selected.set(candidate.index, {
          ...candidate.message,
          content: compressMessageContent(candidate.message.content, remaining),
        });
        usedChars += remaining;
      }
      continue;
    }
    selected.set(candidate.index, candidate.message);
    usedChars += messageChars;
  }

  if (selected.size === 0) {
    const fallback = messages[messages.length - 1]!;
    selected.set(messages.length - 1, {
      ...fallback,
      content: trimTextToMax(fallback.content, maxChars),
    });
  }

  return messages.filter((_, index) => selected.has(index));
}

function extractSummaryTerms(input: string): string[] {
  if (!input.trim()) return [];
  const normalized = input.toLowerCase();
  const latinTerms = normalized.match(/[a-z0-9_]{2,}/g) ?? [];
  const cjkTerms = normalized.match(/[\u4e00-\u9fff]/g) ?? [];
  return [...latinTerms, ...cjkTerms];
}

export function estimateSummaryCoverageSimilarity(
  olderMessages: HistoryChatMessage[],
  summary: string,
): number {
  const sourceText = olderMessages
    .filter((message) => !message.pinned)
    .map((message) => message.content)
    .join('\n')
    .trim();
  const summaryText = summary.trim();
  if (!sourceText && !summaryText) return 1;
  if (!sourceText || !summaryText) return 0;

  const sourceTerms = new Set(extractSummaryTerms(sourceText));
  const summaryTerms = new Set(extractSummaryTerms(summaryText));
  if (sourceTerms.size === 0 || summaryTerms.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of sourceTerms) {
    if (summaryTerms.has(term)) overlap += 1;
  }

  const recall = overlap / sourceTerms.size;
  const jaccardDenominator = sourceTerms.size + summaryTerms.size - overlap;
  const jaccard = jaccardDenominator > 0 ? overlap / jaccardDenominator : 0;
  return Number((recall * 0.7 + jaccard * 0.3).toFixed(4));
}

export function countHistoryUserTurns(history: HistoryChatMessage[]): number {
  return history.reduce((count, message) => (message.role === 'user' ? count + 1 : count), 0);
}

/**
 * 拆分最近 N 轮与较早历史 | Split recent N rounds and older history.
 */
export function splitHistoryByRecentRounds(
  history: HistoryChatMessage[],
  recentRounds: number,
): { olderMessages: HistoryChatMessage[]; recentMessages: HistoryChatMessage[] } {
  if (history.length === 0) {
    return { olderMessages: [], recentMessages: [] };
  }
  let recentStartIndex = history.length;
  let roundsSeen = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.role === 'user') {
      roundsSeen += 1;
      if (roundsSeen > recentRounds) break;
      recentStartIndex = i;
    }
  }
  return {
    olderMessages: history.slice(0, recentStartIndex),
    recentMessages: history.slice(recentStartIndex),
  };
}

/**
 * 生成对话摘要（基于较早轮次）| Build compressed summary from older turns.
 */
export function buildConversationSummaryFromHistory(
  olderMessages: HistoryChatMessage[],
  maxChars = 1200,
): string {
  if (olderMessages.length === 0 || maxChars <= 0) return '';
  const lines = olderMessages
    .filter((message) => !message.pinned)
    .map((message) => {
      const roleLabel = message.role === 'user' ? 'U' : (message.role === 'assistant' ? 'A' : 'S');
      const normalized = message.content.replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return `${roleLabel}: ${compressMessageContent(normalized, 140)}`;
    })
    .filter((line) => line.length > 0);

  if (lines.length === 0) return '';
  return trimTextToMax(lines.join('\n'), maxChars);
}

function trimHistoryWithoutSummary(
  history: HistoryChatMessage[],
  maxChars: number,
  recentRounds: number,
): HistoryChatMessage[] {
  if (maxChars <= 0) return [];
  if (history.length === 0) return [];

  const { olderMessages, recentMessages } = splitHistoryByRecentRounds(history, recentRounds);

  const pinnedOlderMessages = olderMessages.filter((message) => message.pinned);
  const regularOlderMessages = olderMessages.filter((message) => !message.pinned);
  const requiredMessages = [...pinnedOlderMessages, ...recentMessages];
  const requiredChars = sumChars(requiredMessages);
  if (requiredChars >= maxChars) {
    return selectMessagesByPriority(requiredMessages, maxChars);
  }

  const remainingBudget = maxChars - requiredChars;
  const compressed: HistoryChatMessage[] = [];
  const perMsgLimit = regularOlderMessages.length > 0
    ? Math.max(60, Math.floor(remainingBudget / regularOlderMessages.length))
    : 0;
  let usedOlder = 0;

  for (const msg of regularOlderMessages) {
    const content = compressMessageContent(msg.content, perMsgLimit);
    if (usedOlder + content.length > remainingBudget) break;
    compressed.push(content === msg.content ? msg : { ...msg, content });
    usedOlder += content.length;
  }

  return [...compressed, ...requiredMessages];
}

/**
 * 结构化历史截断：最近轮次完整保留，较早轮次按预算压缩 | Structured history trimming with recency-first preservation.
 */
export function trimHistoryByChars(
  history: HistoryChatMessage[],
  maxChars: number,
  recentRounds = 3,
  conversationSummary = '',
): HistoryChatMessage[] {
  if (maxChars <= 0) return [];
  const normalizedSummary = conversationSummary.trim();
  if (!normalizedSummary) {
    return trimHistoryWithoutSummary(history, maxChars, recentRounds);
  }

  const summaryContent = trimTextToMax(`${SUMMARY_MESSAGE_PREFIX}${normalizedSummary}`, maxChars);
  const summaryMessage: HistoryChatMessage = {
    role: 'assistant',
    content: summaryContent,
  };
  const summaryChars = summaryMessage.content.length;
  if (summaryChars >= maxChars) return [summaryMessage];

  const trimmedHistory = trimHistoryWithoutSummary(history, maxChars - summaryChars, recentRounds);
  return [summaryMessage, ...trimmedHistory];
}
