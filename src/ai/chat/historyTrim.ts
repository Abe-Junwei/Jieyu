import type { ChatMessage } from '../providers/LLMProvider';

export function trimTextToMax(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  if (maxChars <= 3) return input.slice(0, maxChars);
  return `${input.slice(0, maxChars - 3)}...`;
}

/**
 * 压缩单条消息内容（截取首尾，保留关键信息） | Compress one message while preserving key tool info.
 */
function compressMessageContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  // 保留工具调用 JSON 的名称 | Preserve tool-call name when JSON is present
  const toolMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
  if (toolMatch) {
    return `[tool: ${toolMatch[1]}] ${content.slice(0, Math.max(40, maxLen - 30))}...`;
  }
  const half = Math.floor(maxLen / 2);
  return `${content.slice(0, half)}…${content.slice(-Math.max(20, maxLen - half - 1))}`;
}

/**
 * 结构化历史截断：最近轮次完整保留，较早轮次按预算压缩 | Structured history trimming with recency-first preservation.
 */
export function trimHistoryByChars(
  history: ChatMessage[],
  maxChars: number,
  recentRounds = 3,
): ChatMessage[] {
  if (maxChars <= 0) return [];
  if (history.length === 0) return [];

  // 分离最近 N 轮与早期消息 | Split recent rounds from older history
  let recentStartIndex = history.length;
  let roundsSeen = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.role === 'user') {
      roundsSeen += 1;
      if (roundsSeen > recentRounds) break;
      recentStartIndex = i;
    }
  }

  const recentMessages = history.slice(recentStartIndex);
  const olderMessages = history.slice(0, recentStartIndex);

  let recentChars = 0;
  for (const msg of recentMessages) {
    recentChars += msg.content.length;
  }

  if (recentChars >= maxChars) {
    const kept: ChatMessage[] = [];
    let usedChars = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i]!;
      const messageChars = msg.content.length;
      if (messageChars > maxChars && kept.length === 0) {
        kept.push({ ...msg, content: trimTextToMax(msg.content, maxChars) });
        break;
      }
      if (usedChars + messageChars > maxChars) break;
      kept.push(msg);
      usedChars += messageChars;
    }
    return kept.reverse();
  }

  const remainingBudget = maxChars - recentChars;
  const compressed: ChatMessage[] = [];
  const perMsgLimit = olderMessages.length > 0 ? Math.max(60, Math.floor(remainingBudget / olderMessages.length)) : 0;
  let usedOlder = 0;

  for (const msg of olderMessages) {
    const content = compressMessageContent(msg.content, perMsgLimit);
    if (usedOlder + content.length > remainingBudget) break;
    compressed.push({ ...msg, content });
    usedOlder += content.length;
  }

  return [...compressed, ...recentMessages];
}
