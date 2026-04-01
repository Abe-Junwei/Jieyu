import type { Locale } from './index';

export type TimelineLaneHeaderMessages = {
  laneLockErrorMin: string;
};

const zhCN: TimelineLaneHeaderMessages = {
  laneLockErrorMin: '\u8bf7\u8f93\u5165\u5927\u4e8e\u7b49\u4e8e 1 \u7684\u8f68\u9053\u5e8f\u53f7',
};

const enUS: TimelineLaneHeaderMessages = {
  laneLockErrorMin: 'Please enter a lane number greater than or equal to 1',
};

export function getTimelineLaneHeaderMessages(locale: Locale): TimelineLaneHeaderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
