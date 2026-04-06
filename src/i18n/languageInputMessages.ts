/**
 * 语言输入组件国际化文案 | Language input component i18n messages
 */
import type { Locale } from './index';

export interface LanguageInputMessages {
  /** 多语言匹配歧义提示 | Ambiguity hint when multiple languages match */
  ambiguityHint: string;
  /** 无效语言代码错误 | Invalid language code error */
  invalidLanguageCode: string;
}

const zhCN: LanguageInputMessages = {
  ambiguityHint: '存在多个可能语言，请选择更具体项。',
  invalidLanguageCode: '请输入有效的 ISO 639 / BCP 47 语言代码。',
};

const enUS: LanguageInputMessages = {
  ambiguityHint: 'Multiple languages matched. Please choose a more specific option.',
  invalidLanguageCode: 'Enter a valid ISO 639 / BCP 47 language code.',
};

export function getLanguageInputMessages(locale: Locale): LanguageInputMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
