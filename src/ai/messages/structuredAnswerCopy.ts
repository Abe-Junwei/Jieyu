/**
 * AI-facing formatter copy for structured answers (not UI dictionaries).
 * Used by `structuredAnswer.ts`; keep separate from `src/i18n` UI strings (拍板 6B).
 */

import type { Locale } from '../../i18n';

/** Empty structured-bits fallback selected by assistant feedback locale. */
export function formatStructuredAnswerEmpty(locale?: Locale | string): string {
  return locale === 'en-US'
    ? 'There is no additional structured evidence in this result.'
    : '当前没有额外的结构化证据。';
}

/** Corpus analysis example line when the cited row has no gloss. */
export function formatCorpusAnalysisUnlabeled(locale?: Locale | string): string {
  return locale === 'en-US' ? 'not yet glossed' : '尚未标注';
}

export function formatConcordanceSummary(count: number, zh: boolean): string {
  return zh
    ? `共现命中 ${count} 条，每条带句子 id。`
    : `Concordance returned ${count} hits, each with a unit id.`;
}

export function formatParadigmSummary(tokenCount: number, zh: boolean): string {
  return zh
    ? `该词类共 ${tokenCount} 个词，已统计相邻 gloss。`
    : `Counted adjacent glosses across ${tokenCount} tokens of that part of speech.`;
}

export function formatCounterexampleSummary(
  matchCount: number,
  counterexampleCount: number,
  zh: boolean,
): string {
  return zh
    ? `符合 ${matchCount} 句，反例 ${counterexampleCount} 句。`
    : `${matchCount} units match; ${counterexampleCount} are counterexamples.`;
}
