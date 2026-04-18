import type { Locale } from './index';

export type TimelineLaneHeaderMessages = {
  laneLockErrorMin: string;
  timelineModeDocumentBadge: string;
  timelineModeDocumentBadgeAriaLabel: string;
};

const zhCN: TimelineLaneHeaderMessages = {
  laneLockErrorMin: '\u8bf7\u8f93\u5165\u5927\u4e8e\u7b49\u4e8e 1 \u7684\u8f68\u9053\u5e8f\u53f7',
  timelineModeDocumentBadge: '\u7eaf\u6587\u672c\u6a21\u5f0f',
  timelineModeDocumentBadgeAriaLabel: '\u5f53\u524d\u9879\u76ee\u4f7f\u7528\u7eaf\u6587\u672c\u6a21\u5f0f\uff0c\u65f6\u95f4\u6807\u8bb0\u4e0d\u5bf9\u5e94\u58f0\u5b66\u79d2',
};

const enUS: TimelineLaneHeaderMessages = {
  laneLockErrorMin: 'Please enter a lane number greater than or equal to 1',
  timelineModeDocumentBadge: 'Text-only mode',
  timelineModeDocumentBadgeAriaLabel: 'This project uses text-only mode, timestamps do not map to acoustic seconds',
};

export function getTimelineLaneHeaderMessages(locale: Locale): TimelineLaneHeaderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
