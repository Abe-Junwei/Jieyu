/**
 * RAG 脚注标注工具：编号来源、解析标记、渲染来源列表
 * RAG footnote annotation utilities: numbered sources, marker parsing, source list rendering
 */

import type { AiMessageCitation } from '../db';
import { stripPlainTextBidiIsolation } from './bidiPlainText';

// ── 常量 | Constants ──

/**
 * 追加到 RAG 上下文尾部的引用指令
 * Citation instruction appended after RAG context
 */
export const RAG_CITATION_INSTRUCTION =
  '如果你的回答引用了上方[RELEVANT_CONTEXT]中的信息，请在对应句子末尾用 [1], [2] 等标记来源编号，不要遗漏。' +
  ' When your answer draws from [RELEVANT_CONTEXT] above, append footnote markers like [1], [2] at the end of the relevant sentence.';

// ── 编号上下文构建 | Numbered context building ──

export interface NumberedRagSource {
  /** 来源类型标签 | Source type tag (e.g. "句段参考") */
  tag: string;
  /** 来源上下文标签 | Source context tag for prompt (e.g. "UTTERANCE_CONTEXT") */
  contextTag: string;
  /** 摘要 | Snippet */
  snippet: string;
}

/**
 * 归一化引用摘要为纯文本输出/搜索友好形式
 * Normalize citation snippets for plain-text output and search
 */
export function normalizeCitationSnippetPlainText(snippet: string): string {
  return stripPlainTextBidiIsolation(snippet).replace(/\s+/g, ' ').trim();
}

export function buildCopyableAssistantPlainText(input: {
  content: string;
  citations: AiMessageCitation[];
  locale: string;
}): string {
  const content = input.content.trim();
  const footer = buildSourceListFooter(input.citations, input.locale);
  return `${content}${footer}`.trim();
}

/**
 * 构建编号 RAG 上下文行，供 LLM 引用
 * Build numbered RAG context lines for LLM citation
 *
 * @example
 * buildNumberedRagLines(sources)
 * // => [
 * //   "[1] (UTTERANCE_CONTEXT) The dog ran.",
 * //   "[2] (NOTE_CONTEXT) Leipzig glossing rules state..."
 * // ]
 */
export function buildNumberedRagLines(sources: NumberedRagSource[]): string[] {
  return sources.map((s, i) => `[${i + 1}] (${s.contextTag}) ${s.snippet}`);
}

// ── 标记解析 | Marker parsing ──

/**
 * 正则：匹配文本中的 [N] 脚注标记
 * Regex for matching [N] footnote markers in text
 */
const CITATION_MARKER_RE = /\[(\d+)\]/g;

/**
 * 从文本中提取所有脚注编号（去重排序）
 * Extract all footnote indices from text (deduplicated and sorted)
 *
 * @example
 * extractCitationIndices("根据 [1] 的记录，以及 [2] 所述...")
 * // => [1, 2]
 */
export function extractCitationIndices(text: string): number[] {
  const indices = new Set<number>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_MARKER_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    indices.add(Number(m[1]));
  }
  return [...indices].sort((a, b) => a - b);
}

// ── 来源列表格式化 | Source list formatting ──

/**
 * 生成底部来源列表文本
 * Generate source list footer text
 *
 * @example
 * buildSourceListFooter(citations, 'zh')
 * // => "\n\n---\n来源:\n[1] 句段参考: The dog ran...\n[2] 笔记参考: Leipzig..."
 */
export function buildSourceListFooter(
  citations: AiMessageCitation[],
  locale: string,
): string {
  if (citations.length === 0) return '';
  const isZh = locale.startsWith('zh');
  const header = isZh ? '来源' : 'Sources';
  const lines = citations.map((c, i) => {
    const label = c.label ?? c.type;
    const snippet = normalizeCitationSnippetPlainText(c.snippet ?? '').slice(0, 100);
    return `[${i + 1}] ${label}: ${snippet}${snippet.length >= 100 ? '…' : ''}`;
  });
  return `\n\n---\n${header}:\n${lines.join('\n')}`;
}

// ── 内联标记拆分（UI 渲染） | Inline marker splitting for UI rendering ──

export interface CitationTextSegment {
  /** 'text' = 普通文本 | 'marker' = 脚注标记 */
  type: 'text' | 'marker';
  /** 文本内容 | Text content */
  value: string;
  /** 仅 marker 有效：脚注编号（1-based）| Only for marker: footnote index (1-based) */
  index?: number;
}

/**
 * 将 AI 回复文本拆分为交替的文本/脚注标记段
 * Split AI response text into alternating text / footnote marker segments
 *
 * @example
 * splitCitationMarkers("The dog [1] ran [2].")
 * // => [
 * //   { type: 'text', value: 'The dog ' },
 * //   { type: 'marker', value: '[1]', index: 1 },
 * //   { type: 'text', value: ' ran ' },
 * //   { type: 'marker', value: '[2]', index: 2 },
 * //   { type: 'text', value: '.' },
 * // ]
 */
export function splitCitationMarkers(
  text: string,
  maxCitationIndex: number,
): CitationTextSegment[] {
  if (!text || maxCitationIndex <= 0) {
    return text ? [{ type: 'text', value: text }] : [];
  }
  const segments: CitationTextSegment[] = [];
  const re = new RegExp(CITATION_MARKER_RE.source, 'g');
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1]);
    // 只处理有效范围内的编号 | Only process indices within valid range
    if (idx < 1 || idx > maxCitationIndex) continue;

    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'marker', value: m[0], index: idx });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
