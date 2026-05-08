/**
 * PR-19: LLM-as-Judge 深化 — Relevance Judge（规则引擎版）
 *
 * 对 AI 回答与问题的相关性进行三维度评分 1–5：
 * - topicAlignment: 回答是否紧扣问题主题
 * - completeness: 回答是否覆盖了问题所需的要点
 * - conciseness: 回答是否简洁无冗余
 *
 * 规则引擎版满足约束：<500ms、<1k token（无 LLM 调用）。
 */

export interface RelevanceJudgeInput {
  question: string;
  answer: string;
}

interface RelevanceJudgeDimension {
  score: number;
  reasoning: string;
}

export interface RelevanceJudgeResult {
  overallScore: number;
  dimensions: {
    topicAlignment: RelevanceJudgeDimension;
    completeness: RelevanceJudgeDimension;
    conciseness: RelevanceJudgeDimension;
  };
  reasoning: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'are', 'this', 'that', 'with', 'for', 'from', 'what', 'when', 'where', 'who', 'why', 'how', 'which',
  'was', 'were', 'been', 'have', 'has', 'had', 'did', 'does', 'do', 'can', 'could', 'would', 'should', 'will', 'shall',
  'explain', 'describe', 'tell', 'give', 'list', 'name', 'identify',
]);

function scoreTopicAlignment(question: string, answer: string): RelevanceJudgeDimension {
  const q = question.trim().toLowerCase();
  const a = answer.trim().toLowerCase();

  if (a.length === 0) {
    return { score: 1, reasoning: 'answer is empty' };
  }

  // Extract meaningful tokens (CJK chars + Latin words >= 3 chars, excluding stop words)
  const qTokens = new Set(
    [...q.matchAll(/[\u4e00-\u9fff]/g)].map((m) => m[0])
      .concat([...q.matchAll(/[a-z]{3,}/g)].map((m) => m[0]).filter((w) => !STOP_WORDS.has(w))),
  );
  const aTokens = new Set(
    [...a.matchAll(/[\u4e00-\u9fff]/g)].map((m) => m[0])
      .concat([...a.matchAll(/[a-z]{3,}/g)].map((m) => m[0]).filter((w) => !STOP_WORDS.has(w))),
  );

  if (qTokens.size === 0) {
    return { score: 4, reasoning: 'question has no clear topic tokens to align with' };
  }

  const overlap = [...qTokens].filter((t) => aTokens.has(t)).length;
  const ratio = overlap / qTokens.size;

  if (ratio >= 0.5) {
    return { score: 5, reasoning: 'answer strongly aligns with question topic' };
  }
  if (ratio >= 0.3) {
    return { score: 4, reasoning: 'answer partially aligns with question topic' };
  }
  if (ratio >= 0.1) {
    return { score: 3, reasoning: 'answer weakly aligns with question topic' };
  }
  if (ratio > 0) {
    return { score: 2, reasoning: 'answer barely touches the question topic' };
  }
  return { score: 1, reasoning: 'answer does not align with question topic at all' };
}

function scoreCompleteness(question: string, answer: string): RelevanceJudgeDimension {
  const q = question.trim();
  const a = answer.trim();

  if (a.length === 0) {
    return { score: 1, reasoning: 'answer is empty' };
  }

  // Question complexity heuristic: number of interrogatives / clauses
  const interrogatives = (q.match(/(什么|多少|为什么|怎么|如何|where|when|what|why|how|which|who|whose)/gi) ?? []).length;
  const questionClauses = Math.max(1, interrogatives, q.split(/[。\.，,；;?？!！]/).filter((s) => s.trim().length > 0).length);

  // Answer coverage heuristic: length relative to question
  const answerLength = a.length;
  const questionLength = Math.max(1, q.length);
  const lengthRatio = answerLength / questionLength;

  if (questionClauses >= 2 && lengthRatio < 0.5) {
    return { score: 2, reasoning: 'answer may be too short for a multi-part question' };
  }
  if (questionClauses >= 2 && lengthRatio >= 1.5) {
    return { score: 5, reasoning: 'answer appears sufficiently detailed for a multi-part question' };
  }
  if (lengthRatio < 0.3) {
    return { score: 2, reasoning: 'answer is very short relative to the question' };
  }
  if (lengthRatio >= 1.0) {
    return { score: 5, reasoning: 'answer length suggests good coverage' };
  }
  return { score: 4, reasoning: 'answer length is moderate' };
}

function scoreConciseness(_question: string, answer: string): RelevanceJudgeDimension {
  const a = answer.trim();

  if (a.length === 0) {
    return { score: 1, reasoning: 'answer is empty' };
  }

  // Redundancy heuristics
  const repeatedPhrasePenalty = (a.match(/(\b\w{4,}\b)(?=.*\1)/gi) ?? []).length;
  const fillerRatio = ((a.match(/(其实|基本上|总的来说|简单来说|也就是说|in fact|basically|generally|simply put|that is)/gi) ?? []).length * 6) / Math.max(1, a.length);
  const sentenceCount = Math.max(1, a.split(/[。\.\n]/).filter((s) => s.trim().length > 0).length);
  const avgSentenceLength = a.length / sentenceCount;

  if (fillerRatio > 0.05 || repeatedPhrasePenalty >= 3 || avgSentenceLength > 300) {
    return { score: 2, reasoning: 'answer shows significant redundancy or excessive sentence length' };
  }
  if (fillerRatio > 0.02 || repeatedPhrasePenalty >= 2 || avgSentenceLength > 200) {
    return { score: 3, reasoning: 'answer has moderate redundancy' };
  }
  if (fillerRatio > 0.01 || repeatedPhrasePenalty >= 1 || avgSentenceLength > 150) {
    return { score: 4, reasoning: 'answer is mostly concise with minor redundancy' };
  }
  return { score: 5, reasoning: 'answer is concise and well-structured' };
}

/**
 * Judge the relevance of an answer to a question.
 * Returns scores 1–5 per dimension and an overall rounded average.
 */
export function judgeRelevance(input: RelevanceJudgeInput): RelevanceJudgeResult {
  const dTopic = scoreTopicAlignment(input.question, input.answer);
  const dComplete = scoreCompleteness(input.question, input.answer);
  const dConcise = scoreConciseness(input.question, input.answer);

  const overallScore = Math.round((dTopic.score + dComplete.score + dConcise.score) / 3);

  const reasoning = [
    `topicAlignment=${dTopic.score}: ${dTopic.reasoning}`,
    `completeness=${dComplete.score}: ${dComplete.reasoning}`,
    `conciseness=${dConcise.score}: ${dConcise.reasoning}`,
  ].join('; ');

  return {
    overallScore,
    dimensions: {
      topicAlignment: dTopic,
      completeness: dComplete,
      conciseness: dConcise,
    },
    reasoning,
  };
}

