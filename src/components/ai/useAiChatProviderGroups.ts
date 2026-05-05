import { useMemo } from 'react';
import { aiChatProviderDefinitions, type AiChatProviderKind } from '../../ai/providers/providerCatalog';
import type { getAiChatCardMessages } from '../../i18n/messages';

type AiChatCardMessages = ReturnType<typeof getAiChatCardMessages>;

export function useAiChatProviderGroups(cardMessages: AiChatCardMessages) {
  return useMemo(() => {
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama', 'minimax'];
    const compatibleKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'webllm', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((provider) => [provider.kind, provider]));

    const pick = (kinds: AiChatProviderKind[]) => kinds
      .map((kind) => byKind.get(kind))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

    return [
      { label: cardMessages.providerGroupOfficial, items: pick(directKinds) },
      { label: cardMessages.providerGroupCompatible, items: pick(compatibleKinds) },
      { label: cardMessages.providerGroupLocalCustom, items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, [cardMessages]);
}