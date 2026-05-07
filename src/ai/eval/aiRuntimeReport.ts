/**
 * PR-19: AI Runtime Report — 双轨趋势汇总
 *
 * 聚合 Citation Judge 和 Relevance Judge 的评分结果，生成趋势摘要。
 * 不依赖 LLM；纯统计计算。
 */

import type { CitationJudgeResult } from './citationJudge';
import type { RelevanceJudgeResult } from './relevanceJudge';
import {
  collectWorkflowExplainabilitySnapshots,
  type WorkflowExplainabilityV0,
} from '../chat/workflowExplainability';
import type {
  ReflectionFailedCheckRecord,
  ToolDecisionRecord,
} from './aiRuntimeReportDimensionalAudit';

export interface JudgeTrendEntry {
  timestamp: string;
  citationOverall: number;
  relevanceOverall: number;
}

export interface AiRuntimeReportDimensionSlice {
  citationAvg: number;
  relevanceAvg: number;
  sampleCount: number;
  sampleRequestIds: string[];
}

export interface WorkflowExplainabilityRollup {
  schemaVersion: 1;
  byHeadline: Record<string, number>;
  recentSignals: string[];
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
  /** PR-P3-3: 维度聚合 | Dimensional breakdown */
  dimensions: {
    byWorkflow: Record<string, AiRuntimeReportDimensionSlice>;
    byProvider: Record<string, AiRuntimeReportDimensionSlice>;
    bySourceScope: Record<string, AiRuntimeReportDimensionSlice>;
  };
  /** PR-P3-3: 可追溯到具体请求的样本 id */
  sampleRequestIds: string[];
  /** PR-P3: 可选，由助手 explainability 快照聚合（与 judge 维度独立） */
  workflowExplainabilityRollup?: WorkflowExplainabilityRollup;
  /** PR-P4-3: AdoptionQueue outcome counts（由 `ai_adoption_outcome` audit metadataJson 聚合） */
  adoptionOutcomeRollup?: AdoptionOutcomeRollup;
  /** PR-P2: Reflection failed checks rollup */
  reflectionFailedCheckRollup?: ReflectionFailedCheckRollup;
  /** PR-P2: Tool decision records rollup */
  toolDecisionRollup?: ToolDecisionRollup;
  /** PR-P2: Raw audit field occurrence counts (covers write-only fields) */
  rawAuditCounts?: Record<string, number>;
}

export interface AdoptionOutcomeRollup {
  schemaVersion: 1;
  accepted: number;
  ignored: number;
  copied: number;
}

export interface ReflectionFailedCheckRollup {
  schemaVersion: 1;
  total: number;
  byWorkflow: Record<string, number>;
  byCheckName: Record<string, number>;
  recentRecords: Array<{ workflowId: string; checkName: string; requestId: string; timestamp: string }>;
}

