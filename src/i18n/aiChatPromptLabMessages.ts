import { t, tf, type Locale } from './index';

export type AiChatPromptLabMessages = {
  overviewTitle: string;
  templateCount: (count: number) => string;
  draftReady: string;
  draftEmpty: string;
  editingTemplate: string;
  libraryTitle: string;
  editorTitle: string;
  editorHint: string;
  panelNote: string;
  emptyTemplates: string;
  inject: string;
  edit: string;
  deleteShort: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  update: string;
  save: string;
  injectToInput: string;
};

function dictLocale(isZh: boolean): Locale {
  return isZh ? 'zh-CN' : 'en-US';
}

export function getAiChatPromptLabMessages(isZh: boolean): AiChatPromptLabMessages {
  const l = dictLocale(isZh);
  return {
    overviewTitle: t(l, 'msg.promptLab.overviewTitle'),
    templateCount: (count) => tf(l, 'msg.promptLab.templateCount', { count }),
    draftReady: t(l, 'msg.promptLab.draftReady'),
    draftEmpty: t(l, 'msg.promptLab.draftEmpty'),
    editingTemplate: t(l, 'msg.promptLab.editingTemplate'),
    libraryTitle: t(l, 'msg.promptLab.libraryTitle'),
    editorTitle: t(l, 'msg.promptLab.editorTitle'),
    editorHint: t(l, 'msg.promptLab.editorHint'),
    panelNote: t(l, 'msg.promptLab.panelNote'),
    emptyTemplates: t(l, 'msg.promptLab.emptyTemplates'),
    inject: t(l, 'msg.promptLab.inject'),
    edit: t(l, 'msg.promptLab.edit'),
    deleteShort: t(l, 'msg.promptLab.deleteShort'),
    titlePlaceholder: t(l, 'msg.promptLab.titlePlaceholder'),
    contentPlaceholder: t(l, 'msg.promptLab.contentPlaceholder'),
    update: t(l, 'msg.promptLab.update'),
    save: t(l, 'msg.promptLab.save'),
    injectToInput: t(l, 'msg.promptLab.injectToInput'),
  };
}
