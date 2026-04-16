import { normalizeLocale } from './index';

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

const zhCN: AiEmbeddingStateMessages = {
  cancelUnavailable: '\u4efb\u52a1\u4e0d\u53ef\u53d6\u6d88\uff08\u53ef\u80fd\u5df2\u5b8c\u6210\uff09\u3002',
  retryUnavailable: '\u8be5\u4efb\u52a1\u6682\u4e0d\u652f\u6301\u91cd\u8bd5\u3002',
  reQueued: (taskId) => `\u5df2\u91cd\u65b0\u6392\u961f: ${taskId}`,
  noTextForMedia: '\u5f53\u524d\u5a92\u4f53\u6ca1\u6709\u53ef\u5411\u91cf\u5316\u6587\u672c\u3002',
  preparingEmbeddingTask: '\u51c6\u5907 embedding \u4efb\u52a1...',
  embeddingBuildCompleted: 'embedding \u6784\u5efa\u5b8c\u6210\u3002',
  runningPrefix: '\u6784\u5efa\u4e2d',
  embeddingBuildFailed: 'embedding \u6784\u5efa\u5931\u8d25\u3002',
  preparingNotesTask: '\u51c6\u5907\u7b14\u8bb0 embedding \u4efb\u52a1...',
  notesCompleted: '\u7b14\u8bb0 embedding \u5b8c\u6210\u3002',
  notesRunningPrefix: '\u5411\u91cf\u5316\u7b14\u8bb0',
  notesFailed: '\u7b14\u8bb0 embedding \u5931\u8d25\u3002',
  preparingPdfTask: '\u51c6\u5907 PDF embedding \u4efb\u52a1...',
  pdfCompleted: 'PDF embedding \u5b8c\u6210\u3002',
  pdfRunningPrefix: '\u5411\u91cf\u5316 PDF',
  pdfFailed: 'PDF embedding \u5931\u8d25\u3002',
  selectUnitFirst: '\u8bf7\u5148\u9009\u62e9\u4e00\u6761\u8bed\u6bb5\u3002',
  currentUnitEmpty: '\u5f53\u524d\u8bed\u6bb5\u6587\u672c\u4e3a\u7a7a\uff0c\u65e0\u6cd5\u68c0\u7d22\u3002',
  searchingSimilar: '\u68c0\u7d22\u76f8\u4f3c\u8bed\u6bb5\u4e2d...',
  noEmbeddingForQueryWarning: '\u5f53\u524d\u68c0\u7d22\u672a\u751f\u6210\u53ef\u7528 embedding\uff0c\u5df2\u8df3\u8fc7\u76f8\u4f3c\u8bed\u6bb5\u53ec\u56de\u3002',
  noEmbeddingNoResults: '\u672a\u751f\u6210\u53ef\u7528 embedding\uff0c\u65e0\u6cd5\u5b8c\u6210\u76f8\u4f3c\u8bed\u6bb5\u68c0\u7d22\u3002',
  searchDone: (count) => `\u68c0\u7d22\u5b8c\u6210\uff1a${count} \u6761`,
  searchFailed: '\u68c0\u7d22\u5931\u8d25\u3002',
};

const enUS: AiEmbeddingStateMessages = {
  cancelUnavailable: 'Task cannot be cancelled (may have finished).',
  retryUnavailable: 'Retry is not available for this task.',
  reQueued: (taskId) => `Re-queued: ${taskId}`,
  noTextForMedia: 'No text to embed for current media.',
  preparingEmbeddingTask: 'Preparing embedding task...',
  embeddingBuildCompleted: 'Embedding build completed.',
  runningPrefix: 'Running',
  embeddingBuildFailed: 'Embedding build failed.',
  preparingNotesTask: 'Preparing notes embedding task...',
  notesCompleted: 'Notes embedding completed.',
  notesRunningPrefix: 'Embedding notes',
  notesFailed: 'Notes embedding failed.',
  preparingPdfTask: 'Preparing PDF embedding task...',
  pdfCompleted: 'PDF embedding completed.',
  pdfRunningPrefix: 'Embedding PDF',
  pdfFailed: 'PDF embedding failed.',
  selectUnitFirst: 'Select a timeline unit first.',
  currentUnitEmpty: 'Current unit text is empty.',
  searchingSimilar: 'Searching similar units...',
  noEmbeddingForQueryWarning: 'No usable embedding was generated for this query, so similar-unit retrieval was skipped.',
  noEmbeddingNoResults: 'No usable embedding was generated, so similar-unit retrieval could not run.',
  searchDone: (count) => `Search done: ${count} items`,
  searchFailed: 'Search failed.',
};

export function getAiEmbeddingStateMessages(locale: string): AiEmbeddingStateMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
