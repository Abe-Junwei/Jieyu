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
