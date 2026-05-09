/**
 * segmentTextParsers — Segment selector text extraction
 * Extracted from toolCallHelpers.ts to reduce orchestrator size.
 */

import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';

export function parseChineseInteger(raw: string): number | null {
  const normalized = raw.trim().replace(/\u4e24/g, '\u4e8c');
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const digitMap: Record<string, number> = {
    '\u4e00': 1,
    '\u4e8c': 2,
    '\u4e09': 3,
    '\u56db': 4,
    '\u4e94': 5,
    '\u516d': 6,
    '\u4e03': 7,
    '\u516b': 8,
    '\u4e5d': 9,
  };

  if (normalized === '\u5341') return 10;
  const parts = normalized.split('\u5341');
  if (parts.length === 2) {
    const tens = parts[0] ? (digitMap[parts[0]] ?? NaN) : 1;
    const ones = parts[1] ? (digitMap[parts[1]] ?? NaN) : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) {
      return tens * 10 + ones;
    }
  }

  return digitMap[normalized] ?? null;
}

export function parseEnglishOrdinal(raw: string): number | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  const wordMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  if (normalized in wordMap) return wordMap[normalized] ?? null;
  const parsed = Number(normalized.replace(/(?:st|nd|rd|th)$/i, ''));
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

const SEGMENT_NOUN_PATTERN = `(?:${decodeEscapedUnicode('\u53e5\u6bb5|\u5206\u6bb5|\u53e5\u5b50?|\u53e5|\u6bb5')}|segment|segments?)`;
const LAST_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode(
  '\u6700\u540e(?:\u4e00[\u4e2a\u6761\u6bb5\u53e5]?|\u4e00\u4e2a)?',
);
const PREVIOUS_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode(
  '\u524d\u4e00\u4e2a|\u4e0a\u4e00\u4e2a',
);
const NEXT_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode('\u540e\u4e00\u4e2a|\u4e0b\u4e00\u4e2a');
const PENULTIMATE_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode(
  '\u5012\u6570\u7b2c\u4e8c(?:\u4e2a|\u6761|\u53e5|\u6bb5)?',
);
const MIDDLE_SEGMENT_PREFIX_PATTERN = decodeEscapedUnicode(
  '\u4e2d\u95f4\u90a3(?:\u4e2a|\u6761|\u53e5|\u6bb5)|\u4e2d\u95f4(?:\u90a3)?\u4e2a',
);
const CHINESE_SEGMENT_ORDINAL_PATTERN = decodeEscapedUnicode(
  '\u7b2c\\s*([0-9]+|[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u4e24]+)\\s*(?:\u4e2a|\u6761|\u53e5|\u6bb5)?\\s*',
);

export function extractSegmentSelectorFromUserText(
  userText: string,
): Record<string, unknown> | null {
  const normalizedText = userText.trim();
  if (!normalizedText) return null;

  if (
    new RegExp(
      `(${LAST_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?last)\\s*${SEGMENT_NOUN_PATTERN}`,
      'i',
    ).test(normalizedText)
  ) {
    return { segmentPosition: 'last' };
  }

  if (
    new RegExp(
      `(${PREVIOUS_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?previous|(?:the\\s+)?prev)\\s*${SEGMENT_NOUN_PATTERN}`,
      'i',
    ).test(normalizedText)
  ) {
    return { segmentPosition: 'previous' };
  }

  if (
    new RegExp(
      `(${NEXT_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?next)\\s*${SEGMENT_NOUN_PATTERN}`,
      'i',
    ).test(normalizedText)
  ) {
    return { segmentPosition: 'next' };
  }

  if (
    new RegExp(
      `(${PENULTIMATE_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?penultimate)\\s*${SEGMENT_NOUN_PATTERN}`,
      'i',
    ).test(normalizedText)
  ) {
    return { segmentPosition: 'penultimate' };
  }

  if (
    new RegExp(
      `(${MIDDLE_SEGMENT_PREFIX_PATTERN}|(?:the\\s+)?middle)\\s*${SEGMENT_NOUN_PATTERN}`,
      'i',
    ).test(normalizedText)
  ) {
    return { segmentPosition: 'middle' };
  }

  const chineseMatch = normalizedText.match(
    new RegExp(`${CHINESE_SEGMENT_ORDINAL_PATTERN}${SEGMENT_NOUN_PATTERN}?`, 'i'),
  );
  if (chineseMatch?.[1]) {
    const parsed = parseChineseInteger(chineseMatch[1]);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  const englishMatch = normalizedText.match(
    /(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+segments?/i,
  );
  if (englishMatch?.[1]) {
    const ordinal = englishMatch[1].toLowerCase();
    if (ordinal === 'last') return { segmentPosition: 'last' };
    const parsed = parseEnglishOrdinal(ordinal);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  return null;
}
