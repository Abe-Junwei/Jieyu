import { normalizeLocale } from './index';

export type ConfirmDeleteDialogMessages = {
  defaultTitle: string;
  segmentDeleteMany: (totalCount: number, textCount: number, emptyCount: number) => string;
  segmentDeleteSingle: string;
  itemDeleteMany: (itemCount: number) => string;
  deleteCannotUndo: string;
  mutePromptInSession: string;
};

const zhCN: ConfirmDeleteDialogMessages = {
  defaultTitle: '\u786e\u8ba4\u5220\u9664',
  segmentDeleteMany: (totalCount, textCount, emptyCount) =>
    `\u5c06\u5220\u9664 ${totalCount} \u4e2a\u53e5\u6bb5\uff08\u542b\u6587\u672c ${textCount} \u4e2a\uff0c\u7a7a\u767d ${emptyCount} \u4e2a\uff09\u3002`,
  segmentDeleteSingle: '\u5f53\u524d\u53e5\u6bb5\u5305\u542b\u6587\u672c\u5185\u5bb9\uff0c\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002',
  itemDeleteMany: (itemCount) => `\u5c06\u5220\u9664 ${itemCount} \u4e2a\u9879\u76ee\uff0c\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002`,
  deleteCannotUndo: '\u6b64\u64cd\u4f5c\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002',
  mutePromptInSession: '\u672c\u6b21\u4f1a\u8bdd\u540e\u7eed\u5220\u9664\u542b\u6587\u672c\u53e5\u6bb5\u65f6\u4e0d\u518d\u63d0\u793a',
};

const enUS: ConfirmDeleteDialogMessages = {
  defaultTitle: 'Confirm Delete',
  segmentDeleteMany: (totalCount, textCount, emptyCount) =>
    `This will delete ${totalCount} segment(s) (${textCount} with text, ${emptyCount} empty).`,
  segmentDeleteSingle: 'The current segment contains text content and cannot be recovered after deletion.',
  itemDeleteMany: (itemCount) => `This will delete ${itemCount} item(s) and cannot be undone.`,
  deleteCannotUndo: 'This action cannot be undone once deleted.',
  mutePromptInSession: 'Do not show this prompt again in this session when deleting segments with text',
};

export function getConfirmDeleteDialogMessages(locale: string): ConfirmDeleteDialogMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
