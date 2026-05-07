/**
 * P2: Fallback provider factory — extracted from useAiChat.ts
 * Pure logic: no React dependencies.
 */
import { createAiChatProvider, getDefaultAiChatSettings } from '../providers/providerCatalog';
import type { AiChatSettings } from '../providers/providerCatalog';

export function createFallbackAiChatProvider(settings: AiChatSettings) {
  if (!settings.fallbackProviderKind || settings.fallbackProviderKind === settings.providerKind) {
    return null;
  }
  const fallbackApiKey = settings.apiKeysByProvider[settings.fallbackProviderKind] ?? '';
  const fallbackSettings = getDefaultAiChatSettings(settings.fallbackProviderKind);
  return createAiChatProvider({ ...fallbackSettings, apiKey: fallbackApiKey });
}
