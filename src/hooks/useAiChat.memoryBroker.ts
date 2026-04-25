import type { AiSessionMemory } from '../ai/chat/chatDomain.types';
import { formatMemoryBrokerContext, resolveMemoryBroker } from '../ai/memory/memoryBroker';

export function buildSessionMemoryDigestSuppressionRefs(memory: AiSessionMemory, digest: string): string[] {
  if (!digest.trim()) return [];
  return [
    ...(memory.conversationSummary?.trim() ? ['session:rolling-summary'] : []),
    ...(memory.summaryChain?.slice(-2).map((entry) => `session:summary:${entry.id}`) ?? []),
  ];
}

export async function maybeAppendMemoryBrokerContext(input: {
  enabled: boolean;
  query: string;
  contextBlock: string;
  tokenBudget: number;
  sessionMemory: AiSessionMemory;
  maxContextChars?: number;
  alreadySurfacedRefs?: readonly string[];
}): Promise<string> {
  if (!input.enabled) return input.contextBlock;
  if (input.maxContextChars !== undefined && input.contextBlock.length >= input.maxContextChars) return input.contextBlock;
  const chunks = await resolveMemoryBroker({
    query: input.query,
    tokenBudget: input.tokenBudget,
    sessionMemory: input.sessionMemory,
    ...(input.alreadySurfacedRefs ? { alreadySurfacedRefs: input.alreadySurfacedRefs } : {}),
  });
  const memoryContext = formatMemoryBrokerContext(chunks);
  if (!memoryContext) return input.contextBlock;
  const nextBlock = `${input.contextBlock}\n${memoryContext}`;
  if (input.maxContextChars === undefined || nextBlock.length <= input.maxContextChars) return nextBlock;
  const remaining = input.maxContextChars - input.contextBlock.length - 1;
  if (remaining <= '[MEMORY_BROKER_CONTEXT]'.length) return input.contextBlock;
  return `${input.contextBlock}\n${memoryContext.slice(0, remaining)}`;
}
