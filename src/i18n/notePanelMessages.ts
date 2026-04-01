import type { Locale } from './index';

export type NotePanelMessages = {
  categoryComment: string;
  categoryQuestion: string;
  categoryTodo: string;
  panelTitle: (targetLabel: string) => string;
  closePanel: string;
  empty: string;
  save: string;
  cancel: string;
  deleteNote: string;
  newNotePlaceholder: string;
  noCategory: string;
  add: string;
};

const zhCN: NotePanelMessages = {
  categoryComment: '\u8bc4\u6ce8',
  categoryQuestion: '\u7591\u95ee',
  categoryTodo: '\u5f85\u529e',
  panelTitle: (targetLabel) => `\u5907\u6ce8 \u2014 ${targetLabel}`,
  closePanel: '\u5173\u95ed\u5907\u6ce8\u9762\u677f',
  empty: '\u6682\u65e0\u5907\u6ce8',
  save: '\u4fdd\u5b58',
  cancel: '\u53d6\u6d88',
  deleteNote: '\u5220\u9664\u5907\u6ce8',
  newNotePlaceholder: '\u8f93\u5165\u65b0\u5907\u6ce8\u2026\uff08Ctrl+Enter \u63d0\u4ea4\uff09',
  noCategory: '\u65e0\u5206\u7c7b',
  add: '\u6dfb\u52a0',
};

const enUS: NotePanelMessages = {
  categoryComment: 'Comment',
  categoryQuestion: 'Question',
  categoryTodo: 'Todo',
  panelTitle: (targetLabel) => `Notes - ${targetLabel}`,
  closePanel: 'Close notes panel',
  empty: 'No notes yet',
  save: 'Save',
  cancel: 'Cancel',
  deleteNote: 'Delete note',
  newNotePlaceholder: 'Enter a new note… (Ctrl+Enter to submit)',
  noCategory: 'No category',
  add: 'Add',
};

export function getNotePanelMessages(locale: Locale): NotePanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
