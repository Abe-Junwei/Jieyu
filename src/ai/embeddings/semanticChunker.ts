/**
 * semanticChunker — 语义感知分块（Late Chunking 阶段 A & B）
 * Semantic-aware text chunker (Late Chunking Phase A & B).
 *
 * ── 阶段 A（当前默认）| Phase A (current default) ──
 * 基于句子边界切分 + 滑动窗口重叠，替代固定字符数硬切策略。
 * Splits on sentence boundaries with sliding-window overlap instead of hard character counts.
 *
 * ── 阶段 B（整段编码 → 注意力池化）| Phase B (encode-first → attention pooling) ──
 * 将整段文本送入 8192-token 长上下文模型（Arctic-Embed / ModernBERT），
 * 取得 token 级隐状态后，按 chunk 边界做注意力加权均值池化。
 * Feeds full text into a long-context embedding model, retrieves token-level hidden states,
 * then pools per-chunk via attention-weighted mean aggregation.
 */

export interface SemanticChunkOptions {
  /** 每个 chunk 最大字符数，默认 600 | Max characters per chunk (default 600) */
  maxChars?: number;
  /**
   * 相邻 chunk 的重叠句数，默认 1 | Number of overlap sentences between adjacent chunks (default 1)
   * 保留跨句上下文语境 | Preserves cross-sentence context
   */
  overlapSentences?: number;
}

// 句子边界正则：匹配"句子文本 + 句尾标点"或"无标点的段落行"
// Sentence boundary regex: matches "sentence text + terminal punctuation" or "text-only paragraph line"
const SENTENCE_MATCH_RE = /[^。！？\.\!\?\n]*[。！？\.\!\?]|[^\n]+/g;

/**
 * 将文本按语义句子边界分块 | Split text into semantic chunks at sentence boundaries.
 *
 * @param text       输入文本 | Input text
 * @param options    分块选项 | Chunk options
 * @returns          chunk 字符串数组 | Array of chunk strings
 */
