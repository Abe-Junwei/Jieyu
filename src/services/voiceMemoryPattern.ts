/**
 * 语音转写中的自然语言「项目记忆」模式检测（与 React / VoiceAgentService 解耦）
 * Detects memorization phrases in STT text and writes to ProjectMemoryStore.
 */

import { projectMemoryStore } from './ProjectMemoryStore';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

const MEMORY_TERM_PATTERNS = [
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u8bcd'),
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u672f\\u8bed'),
  decodeEscapedUnicode('\\u6dfb\\u52a0\\u672f\\u8bed'),
] as const;
const MEMORY_PHRASE_PATTERNS = [
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u8868\\u8fbe'),
  decodeEscapedUnicode('\\u5e38\\u89c1\\u8bf4\\u6cd5\\u662f'),
  decodeEscapedUnicode('\\u56fa\\u5b9a\\u8bf4\\u6cd5'),
] as const;
const STRIP_REMEMBER_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u8bb0\\u5f97')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_REMEMBER_ALT_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u8bb0\\u4f4f')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_COMMON_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u5e38\\u89c1')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_FIXED_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u56fa\\u5b9a')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const QUOTED_PHRASE_PATTERN = /['"»''"](.+?)['"»''"]/;

function normalizeExplanationPrefix(text: string): string {
  return text.replace(/^[，,:：\s]+/, '').trim();
}

function extractMemoryExplanation(
  text: string,
  quotedMatch: RegExpMatchArray,
  stripPatterns: readonly RegExp[],
): string {
  const quoteStart = quotedMatch.index ?? text.indexOf(quotedMatch[0]);
  const afterQuote = quoteStart >= 0
    ? normalizeExplanationPrefix(text.slice(quoteStart + quotedMatch[0].length))
    : '';
  if (afterQuote) {
    return afterQuote;
  }

  let normalized = text;
  for (const pattern of stripPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  return normalizeExplanationPrefix(
    normalized.replace(QUOTED_PHRASE_PATTERN, ''),
  );
}

/**
 * 检测文本中的记忆模式并记录到 ProjectMemoryStore
 * - Term confirmation: "记住这个词" / "这是术语" / "添加术语"
 * - Phrase recording: "记住这个表达" / "常见说法是" / "固定说法"
 */
export function detectAndRecordMemoryPattern(text: string, corpusLang: string): void {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return;

  const LOWER = trimmed.toLowerCase();

  if (MEMORY_TERM_PATTERNS.some((pattern) => LOWER.includes(pattern))) {
    const termMatch = trimmed.match(QUOTED_PHRASE_PATTERN);
    if (termMatch) {
      const term = termMatch[1];
      const gloss = extractMemoryExplanation(trimmed, termMatch, [STRIP_REMEMBER_PATTERN, STRIP_REMEMBER_ALT_PATTERN]);
      if (term && gloss && term !== gloss) {
        void projectMemoryStore.confirmTerm(term, gloss.slice(0, 200), corpusLang);
      }
    }
  }

  if (MEMORY_PHRASE_PATTERNS.some((pattern) => LOWER.includes(pattern))) {
    const phraseMatch = trimmed.match(QUOTED_PHRASE_PATTERN);
    if (phraseMatch) {
      const phrase = phraseMatch[1];
      const translation = extractMemoryExplanation(trimmed, phraseMatch, [
        STRIP_REMEMBER_ALT_PATTERN,
        STRIP_COMMON_PATTERN,
        STRIP_FIXED_PATTERN,
      ]);
      if (phrase && translation && phrase !== translation) {
        void projectMemoryStore.recordPhrase(phrase, translation.slice(0, 200), 'voice-confirmed');
      }
    }
  }
}
