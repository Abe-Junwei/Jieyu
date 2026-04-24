/**
 * 语言输入组件国际化文案 | Language input component i18n messages
 */
import { normalizeLocale, t, type Locale } from './index';

export interface LanguageInputMessages {
  /** 多语言匹配歧义提示 | Ambiguity hint when multiple languages match */
  ambiguityHint: string;
  /** 无效语言代码错误 | Invalid language code error */
  invalidLanguageCode: string;
}

export function getLanguageInputMessages(locale: Locale): LanguageInputMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    ambiguityHint: t(normalizedLocale, 'app.languageInput.ambiguityHint'),
    invalidLanguageCode: t(normalizedLocale, 'app.languageInput.invalidLanguageCode'),
  };
}
