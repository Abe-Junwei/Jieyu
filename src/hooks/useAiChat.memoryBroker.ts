import type { AiSessionMemory } from '../ai/chat/chatDomain.types';
import { formatMemoryBrokerContext, resolveMemoryBroker } from '../ai/memory/memoryBroker';

export async function maybeAppendMemoryBrokerContext(input: {
  enabled: boolean;
  query: string;
  contextBlock: string;
  tokenBudget: number;
  sessionMemory: AiSessionMemory;
  alreadySurfacedRefs?: readonly string[];
}): Promise<string> {
  if (!input.enabled) return input.contextBlock;
  const chunks = await resolveMemoryBroker({
    query: input.query,
    tokenBudget: input.tokenBudget,
    sessionMemory: input.sessionMemory,
    ...(input.alreadySurfacedRefs ? { alreadySurfacedRefs: input.alreadySurfacedRefs } : {}),
  });
  const memoryContext = formatMemoryBrokerContext(chunks);
  return memoryContext ? `${input.contextBlock}\n${memoryContext}` : input.contextBlock;
}
