import type { Locale } from './index';

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

const zhCN: NoteHandlersMessages = {
  actionPosSave: 'POS \u4fdd\u5b58',
  actionPosBatchSave: '\u6279\u91cf POS \u4fdd\u5b58',
  posUpdated: 'POS \u5df2\u66f4\u65b0',
  posCleared: 'POS \u5df2\u6e05\u7a7a',
  posSaveFailed: 'POS \u4fdd\u5b58\u5931\u8d25',
  posFormNotFound: (form) => `\u672a\u627e\u5230\u8bcd\u5f62\u300c${form}\u300d`,
  posBatchSaved: (count) => `\u5df2\u66f4\u65b0 ${count} \u4e2a token \u7684 POS`,
  posBatchSaveFailed: '\u6279\u91cf POS \u4fdd\u5b58\u5931\u8d25',
  posBatchCandidateMissing: '\u5f53\u524d\u6ca1\u6709\u53ef\u6267\u884c\u7684\u6279\u91cf POS \u5019\u9009',
  recommendationTargetMissing: '\u5f53\u524d\u6ca1\u6709\u53ef\u6267\u884c\u7684\u76ee\u6807\u8bed\u6bb5',
  riskReviewJumped: (confidenceText) => `\u5df2\u8df3\u8f6c\u5230\u98ce\u9669\u590d\u6838\u8bed\u6bb5${confidenceText}`,
  recommendationJumped: '\u5df2\u8df3\u8f6c\u5230\u5efa\u8bae\u5904\u7406\u8bed\u6bb5',
  recommendationBatchApplied: (count, form, pos) => `\u5df2\u6279\u91cf\u8d4b\u503c ${count} \u4e2a token\uff08${form} \u2192 ${pos}\uff09`,
  confidenceSuffix: (confidence) => `\uff08\u7f6e\u4fe1\u5ea6 ${(confidence * 100).toFixed(1)}%\uff09`,
};

const enUS: NoteHandlersMessages = {
  actionPosSave: 'Save POS',
  actionPosBatchSave: 'Save POS in Batch',
  posUpdated: 'POS updated',
  posCleared: 'POS cleared',
  posSaveFailed: 'Failed to save POS',
  posFormNotFound: (form) => `Word form "${form}" was not found`,
  posBatchSaved: (count) => `Updated POS for ${count} token(s)`,
  posBatchSaveFailed: 'Failed to save POS in batch',
  posBatchCandidateMissing: 'No executable batch POS candidate is available',
  recommendationTargetMissing: 'No executable target segment is available',
  riskReviewJumped: (confidenceText) => `Jumped to risk review segment${confidenceText}`,
  recommendationJumped: 'Jumped to the recommended segment',
  recommendationBatchApplied: (count, form, pos) => `Applied POS to ${count} token(s) (${form} -> ${pos})`,
  confidenceSuffix: (confidence) => ` (confidence ${(confidence * 100).toFixed(1)}%)`,
};

export function getNoteHandlersMessages(locale: Locale): NoteHandlersMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
