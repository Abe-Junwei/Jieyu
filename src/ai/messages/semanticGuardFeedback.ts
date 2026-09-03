import { t, type Locale } from '../../i18n';

export function formatSemanticGuardBlockedMessage(locale?: Locale | string): string {
  const normalized: Locale = locale === 'en-US' ? 'en-US' : 'zh-CN';
  return t(normalized, 'ai.semanticGuard.blocked');
}