export function semanticChunk(
  text: string,
  options: SemanticChunkOptions = {},
): string[] {
  const maxChars = Math.max(10, Math.floor(options.maxChars ?? 600));
  const overlapSentences = Math.max(0, Math.floor(options.overlapSentences ?? 1));

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  // 短文本无需分块 | Short text: no chunking needed
  if (normalized.length <= maxChars) return [normalized];

  // 按句子边界切分 | Split on sentence boundaries
  const rawSentences = splitSentences(normalized).filter((s) => s.trim().length > 0);
  if (rawSentences.length === 0) return [normalized.slice(0, maxChars)];

  // 超长句兜底：按 maxChars 字符数硬切（无标点的连续文本）
  // Oversized sentence fallback: hard-split by maxChars for text without punctuation
  const sentences: string[] = [];
  for (const s of rawSentences) {
    if (s.length <= maxChars) {
      sentences.push(s);
    } else {
      for (let pos = 0; pos < s.length; pos += maxChars) {
        const sub = s.slice(pos, pos + maxChars).trim();
        if (sub) sentences.push(sub);
      }
    }
  }

  const chunks: string[] = [];
  let i = 0;

  while (i < sentences.length) {
    const chunkSentences: string[] = [];
    let charCount = 0;

    // 添加句子直到达到 maxChars | Accumulate sentences until maxChars
    while (i < sentences.length) {
      const sentence = sentences[i] as string;
      if (chunkSentences.length > 0 && charCount + sentence.length > maxChars) {
        break;
      }
      chunkSentences.push(sentence);
      charCount += sentence.length;
      i += 1;
    }

    if (chunkSentences.length > 0) {
      chunks.push(chunkSentences.join('').trim());
    }

    // 回退 overlap 句，提供跨 chunk 上下文 | Rewind by overlap count for cross-chunk context
    if (overlapSentences > 0 && i < sentences.length) {
      i = Math.max(i - overlapSentences, i - chunkSentences.length + 1);
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * 按句子边界拆分文本（保留标点）| Split text into sentences, keeping punctuation.
 *
 * 使用匹配模式而非 split+lookbehind，避免可变长度 lookbehind 的零宽连续匹配问题。
 * Uses match-based approach instead of split+lookbehind to avoid ambiguous zero-width matches.
 */
function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_MATCH_RE);
  if (!matches) return [];
  return matches.filter((s) => s.trim().length > 0);
}

// ── Late Chunking 阶段 B：token 级注意力池化 | Phase B: token-level attention pooling ──

/** chunk 在 token 序列中的边界 | Chunk boundaries within the token sequence */
export interface ChunkBoundary {
  /** 起始 token 索引（含）| Start token index (inclusive) */
  start: number;
  /** 结束 token 索引（不含）| End token index (exclusive) */
  end: number;
}

/** Phase B 池化输入 | Phase B pooling input */
export interface LateChunkingInput {
  /**
   * 整段文本的 token 级隐状态 [seq_len, hidden_dim]
   * Token-level hidden states for the full text [seq_len, hidden_dim]
   */
  tokenEmbeddings: number[][];
  /** 每个 chunk 的 token 边界 | Token boundaries for each chunk */
  chunkBoundaries: ChunkBoundary[];
  /**
   * 可选：每个 token 的注意力权重 [seq_len]（通常取最后一层 CLS 行的均值）
   * Optional per-token attention weights [seq_len] (typically mean of last-layer CLS row)
   */
  attentionWeights?: number[];
}

/**
 * Late Chunking 池化：将 token 级隐状态按 chunk 边界聚合为 chunk 级向量。
 * Late Chunking pooling: aggregate token-level hidden states into chunk-level vectors
 * using optional attention-weighted mean.
 *
 * 当 attentionWeights 提供时采用注意力加权均值；否则退化为简单均值池化。
 * Uses attention-weighted mean when weights are provided; falls back to simple mean pooling.
 *
 * @returns 归一化后的 chunk 向量 [num_chunks, hidden_dim] | Normalized chunk vectors
 */
export function lateChunkingPool(input: LateChunkingInput): number[][] {
  const { tokenEmbeddings, chunkBoundaries, attentionWeights } = input;
  const results: number[][] = [];

  for (const { start, end } of chunkBoundaries) {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(tokenEmbeddings.length, end);
    if (safeEnd <= safeStart) {
      // 空 chunk：返回零向量 | Empty chunk: return zero vector
      const dim = tokenEmbeddings[0]?.length ?? 0;
      results.push(new Array<number>(dim).fill(0));
      continue;
    }

    const dim = tokenEmbeddings[safeStart]!.length;
    const pooled = new Array<number>(dim).fill(0);
    let weightSum = 0;

    for (let t = safeStart; t < safeEnd; t += 1) {
      const w = attentionWeights?.[t] ?? 1;
      const tokenVec = tokenEmbeddings[t]!;
      for (let d = 0; d < dim; d += 1) {
        pooled[d] = (pooled[d] ?? 0) + (tokenVec[d] ?? 0) * w;
      }
      weightSum += w;
    }

    // 加权均值 | Weighted mean
    if (weightSum > 0) {
      for (let d = 0; d < dim; d += 1) {
        pooled[d]! /= weightSum;
      }
    }

    // L2 归一化 | L2 normalize
    let normSq = 0;
    for (const v of pooled) normSq += v * v;
    const norm = Math.sqrt(normSq);
    results.push(norm > 0 ? pooled.map((v) => v / norm) : pooled);
  }

  return results;
}

/**
 * 根据字符偏移和分词结果计算 chunk 在 token 序列中的边界。
 * Compute chunk boundaries in token space from character offsets and tokenization output.
 *
 * @param charChunks  Phase A 输出的 chunk 文本数组 | Phase A chunk text array
 * @param fullText    完整原文 | Full original text
 * @param tokenOffsets 每个 token 在 fullText 中的字符偏移 [start, end) | Per-token char offsets
 * @returns chunk token 边界 | Chunk boundaries in token indices
 */
export function computeChunkTokenBoundaries(
  charChunks: string[],
  fullText: string,
  tokenOffsets: Array<[number, number]>,
): ChunkBoundary[] {
  const boundaries: ChunkBoundary[] = [];
  let searchFrom = 0;

  for (const chunk of charChunks) {
    const charStart = fullText.indexOf(chunk, searchFrom);
    if (charStart < 0) {
      // chunk 未在原文中找到（重叠区可能导致偏移）| chunk not found in full text
      boundaries.push({ start: 0, end: 0 });
      continue;
    }
    const charEnd = charStart + chunk.length;
    searchFrom = charStart + 1; // 允许重叠 chunk | Allow overlap

    // 找到覆盖 [charStart, charEnd) 的 token 范围 | Find token range covering [charStart, charEnd)
    let tokenStart = -1;
    let tokenEnd = -1;

    for (let i = 0; i < tokenOffsets.length; i += 1) {
      const [tStart, tEnd] = tokenOffsets[i]!;
      if (tEnd > charStart && tokenStart < 0) tokenStart = i;
      if (tStart < charEnd) tokenEnd = i + 1;
    }

    boundaries.push({
      start: tokenStart >= 0 ? tokenStart : 0,
      end: tokenEnd >= 0 ? tokenEnd : 0,
    });
  }

  return boundaries;
}
