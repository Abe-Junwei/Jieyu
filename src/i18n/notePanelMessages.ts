import { normalizeLocale, t, tf, type Locale } from './index';

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

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getNotePanelMessages(locale: Locale): NotePanelMessages {
  const l = dictLocale(locale);
  return {
    panelTitlePrefix: t(l, 'msg.notePanel.panelTitlePrefix'),
    categoryComment: t(l, 'msg.notePanel.categoryComment'),
    categoryQuestion: t(l, 'msg.notePanel.categoryQuestion'),
    categoryTodo: t(l, 'msg.notePanel.categoryTodo'),
    panelTitle: (targetLabel) => tf(l, 'msg.notePanel.panelTitle', { targetLabel }),
    noteCount: (count) => tf(l, 'msg.notePanel.noteCount', { count }),
    notesSectionTitle: t(l, 'msg.notePanel.notesSectionTitle'),
    editHint: t(l, 'msg.notePanel.editHint'),
    emptyStateHint: t(l, 'msg.notePanel.emptyStateHint'),
    closePanel: t(l, 'msg.notePanel.closePanel'),
    empty: t(l, 'msg.notePanel.empty'),
    save: t(l, 'msg.notePanel.save'),
    cancel: t(l, 'msg.notePanel.cancel'),
    deleteNote: t(l, 'msg.notePanel.deleteNote'),
    editNote: t(l, 'msg.notePanel.editNote'),
    editNoteContentLabel: t(l, 'msg.notePanel.editNoteContentLabel'),
    newNoteContentLabel: t(l, 'msg.notePanel.newNoteContentLabel'),
    newNoteCategoryLabel: t(l, 'msg.notePanel.newNoteCategoryLabel'),
    newNotePlaceholder: t(l, 'msg.notePanel.newNotePlaceholder'),
    noCategory: t(l, 'msg.notePanel.noCategory'),
    add: t(l, 'msg.notePanel.add'),
  };
}