export interface ToolDecisionRollup {
  schemaVersion: 1;
  denied: number;
  confirmRequired: number;
  byToolName: Record<string, number>;
  recentRecords: Array<{ requestId: string; decision: string; toolName: string; timestamp: string }>;
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

function rollupWorkflowExplainability(
  snapshots: WorkflowExplainabilityV0[],
): WorkflowExplainabilityRollup | undefined {
  if (snapshots.length === 0) return undefined;
  const byHeadline: Record<string, number> = {};
  const recentSignals: string[] = [];
  for (const s of snapshots) {
    byHeadline[s.headlineKey] = (byHeadline[s.headlineKey] ?? 0) + 1;
    for (const sig of s.detailSignals) {
      if (recentSignals.length < 50) recentSignals.push(sig);
    }
  }
  return { schemaVersion: 1, byHeadline, recentSignals };
}

/** Merge explainability rollup derived from chat UI messages into an existing runtime report. */
export function attachWorkflowExplainabilityRollupFromChat(
  report: AiRuntimeReport,
  chatMessages: ReadonlyArray<{ role: string; workflowExplainability?: WorkflowExplainabilityV0 }>,
): AiRuntimeReport {
  const rollup = rollupWorkflowExplainability(collectWorkflowExplainabilitySnapshots(chatMessages));
  if (!rollup) return report;
  return { ...report, workflowExplainabilityRollup: rollup };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Aggregate AdoptionQueue outcomes from persisted audit `metadataJson` strings (best-effort parse). */
export function rollupAdoptionOutcomesFromAuditMetadataJsons(
  metadataJsons: ReadonlyArray<string | undefined | null>,
): AdoptionOutcomeRollup | undefined {
  let accepted = 0;
  let ignored = 0;
  let copied = 0;
  for (const raw of metadataJsons) {
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (parsed.phase !== 'adoption_outcome') continue;
    const action = parsed.action;
    if (action === 'accept') accepted += 1;
    else if (action === 'ignore') ignored += 1;
    else if (action === 'copy') copied += 1;
  }
  if (accepted === 0 && ignored === 0 && copied === 0) return undefined;
  return { schemaVersion: 1, accepted, ignored, copied };
}

export function attachAdoptionOutcomeRollupFromAuditMetadataJsons(
  report: AiRuntimeReport,
  metadataJsons: ReadonlyArray<string | undefined | null>,
): AiRuntimeReport {
  const adoptionOutcomeRollup = rollupAdoptionOutcomesFromAuditMetadataJsons(metadataJsons);
  if (!adoptionOutcomeRollup) return report;
  return { ...report, adoptionOutcomeRollup };
}

export interface JudgeResultContext {
  requestId: string;
  workflowId?: string;
  providerId?: string;
  sourceScope?: string;
  fallbackReason?: string;
  reflectionStatus?: 'passed' | 'flagged';
}

export interface ContextualCitationResult {
  result: CitationJudgeResult;
  context: JudgeResultContext;
}

export interface ContextualRelevanceResult {
  result: RelevanceJudgeResult;
  context: JudgeResultContext;
}

function aggregateByDimension(
  citationResults: ContextualCitationResult[],
  relevanceResults: ContextualRelevanceResult[],
  dimensionKey: keyof JudgeResultContext,
): Record<string, AiRuntimeReportDimensionSlice> {
  const map = new Map<string, { citation: { score: number; requestId: string }[]; relevance: { score: number; requestId: string }[] }>();

  for (const entry of citationResults) {
    const key = String(entry.context[dimensionKey] ?? 'unknown');
    if (!map.has(key)) map.set(key, { citation: [], relevance: [] });
    map.get(key)!.citation.push({ score: entry.result.overallScore, requestId: entry.context.requestId });
  }

  for (const entry of relevanceResults) {
    const key = String(entry.context[dimensionKey] ?? 'unknown');
    if (!map.has(key)) map.set(key, { citation: [], relevance: [] });
    map.get(key)!.relevance.push({ score: entry.result.overallScore, requestId: entry.context.requestId });
  }

  const result: Record<string, AiRuntimeReportDimensionSlice> = {};
  for (const [key, val] of map) {
    const cScores = val.citation.map((e) => e.score);
    const rScores = val.relevance.map((e) => e.score);
    result[key] = {
      citationAvg: average(cScores),
      relevanceAvg: average(rScores),
      sampleCount: Math.max(val.citation.length, val.relevance.length),
      sampleRequestIds: [...val.citation.map((e) => e.requestId), ...val.relevance.map((e) => e.requestId)].slice(0, 100),
    };
  }
  return result;
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
    dimensions: {
      byWorkflow: {},
      byProvider: {},
      bySourceScope: {},
    },
    sampleRequestIds: [],
  };
}

/**
 * PR-P3-3: Build an AI runtime report with contextual breakdown.
 * Enables dimensional aggregation (workflow, provider, sourceScope) and sample traceability.
 */
export function buildAiRuntimeReportWithContext(
  citationResults: ContextualCitationResult[],
  relevanceResults: ContextualRelevanceResult[],
  windowSize = 50,
  options?: {
    workflowExplainabilitySnapshots?: WorkflowExplainabilityV0[];
    adoptionOutcomeMetadataJsons?: ReadonlyArray<string | undefined | null>;
    reflectionFailedChecks?: ReflectionFailedCheckRecord[];
    toolDecisionRecords?: ToolDecisionRecord[];
    rawAuditCounts?: Record<string, number>;
  },
): AiRuntimeReport {
  const base = buildAiRuntimeReport(
    citationResults.map((c) => c.result).slice(-windowSize),
    relevanceResults.map((r) => r.result).slice(-windowSize),
    windowSize,
  );

  const cWindow = citationResults.slice(-windowSize);
  const rWindow = relevanceResults.slice(-windowSize);

  const sampleRequestIds = [
    ...cWindow.map((c) => c.context.requestId),
    ...rWindow.map((r) => r.context.requestId),
  ].slice(0, 200);

  const workflowExplainabilityRollup = rollupWorkflowExplainability(
    options?.workflowExplainabilitySnapshots ?? [],
  );
  const adoptionOutcomeRollup = rollupAdoptionOutcomesFromAuditMetadataJsons(
    options?.adoptionOutcomeMetadataJsons ?? [],
  );
  const reflectionFailedCheckRollup = rollupReflectionFailedChecks(
    options?.reflectionFailedChecks ?? [],
  );
  const toolDecisionRollup = rollupToolDecisions(
    options?.toolDecisionRecords ?? [],
  );

  return {
    ...base,
    dimensions: {
      byWorkflow: aggregateByDimension(cWindow, rWindow, 'workflowId'),
      byProvider: aggregateByDimension(cWindow, rWindow, 'providerId'),
      bySourceScope: aggregateByDimension(cWindow, rWindow, 'sourceScope'),
    },
    sampleRequestIds: [...new Set(sampleRequestIds)],
    ...(workflowExplainabilityRollup ? { workflowExplainabilityRollup } : {}),
    ...(adoptionOutcomeRollup ? { adoptionOutcomeRollup } : {}),
    ...(reflectionFailedCheckRollup ? { reflectionFailedCheckRollup } : {}),
    ...(toolDecisionRollup ? { toolDecisionRollup } : {}),
    ...(options?.rawAuditCounts && Object.keys(options.rawAuditCounts).length > 0
      ? { rawAuditCounts: options.rawAuditCounts }
      : {}),
  };
}

function rollupReflectionFailedChecks(
  records: ReflectionFailedCheckRecord[],
): ReflectionFailedCheckRollup | undefined {
  if (records.length === 0) return undefined;
  const byWorkflow: Record<string, number> = {};
  const byCheckName: Record<string, number> = {};
  for (const r of records) {
    byWorkflow[r.workflowId] = (byWorkflow[r.workflowId] ?? 0) + 1;
    byCheckName[r.checkName] = (byCheckName[r.checkName] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    total: records.length,
    byWorkflow,
    byCheckName,
    recentRecords: records.slice(-20),
  };
}

function rollupToolDecisions(
  records: ToolDecisionRecord[],
): ToolDecisionRollup | undefined {
  if (records.length === 0) return undefined;
  const byToolName: Record<string, number> = {};
  let denied = 0;
  let confirmRequired = 0;
  for (const r of records) {
    byToolName[r.toolName] = (byToolName[r.toolName] ?? 0) + 1;
    if (r.decision === 'denied') denied += 1;
    else if (r.decision === 'confirm_required') confirmRequired += 1;
  }
  return {
    schemaVersion: 1,
    denied,
    confirmRequired,
    byToolName,
    recentRecords: records.slice(-20),
  };
}
