/**
 * AI-facing formatter copy for structured answers (not UI dictionaries).
 * Used by `structuredAnswer.ts`; keep separate from `src/i18n` UI strings (拍板 6B).
 */

/** Empty structured-bits fallback when locale resolves to Chinese. */
export const STRUCTURED_ANSWER_EMPTY_ZH = '当前没有额外的结构化证据。';

/** Empty structured-bits fallback for non-Chinese locales. */
export const STRUCTURED_ANSWER_EMPTY_EN =
  'There is no additional structured evidence in this result.';
