import { normalizeLocale, t, tf } from './index';

export type AiEmbeddingStateMessages = {
  cancelUnavailable: string;
  retryUnavailable: string;
  reQueued: (taskId: string) => string;
  noTextForMedia: string;
  preparingEmbeddingTask: string;
  embeddingBuildCompleted: string;
  runningPrefix: string;
  embeddingBuildFailed: string;
  preparingNotesTask: string;
  notesCompleted: string;
  notesRunningPrefix: string;
  notesFailed: string;
  preparingPdfTask: string;
  pdfCompleted: string;
  pdfRunningPrefix: string;
  pdfFailed: string;
  selectUnitFirst: string;
  currentUnitEmpty: string;
  searchingSimilar: string;
  noEmbeddingForQueryWarning: string;
  noEmbeddingNoResults: string;
  searchDone: (count: number) => string;
  searchFailed: string;
};

function dictLocale(locale: string): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getAiEmbeddingStateMessages(locale: string): AiEmbeddingStateMessages {
  const l = dictLocale(locale);
  return {
    cancelUnavailable: t(l, 'msg.embState.cancelUnavailable'),
    retryUnavailable: t(l, 'msg.embState.retryUnavailable'),
    reQueued: (taskId) => tf(l, 'msg.embState.reQueued', { taskId }),
    noTextForMedia: t(l, 'msg.embState.noTextForMedia'),
    preparingEmbeddingTask: t(l, 'msg.embState.preparingEmbeddingTask'),
    embeddingBuildCompleted: t(l, 'msg.embState.embeddingBuildCompleted'),
    runningPrefix: t(l, 'msg.embState.runningPrefix'),
    embeddingBuildFailed: t(l, 'msg.embState.embeddingBuildFailed'),
    preparingNotesTask: t(l, 'msg.embState.preparingNotesTask'),
    notesCompleted: t(l, 'msg.embState.notesCompleted'),
    notesRunningPrefix: t(l, 'msg.embState.notesRunningPrefix'),
    notesFailed: t(l, 'msg.embState.notesFailed'),
    preparingPdfTask: t(l, 'msg.embState.preparingPdfTask'),
    pdfCompleted: t(l, 'msg.embState.pdfCompleted'),
    pdfRunningPrefix: t(l, 'msg.embState.pdfRunningPrefix'),
    pdfFailed: t(l, 'msg.embState.pdfFailed'),
    selectUnitFirst: t(l, 'msg.embState.selectUnitFirst'),
    currentUnitEmpty: t(l, 'msg.embState.currentUnitEmpty'),
    searchingSimilar: t(l, 'msg.embState.searchingSimilar'),
    noEmbeddingForQueryWarning: t(l, 'msg.embState.noEmbeddingForQueryWarning'),
    noEmbeddingNoResults: t(l, 'msg.embState.noEmbeddingNoResults'),
    searchDone: (count) => tf(l, 'msg.embState.searchDone', { count }),
    searchFailed: t(l, 'msg.embState.searchFailed'),
  };
}
