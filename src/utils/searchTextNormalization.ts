/**
 * 检索用文本归一化（RADAR-BUG-1）：只用于建索引和比较，不用于存储。
 * NFD / NFC 混用（ŋǎ、pʰǒ、lê 等）时，索引词和查询词先统一成 NFC 再小写，两种写法互相能搜到。
 * 原文从不被改写：调用方只把结果用于匹配，存储和显示仍用原字符串。
 *
 * Retrieval-only text normalization (RADAR-BUG-1): for indexing and comparison, never for
 * storage. Indexed terms and queries are folded to NFC and lower case, so NFD and NFC spellings
 * (ŋǎ, pʰǒ, lê, …) find each other. Stored text is never rewritten: callers only use the result to
 * match; storage and display keep the original string.
 */

/** NFC + 小写 | NFC + lower case */
export function foldSearchText(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/**
 * 中文按字 + 其他文字按词的轻量切分（先 NFC）。词内保留组合附加符（\p{M}），
 * 否则没有预组合形式的字符（如 ə̃）或 NFD 输入会在附加符处被切断。
 * Lightweight mixed tokenizer: CJK per character, other scripts per word (after NFC). Combining
 * marks (\p{M}) stay inside words, otherwise characters without a precomposed form (e.g. ə̃) or
 * NFD input would be split at the mark.
 */
export function tokenizeMixedScriptForSearch(text: string): string[] {
  const folded = foldSearchText(text);
  const cjkChars = folded.match(/[\u4e00-\u9fff]/g) ?? [];
  const words = folded.split(/[^\p{L}\p{M}\p{N}]+/u).filter((item) => item.length >= 2);
  return [...new Set([...cjkChars, ...words])];
}
