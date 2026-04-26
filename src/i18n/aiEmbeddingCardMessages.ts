import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { t, tf, type Locale } from './index';

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
  resumableLabel: string;
  checkpointLabel: string;
  handoffReasonLabel: string;
  cancel: string;
  retry: string;
  similarityResults: string;
  similarityHint: string;
  emptyText: string;
};

function dictLocale(isZh: boolean): Locale {
  return isZh ? 'zh-CN' : 'en-US';
}

export function getAiEmbeddingCardMessages(isZh: boolean): AiEmbeddingCardMessages {
  const l = dictLocale(isZh);
  return {
    title: t(l, 'msg.embCard.title'),
    engineLabel: t(l, 'msg.embCard.engineLabel'),
    selectProviderTitle: t(l, 'msg.embCard.selectProviderTitle'),
    providerLabel: (kind) => {
      if (kind === 'local') return t(l, 'msg.embCard.provider.local');
      if (kind === 'openai-compatible') return t(l, 'msg.embCard.provider.openaiCompatible');
      return t(l, 'msg.embCard.provider.minimax');
    },
    testConnectionTitle: t(l, 'msg.embCard.testConnectionTitle'),
    testButton: t(l, 'msg.embCard.testButton'),
    available: t(l, 'msg.embCard.available'),
    unavailable: t(l, 'msg.embCard.unavailable'),
    buildCurrentMedia: t(l, 'msg.embCard.buildCurrentMedia'),
    embedNotes: t(l, 'msg.embCard.embedNotes'),
    embedPdf: t(l, 'msg.embCard.embedPdf'),
    findSimilar: t(l, 'msg.embCard.findSimilar'),
    refresh: t(l, 'msg.embCard.refresh'),
    lastRun: (generated, total, skipped) => tf(l, 'msg.embCard.lastRun', { generated, total, skipped }),
    queued: (count) => tf(l, 'msg.embCard.queued', { count }),
    running: (count) => tf(l, 'msg.embCard.running', { count }),
    failed: (count) => tf(l, 'msg.embCard.failed', { count }),
    done: (count) => tf(l, 'msg.embCard.done', { count }),
    recentTasks: t(l, 'msg.embCard.recentTasks'),
    all: t(l, 'msg.embCard.all'),
    noTasks: t(l, 'msg.embCard.noTasks'),
    modelLabel: t(l, 'msg.embCard.modelLabel'),
    errorLabel: t(l, 'msg.embCard.errorLabel'),
    resumableLabel: t(l, 'msg.embCard.resumableLabel'),
    checkpointLabel: t(l, 'msg.embCard.checkpointLabel'),
    handoffReasonLabel: t(l, 'msg.embCard.handoffReasonLabel'),
    cancel: t(l, 'msg.embCard.cancel'),
    retry: t(l, 'msg.embCard.retry'),
    similarityResults: t(l, 'msg.embCard.similarityResults'),
    similarityHint: t(l, 'msg.embCard.similarityHint'),
    emptyText: t(l, 'msg.embCard.emptyText'),
  };
}
