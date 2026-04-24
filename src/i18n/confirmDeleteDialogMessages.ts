import { normalizeLocale, t, tf, type Locale } from './index';

export type ConfirmDeleteDialogMessages = {
  defaultTitle: string;
  segmentDeleteMany: (totalCount: number, textCount: number, emptyCount: number) => string;
  segmentDeleteSingle: string;
  itemDeleteMany: (itemCount: number) => string;
  deleteCannotUndo: string;
  mutePromptInSession: string;
};

export function getConfirmDeleteDialogMessages(locale: string): ConfirmDeleteDialogMessages {
  const normalizedLocale: Locale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    defaultTitle: t(normalizedLocale, 'transcription.confirmDelete.defaultTitle'),
    segmentDeleteMany: (totalCount, textCount, emptyCount) => tf(
      normalizedLocale,
      'transcription.confirmDelete.segmentDeleteMany',
      { totalCount, textCount, emptyCount },
    ),
    segmentDeleteSingle: t(normalizedLocale, 'transcription.confirmDelete.segmentDeleteSingle'),
    itemDeleteMany: (itemCount) => tf(normalizedLocale, 'transcription.confirmDelete.itemDeleteMany', { itemCount }),
    deleteCannotUndo: t(normalizedLocale, 'transcription.confirmDelete.deleteCannotUndo'),
    mutePromptInSession: t(normalizedLocale, 'transcription.confirmDelete.mutePromptInSession'),
  };
}
