/**
 * CRAG 检索质量评估器 | CRAG RAG quality evaluator.
 *
 * 基于 CRAG（Corrective RAG，arXiv:2401.15884）的三路分支设计：
 * Based on CRAG (arXiv:2401.15884) three-branch quality assessment:
 *
 *   CORRECT   — maxScore ≥ 0.55 且 scoreGap ≥ 0.1  → 直接使用检索结果
 *   AMBIGUOUS — 否则命中但置信度不足                 → 关键词扩展后重搜
 *   INCORRECT — maxScore < 0.35 或 matches 为空     → 跳过注入
 */

export type RagQualityVerdict = 'correct' | 'ambiguous' | 'incorrect';

export interface RagQualityResult {
  verdict: RagQualityVerdict;
  maxScore: number;
  /** top1 与 top2 相似度差距 | Score gap between top-1 and top-2 */
  scoreGap: number;
  /** AMBIGUOUS 时提取的扩展查询 | Expanded query for re-search in AMBIGUOUS branch */
  refinedQuery?: string;
}

interface EmbeddingMatch {
  score: number;
}

const CORRECT_THRESHOLD = 0.55;
const CORRECT_GAP_THRESHOLD = 0.1;
const INCORRECT_THRESHOLD = 0.35;

/**
 * 从查询文本中提取关键词作为扩展查询 | Extract keywords from query text for query expansion.
 * 停用词列表很小，仅过滤极高频汉字和英文虚词。
 * Stopword list is minimal, only filtering highest-frequency function words.
 */
function extractKeywordsForExpansion(queryText: string): string {
  const stopwords = new Set([
    // 单字高频虚词 | Single-char high-frequency function words
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '都', '也', '这', '那',
    // 常见双字虚词组合 | Common 2-char function word combinations
    '这是', '这个', '那个', '一个', '关于', '因为', '所以', '然后', '如果', '虽然',
    // English stopwords
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'it', 'its',
  ]);

  // 按空格、中文标点、常见分隔符分词 | Tokenize by spaces, CJK punctuation and delimiters
  const tokens = queryText
    .replace(/[，。！？、；：""''（）【】《》\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && !stopwords.has(t));

  // 最多取前 6 个关键词拼接 | Cap at 6 keywords
  return [...new Set(tokens)].slice(0, 6).join(' ');
}

/**
 * 评估检索结果质量，返回三路分支判定。
 * Evaluate retrieval quality and return a three-branch verdict.
 */
export function evaluateRagQuality(
  matches: readonly EmbeddingMatch[],
  queryText: string,
): RagQualityResult {
  if (matches.length === 0) {
    return { verdict: 'incorrect', maxScore: 0, scoreGap: 0 };
  }

  const maxScore = matches[0]?.score ?? 0;

  if (maxScore < INCORRECT_THRESHOLD) {
    return { verdict: 'incorrect', maxScore, scoreGap: 0 };
  }

  const secondScore = matches[1]?.score ?? 0;
  const scoreGap = maxScore - secondScore;

  if (maxScore >= CORRECT_THRESHOLD && scoreGap >= CORRECT_GAP_THRESHOLD) {
    return { verdict: 'correct', maxScore, scoreGap };
  }

  // AMBIGUOUS: generate refined query for re-search | 生成扩展查询用于重搜
  const keywords = extractKeywordsForExpansion(queryText);
  const refinedQuery = keywords || queryText;
  return { verdict: 'ambiguous', maxScore, scoreGap, refinedQuery };
}
