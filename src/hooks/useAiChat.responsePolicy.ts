import type { AiResponsePreferenceFormat, AiResponsePreferenceLanguage, AiSessionMemory } from './useAiChat.types';
import type { Locale } from '../i18n';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';

export interface ResolvedResponsePolicy {
  language: AiResponsePreferenceLanguage;
  locale: Locale;
  style: AiToolFeedbackStyle;
  format?: AiResponsePreferenceFormat;
  evidenceRequired: boolean;
}

export function resolveAiChatResponsePolicy(
  memory: AiSessionMemory,
  fallbackLocale: Locale,
  fallbackStyle: AiToolFeedbackStyle,
): ResolvedResponsePolicy {
  const language = memory.responsePreferences?.language ?? 'auto';
  const locale: Locale = language === 'en'
    ? 'en-US'
    : language === 'zh-CN'
      ? 'zh-CN'
      : fallbackLocale;
  return {
    language,
    locale,
    style: memory.responsePreferences?.style ?? fallbackStyle,
    ...(memory.responsePreferences?.format ? { format: memory.responsePreferences.format } : {}),
    evidenceRequired: memory.responsePreferences?.evidenceRequired === true,
  };
}

export function buildResponsePolicyAuditMetadata(policy: ResolvedResponsePolicy): {
  schemaVersion: 1;
  phase: 'response_policy_resolution';
  policy: ResolvedResponsePolicy;
} {
  return {
    schemaVersion: 1,
    phase: 'response_policy_resolution',
    policy,
  };
}
