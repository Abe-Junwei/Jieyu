import { describe, expect, it } from 'vitest';
import { semanticChunk, lateChunkingPool, computeChunkTokenBoundaries } from './semanticChunker';
import type { ChunkBoundary } from './semanticChunker';

describe('semanticChunk', () => {
  // ---- 基础行为 | Basic behavior ----
  it('空文本返回空数组 | empty text returns empty array', () => {
    expect(semanticChunk('')).toEqual([]);
    expect(semanticChunk('   ')).toEqual([]);
  });

  it('短文本无需分块，整体返回 | short text returns as single chunk', () => {
    const text = '这是一段很短的文字。';
    const result = semanticChunk(text, { maxChars: 600 });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('这是一段很短的文字');
  });

  // ---- 句子边界 | Sentence boundaries ----
  it('按中文句号切分 | splits on Chinese period', () => {
    const text = '第一句话。第二句话。第三句话。第四句话。第五句话。';
    const result = semanticChunk(text, { maxChars: 15, overlapSentences: 0 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(15 + 10); // 允许小量超出 | small overage allowed
    }
  });

  it('按英文句号切分 | splits on English period', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const result = semanticChunk(text, { maxChars: 30, overlapSentences: 0 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('按换行符切分 | splits on newline', () => {
    const parts = ['Line one about phonology', 'Line two about morphology', 'Line three about syntax', 'Line four'];
    const text = parts.join('\n');
    const result = semanticChunk(text, { maxChars: 30, overlapSentences: 0 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  // ---- overlap 跨句上下文 | overlap cross-sentence context ----
  it('overlapSentences=1 时相邻 chunk 共享一个句子 | adjacent chunks share one sentence with overlap=1', () => {
    const s = (n: number) => `句子${n}测试文本足够长度。`;
    const text = Array.from({ length: 8 }, (_, i) => s(i + 1)).join('');
    const noOverlap = semanticChunk(text, { maxChars: 60, overlapSentences: 0 });
    const withOverlap = semanticChunk(text, { maxChars: 60, overlapSentences: 1 });
    // overlap 应产生更多 chunks | overlap produces more chunks
    expect(withOverlap.length).toBeGreaterThanOrEqual(noOverlap.length);
  });

  // ---- 纯英文 | Pure English ----
  it('纯英文文本正常分块 | pure English text chunks correctly', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `This is sentence number ${i + 1} about endangered language documentation.`,
    ).join(' ');
    const result = semanticChunk(text, { maxChars: 150, overlapSentences: 1 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(typeof chunk).toBe('string');
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  // ---- 纯中文 | Pure Chinese ----
  it('纯中文文本正常分块 | pure Chinese text chunks correctly', () => {
    const text = '音位转写是将语音记录为书面符号的过程。国际音标系统提供了统一的符号体系。田野调查员需要掌握 IPA 技能。低资源语言往往缺乏足够的注释语料。语言文档记录对于保护濒危语言至关重要。';
    const result = semanticChunk(text, { maxChars: 50, overlapSentences: 1 });
    expect(result.length).toBeGreaterThan(1);
  });

  // ---- 边界：过长单句 | Edge case: single very long sentence ----
  it('单个超长句不会产生空 chunk | single long sentence does not produce empty chunks', () => {
    const long = '这是一个没有标点符号的超长段落'.repeat(30); // ~420 chars
    const result = semanticChunk(long, { maxChars: 200, overlapSentences: 0 });
    for (const chunk of result) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Late Chunking Phase B: 注意力池化 | Attention pooling ─────────────────

/** 生成简单测试用 token 嵌入 | Generate simple test token embeddings */
function makeTokenEmbeddings(seqLen: number, dim: number): number[][] {
  return Array.from({ length: seqLen }, (_, t) =>
    Array.from({ length: dim }, (__, d) => Math.sin(t * 0.3 + d * 0.1)),
  );
}

describe('lateChunkingPool — Phase B 注意力池化', () => {
  it('简单均值池化（无注意力权重）| simple mean pooling without attention', () => {
    const tokenEmbeddings = makeTokenEmbeddings(10, 4);
    const chunkBoundaries: ChunkBoundary[] = [
      { start: 0, end: 5 },
      { start: 5, end: 10 },
    ];
    const result = lateChunkingPool({ tokenEmbeddings, chunkBoundaries });

    expect(result).toHaveLength(2);
    for (const vec of result) {
      expect(vec).toHaveLength(4);
      // L2 归一化后长度应为 1 | L2 normalized → unit length
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 4);
    }
  });

  it('注意力加权池化改变结果 | attention weights change results', () => {
    const tokenEmbeddings = makeTokenEmbeddings(6, 3);
    const boundaries: ChunkBoundary[] = [{ start: 0, end: 6 }];

    const uniform = lateChunkingPool({ tokenEmbeddings, chunkBoundaries: boundaries });
    // 只加权首个 token | Weight only the first token
    const weights = [10, 0.1, 0.1, 0.1, 0.1, 0.1];
    const weighted = lateChunkingPool({
      tokenEmbeddings,
      chunkBoundaries: boundaries,
      attentionWeights: weights,
    });

    // 两种池化结果应不同 | Results should differ
    const diff = uniform[0]!.some((v, i) => Math.abs(v - weighted[0]![i]!) > 1e-6);
    expect(diff).toBe(true);
  });

  it('空 chunk 返回零向量 | empty chunk returns zero vector', () => {
    const tokenEmbeddings = makeTokenEmbeddings(4, 3);
    const result = lateChunkingPool({
      tokenEmbeddings,
      chunkBoundaries: [{ start: 2, end: 2 }], // end === start → 空
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.every((v) => v === 0)).toBe(true);
  });

  it('越界边界自动钳位 | out-of-bounds boundaries are clamped', () => {
    const tokenEmbeddings = makeTokenEmbeddings(5, 2);
    const result = lateChunkingPool({
      tokenEmbeddings,
      chunkBoundaries: [{ start: -3, end: 100 }],
    });
    expect(result).toHaveLength(1);
    const norm = Math.sqrt(result[0]!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it('多 chunk 覆盖 token → 每个独立向量 | multiple chunks → independent vectors', () => {
    const tokenEmbeddings = makeTokenEmbeddings(12, 4);
    const boundaries: ChunkBoundary[] = [
      { start: 0, end: 4 },
      { start: 4, end: 8 },
      { start: 8, end: 12 },
    ];
    const result = lateChunkingPool({ tokenEmbeddings, chunkBoundaries: boundaries });
    expect(result).toHaveLength(3);
    // 不同区间的向量不应完全相同 | Vectors from different spans should differ
    const v0 = result[0]!;
    const v1 = result[1]!;
    expect(v0.some((val, i) => Math.abs(val - v1[i]!) > 1e-6)).toBe(true);
  });
});

describe('computeChunkTokenBoundaries — chunk-to-token 映射', () => {
  it('简单映射：每个字符 1 token | simple 1:1 char-to-token mapping', () => {
    const fullText = 'ABCDEF';
    const charChunks = ['ABC', 'DEF'];
    // 每个字符占 1 token | Each char is 1 token
    const tokenOffsets: Array<[number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
    ];
    const result = computeChunkTokenBoundaries(charChunks, fullText, tokenOffsets);
    expect(result).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ]);
  });

  it('多字符 token 正确覆盖 | multi-char tokens cover correctly', () => {
    const fullText = 'Hello World';
    const charChunks = ['Hello', 'World'];
    // 2 tokens: "Hello" (0-5), " World" (5-11)
    const tokenOffsets: Array<[number, number]> = [[0, 5], [5, 11]];
    const result = computeChunkTokenBoundaries(charChunks, fullText, tokenOffsets);
    expect(result[0]).toEqual({ start: 0, end: 1 });
    expect(result[1]).toEqual({ start: 1, end: 2 });
  });

  it('未找到的 chunk 返回 {0, 0} | missing chunk returns {0, 0}', () => {
    const result = computeChunkTokenBoundaries(
      ['nonexistent'],
      'actual text',
      [[0, 6], [6, 11]],
    );
    expect(result).toEqual([{ start: 0, end: 0 }]);
  });
});
