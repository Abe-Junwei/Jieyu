import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';

export type AiEmbeddingCardMessages = {
  title: string;
  engineLabel: string;
  selectProviderTitle: string;
  providerLabel: (kind: EmbeddingProviderKind) => string;
  testConnectionTitle: string;
  testButton: string;
  available: string;
  unavailable: string;
  buildCurrentMedia: string;
  embedNotes: string;
  embedPdf: string;
  findSimilar: string;
  refresh: string;
  lastRun: (generated: number, total: number, skipped: number) => string;
  queued: (count: number) => string;
  running: (count: number) => string;
  failed: (count: number) => string;
  done: (count: number) => string;
  recentTasks: string;
  all: string;
  noTasks: string;
  modelLabel: string;
  errorLabel: string;
  cancel: string;
  retry: string;
  similarityResults: string;
  similarityHint: string;
  emptyText: string;
};

const zhCN: AiEmbeddingCardMessages = {
  title: '\u5411\u91cf\u7d22\u5f15',
  engineLabel: '\u5f15\u64ce',
  selectProviderTitle: '\u9009\u62e9 Embedding \u63d0\u4f9b\u5546',
  providerLabel: (kind) => {
    if (kind === 'local') return '\u672c\u5730 (HuggingFace)';
    if (kind === 'openai-compatible') return 'OpenAI \u517c\u5bb9';
    return 'MiniMax';
  },
  testConnectionTitle: '\u6d4b\u8bd5\u8fde\u63a5',
  testButton: '\u6d4b\u8bd5',
  available: '\u53ef\u7528',
  unavailable: '\u4e0d\u53ef\u7528',
  buildCurrentMedia: '\u6784\u5efa\u5f53\u524d\u5a92\u4f53',
  embedNotes: '\u5411\u91cf\u5316\u7b14\u8bb0',
  embedPdf: '\u5411\u91cf\u5316 PDF',
  findSimilar: '\u68c0\u7d22\u76f8\u4f3c\u53e5',
  refresh: '\u5237\u65b0',
  lastRun: (generated, total, skipped) => `\u6700\u8fd1\u5b8c\u6210: ${generated}/${total}\uff08\u8df3\u8fc7 ${skipped}\uff09`,
  queued: (count) => `\u6392\u961f ${count}`,
  running: (count) => `\u8fd0\u884c ${count}`,
  failed: (count) => `\u5931\u8d25 ${count}`,
  done: (count) => `\u5b8c\u6210 ${count}`,
  recentTasks: '\u6700\u8fd1 AI \u4efb\u52a1',
  all: '\u5168\u90e8',
  noTasks: '\u6682\u65e0 AI \u4efb\u52a1',
  modelLabel: '\u6a21\u578b',
  errorLabel: '\u9519\u8bef',
  cancel: '\u53d6\u6d88',
  retry: '\u91cd\u8bd5',
  similarityResults: '\u76f8\u4f3c\u7ed3\u679c',
  similarityHint: '\u9009\u62e9\u4e00\u6761\u8bed\u6bb5\u540e\u53ef\u68c0\u7d22\u76f8\u4f3c\u8bed\u6bb5\u3002',
  emptyText: '（\u7a7a\u6587\u672c）',
};

const enUS: AiEmbeddingCardMessages = {
  title: 'Embedding Index',
  engineLabel: 'Engine',
  selectProviderTitle: 'Select Embedding provider',
  providerLabel: (kind) => {
    if (kind === 'local') return 'Local (HuggingFace)';
    if (kind === 'openai-compatible') return 'OpenAI Compatible';
    return 'MiniMax';
  },
  testConnectionTitle: 'Test connection',
  testButton: 'Test',
  available: 'OK',
  unavailable: 'Unavailable',
  buildCurrentMedia: 'Build Current Media',
  embedNotes: 'Embed Notes',
  embedPdf: 'Embed PDF',
  findSimilar: 'Find Similar',
  refresh: 'Refresh',
  lastRun: (generated, total, skipped) => `Last run: ${generated}/${total} generated (${skipped} skipped)`,
  queued: (count) => `Queued ${count}`,
  running: (count) => `Running ${count}`,
  failed: (count) => `Failed ${count}`,
  done: (count) => `Done ${count}`,
  recentTasks: 'Recent AI Tasks',
  all: 'All',
  noTasks: 'No AI tasks yet.',
  modelLabel: 'Model',
  errorLabel: 'Error',
  cancel: 'Cancel',
  retry: 'Retry',
  similarityResults: 'Similarity Results',
  similarityHint: 'Select one timeline unit to search for similar results.',
  emptyText: '(empty text)',
};

export function getAiEmbeddingCardMessages(isZh: boolean): AiEmbeddingCardMessages {
  return isZh ? zhCN : enUS;
}
