import type { Locale } from './index';

export type TimelineLaneHeaderMessages = {
  laneLockErrorMin: string;
  timelineModeDocumentBadge: string;
  timelineModeDocumentBadgeAriaLabel: string;
};

const zhCN: TimelineLaneHeaderMessages = {
  laneLockErrorMin: '\u8bf7\u8f93\u5165\u5927\u4e8e\u7b49\u4e8e 1 \u7684\u8f68\u9053\u5e8f\u53f7',
  timelineModeDocumentBadge: '\u903b\u8f91\u65f6\u95f4',
  timelineModeDocumentBadgeAriaLabel: '\u5f53\u524d\u9879\u76ee\u4f7f\u7528\u903b\u8f91\u65f6\u95f4\u8f74\uff0c\u65f6\u95f4\u6233\u4e0d\u5bf9\u5e94\u58f0\u5b66\u79d2',
};

const enUS: TimelineLaneHeaderMessages = {
  laneLockErrorMin: 'Please enter a lane number greater than or equal to 1',
  timelineModeDocumentBadge: 'Logical Time',
  timelineModeDocumentBadgeAriaLabel: 'This project uses a logical timeline, timestamps do not map to acoustic seconds',
};

export function getTimelineLaneHeaderMessages(locale: Locale): TimelineLaneHeaderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
