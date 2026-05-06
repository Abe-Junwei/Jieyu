/**
 * PR-19: AI Runtime Report — 双轨趋势汇总
 *
 * 聚合 Citation Judge 和 Relevance Judge 的评分结果，生成趋势摘要。
 * 不依赖 LLM；纯统计计算。
 */

import type { CitationJudgeResult } from './citationJudge';
import type { RelevanceJudgeResult } from './relevanceJudge';

export interface JudgeTrendEntry {
  timestamp: string;
  citationOverall: number;
  relevanceOverall: number;
}

export interface AiRuntimeReport {
  generatedAt: string;
  windowSize: number;
  citation: {
    averageScore: number;
    distribution: Record<number, number>;
    flaggedCount: number;
  };
  relevance: {
    averageScore: number;
    distribution: Record<number, number>;
    flaggedCount: number;
  };
  dualTrackTrend: JudgeTrendEntry[];
  anomalies: string[];
}

function average(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function distribution(scores: number[]): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of scores) {
    const bucket = Math.max(1, Math.min(5, Math.round(s)));
    dist[bucket] = (dist[bucket] ?? 0) + 1;
  }
  return dist;
}

function flagCount(scores: number[], threshold = 3): number {
  return scores.filter((s) => s < threshold).length;
}

/**
 * Build an AI runtime report from a batch of judge results.
 *
 * @param citationResults  Citation judge results (chronological order)
 * @param relevanceResults Relevance judge results (chronological order)
 * @param windowSize       Number of most-recent results to include (default 50)
 */
export function buildAiRuntimeReport(
  citationResults: CitationJudgeResult[],
  relevanceResults: RelevanceJudgeResult[],
  windowSize = 50,
): AiRuntimeReport {
  const now = new Date().toISOString();

  const cWindow = citationResults.slice(-windowSize);
  const rWindow = relevanceResults.slice(-windowSize);

  const cScores = cWindow.map((r) => r.overallScore);
  const rScores = rWindow.map((r) => r.overallScore);

  const anomalies: string[] = [];
  if (cScores.length > 0) {
    const cAvg = average(cScores);
    if (cAvg < 3) anomalies.push(`citation average score ${cAvg} below threshold 3`);
    const recent = cScores.slice(-5);
    if (recent.length >= 3 && average(recent) < 3) {
      anomalies.push(`citation recent 5-window average ${average(recent)} below threshold 3`);
    }
  }
  if (rScores.length > 0) {
    const rAvg = average(rScores);
    if (rAvg < 3) anomalies.push(`relevance average score ${rAvg} below threshold 3`);
    const recent = rScores.slice(-5);
    if (recent.length >= 3 && average(recent) < 3) {
      anomalies.push(`relevance recent 5-window average ${average(recent)} below threshold 3`);
    }
  }

  // Build dual-track trend (pair by index; missing entries use 0)
  const trendLength = Math.max(cScores.length, rScores.length);
  const dualTrackTrend: JudgeTrendEntry[] = [];
  for (let i = 0; i < trendLength; i += 1) {
    dualTrackTrend.push({
      timestamp: now,
      citationOverall: cScores[i] ?? 0,
      relevanceOverall: rScores[i] ?? 0,
    });
  }

  return {
    generatedAt: now,
    windowSize: Math.min(windowSize, Math.max(cScores.length, rScores.length)),
    citation: {
      averageScore: average(cScores),
      distribution: distribution(cScores),
      flaggedCount: flagCount(cScores),
    },
    relevance: {
      averageScore: average(rScores),
      distribution: distribution(rScores),
      flaggedCount: flagCount(rScores),
    },
    dualTrackTrend,
    anomalies,
  };
}
