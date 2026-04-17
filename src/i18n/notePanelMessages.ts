import type { Locale } from './index';

export type NotePanelMessages = {
  panelTitlePrefix: string;
  categoryComment: string;
  categoryQuestion: string;
  categoryTodo: string;
  panelTitle: (targetLabel: string) => string;
  noteCount: (count: number) => string;
  notesSectionTitle: string;
  editHint: string;
  emptyStateHint: string;
  closePanel: string;
  empty: string;
  save: string;
  cancel: string;
  deleteNote: string;
  editNote: string;
  editNoteContentLabel: string;
  newNoteContentLabel: string;
  newNoteCategoryLabel: string;
  newNotePlaceholder: string;
  noCategory: string;
  add: string;
};

const zhCN: NotePanelMessages = {
  panelTitlePrefix: '\u5907\u6ce8\u9762\u677f',
  categoryComment: '\u8bc4\u8bba',
  categoryQuestion: '\u7591\u95ee',
  categoryTodo: '\u5f85\u529e',
  panelTitle: (targetLabel) => `\u5907\u6ce8\u9762\u677f \u00b7 ${targetLabel}`,
  noteCount: (count) => `\u5171 ${count} \u6761`,
  notesSectionTitle: '\u73b0\u6709\u5907\u6ce8',
  editHint: '\u53cc\u51fb\u5df2\u6709\u5907\u6ce8\u53ef\u5feb\u901f\u7f16\u8f91\u3002',
  emptyStateHint: '\u8fd8\u6ca1\u6709\u5907\u6ce8\uff0c\u53ef\u4ece\u4e0b\u65b9\u521b\u5efa\u7b2c\u4e00\u6761\u3002',
  closePanel: '\u5173\u95ed\u5907\u6ce8\u9762\u677f',
  empty: '\u6682\u65e0\u5907\u6ce8',
  save: '\u4fdd\u5b58',
  cancel: '\u53d6\u6d88',
  deleteNote: '\u5220\u9664\u5907\u6ce8',
  editNote: '\u7f16\u8f91\u5907\u6ce8',
  editNoteContentLabel: '\u7f16\u8f91\u5907\u6ce8\u5185\u5bb9',
  newNoteContentLabel: '\u65b0\u5907\u6ce8\u5185\u5bb9',
  newNoteCategoryLabel: '\u65b0\u5907\u6ce8\u5206\u7c7b',
  newNotePlaceholder: '\u8f93\u5165\u5907\u6ce8\u2026',
  noCategory: '\u65e0\u5206\u7c7b',
  add: '\u65b0\u589e',
};

const enUS: NotePanelMessages = {
  panelTitlePrefix: 'Notes Panel',
  categoryComment: 'Comment',
  categoryQuestion: 'Question',
  categoryTodo: 'Todo',
  panelTitle: (targetLabel) => `Notes Panel · ${targetLabel}`,
  noteCount: (count) => `${count} total`,
  notesSectionTitle: 'Existing notes',
  editHint: 'Double-click an existing note to edit it in place.',
  emptyStateHint: 'No notes yet. Create the first one below.',
  closePanel: 'Close notes panel',
  empty: 'No notes yet',
  save: 'Save',
  cancel: 'Cancel',
  deleteNote: 'Delete note',
  editNote: 'Edit note',
  editNoteContentLabel: 'Edit note content',
  newNoteContentLabel: 'New note content',
  newNoteCategoryLabel: 'New note category',
  newNotePlaceholder: 'Enter a note…',
  noCategory: 'No category',
  add: 'Add',
};

export function getNotePanelMessages(locale: Locale): NotePanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
