import type { Locale } from './index';

export type TimelineLaneHeaderMessages = {
  editLayerMetadata: string;
  laneLockErrorMin: string;
  timelineModeDocumentBadge: string;
  timelineModeDocumentBadgeAriaLabel: string;
};

const zhCN: TimelineLaneHeaderMessages = {
  editLayerMetadata: '\u7f16\u8f91\u8be5\u5c42\u5143\u4fe1\u606f',
  laneLockErrorMin: '\u8bf7\u8f93\u5165\u5927\u4e8e\u7b49\u4e8e 1 \u7684\u8f68\u9053\u5e8f\u53f7',
  timelineModeDocumentBadge: '\u6587\u732e\u65f6\u95f4\u57fa',
  timelineModeDocumentBadgeAriaLabel: '\u5f53\u524d\u9879\u76ee\u4ee5\u6587\u732e\u65f6\u95f4\u57fa\u4e3a\u4e3b\uff1b\u8f68\u9053\u6807\u6ce8\u65f6\u95f4\u4e0e\u58f0\u5b66\u79d2\u53ef\u80fd\u4e0d\u4e00\u4e00\u5bf9\u5e94',
};

const enUS: TimelineLaneHeaderMessages = {
  editLayerMetadata: 'Edit layer metadata',
  laneLockErrorMin: 'Please enter a lane number greater than or equal to 1',
  timelineModeDocumentBadge: 'Manuscript timebase',
  timelineModeDocumentBadgeAriaLabel: 'This project uses a manuscript-style logical timebase; lane timestamps may not map 1:1 to acoustic seconds',
};

export function getTimelineLaneHeaderMessages(locale: Locale): TimelineLaneHeaderMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
