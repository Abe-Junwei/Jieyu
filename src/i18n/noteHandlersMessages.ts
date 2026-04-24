import { normalizeLocale, t, tf, type Locale } from './index';

export type NoteHandlersMessages = {
  actionPosSave: string;
  actionPosBatchSave: string;
  posUpdated: string;
  posCleared: string;
  posSaveFailed: string;
  posFormNotFound: (form: string) => string;
  posBatchSaved: (count: number) => string;
  posBatchSaveFailed: string;
  posBatchCandidateMissing: string;
  recommendationTargetMissing: string;
  riskReviewJumped: (confidenceText: string) => string;
  recommendationJumped: string;
  recommendationBatchApplied: (count: number, form: string, pos: string) => string;
  confidenceSuffix: (confidence: number) => string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getNoteHandlersMessages(locale: Locale): NoteHandlersMessages {
  const l = dictLocale(locale);
  return {
    actionPosSave: t(l, 'msg.noteHandlers.actionPosSave'),
    actionPosBatchSave: t(l, 'msg.noteHandlers.actionPosBatchSave'),
    posUpdated: t(l, 'msg.noteHandlers.posUpdated'),
    posCleared: t(l, 'msg.noteHandlers.posCleared'),
    posSaveFailed: t(l, 'msg.noteHandlers.posSaveFailed'),
    posFormNotFound: (form) => tf(l, 'msg.noteHandlers.posFormNotFound', { form }),
    posBatchSaved: (count) => tf(l, 'msg.noteHandlers.posBatchSaved', { count }),
    posBatchSaveFailed: t(l, 'msg.noteHandlers.posBatchSaveFailed'),
    posBatchCandidateMissing: t(l, 'msg.noteHandlers.posBatchCandidateMissing'),
    recommendationTargetMissing: t(l, 'msg.noteHandlers.recommendationTargetMissing'),
    riskReviewJumped: (confidenceText) => tf(l, 'msg.noteHandlers.riskReviewJumped', { confidenceText }),
    recommendationJumped: t(l, 'msg.noteHandlers.recommendationJumped'),
    recommendationBatchApplied: (count, form, pos) =>
      tf(l, 'msg.noteHandlers.recommendationBatchApplied', { count, form, pos }),
    confidenceSuffix: (confidence) =>
      tf(l, 'msg.noteHandlers.confidenceSuffix', { pct: (confidence * 100).toFixed(1) }),
  };
}
