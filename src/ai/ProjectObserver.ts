import { isDictKey, t, tf, type Locale } from '../i18n';

export type ProjectStage = 'collecting' | 'transcribing' | 'glossing' | 'reviewing';

export interface ObserverMetrics {
  transcribedRate: number;
  glossedRate: number;
  verifiedRate: number;
  /** Count of `units` rows (not unified timeline unit index). */
  unitRowCount: number;
}

export interface Recommendation {
  id: string;
  priority: number;
  title: string;
  detail: string;
  actionLabel?: string;
}

export interface ObserverResult {
  stage: ProjectStage;
  recommendations: Recommendation[];
}

function makeRecommendation(locale: Locale, id: string, priority: number): Recommendation {
  const baseKey = `ai.observer.recommendation.${id}` as const;
  const titleKey = `${baseKey}.title`;
  const detailKey = `${baseKey}.detail`;
  const actionLabelKey = `${baseKey}.actionLabel`;
  return {
    id,
    priority,
    title: isDictKey(titleKey) ? t(locale, titleKey) : id,
    detail: isDictKey(detailKey) ? t(locale, detailKey) : id,
    actionLabel: isDictKey(actionLabelKey) ? t(locale, actionLabelKey) : id,
  };
}

export function inferStage(metrics: ObserverMetrics): ProjectStage {
  if (metrics.unitRowCount <= 0) return 'collecting';
  const t = Math.max(0, Math.min(1, metrics.transcribedRate));
  const g = Math.max(0, Math.min(1, metrics.glossedRate));
  const v = Math.max(0, Math.min(1, metrics.verifiedRate));
  if (t < 0.2) return 'collecting';
  if (g < 0.2) return 'transcribing';
  if (v < 0.5) return 'glossing';
  return 'reviewing';
}

/** 波形信号摘要（可选注入）| Optional waveform signal summary for multi-signal scoring */
export interface WaveformSignals {
  lowConfidenceCount: number;
  overlapCount: number;
  gapCount: number;
  maxGapSeconds: number;
  /** 最高热区严重度 0-1 | Top hot-zone severity */
  topHotZoneSeverity?: number;
}

/**
 * 计算多信号风险分 0-100 | Compute multi-signal risk score 0-100
 * 综合 confidence、overlap、gap 和热区严重度加权
 */
export function computeMultiSignalRiskScore(signals: WaveformSignals, unitRowCount: number): number {
  if (unitRowCount <= 0) return 0;
  const confRatio = Math.min(1, signals.lowConfidenceCount / unitRowCount);
  const overlapRatio = Math.min(1, signals.overlapCount / Math.max(1, unitRowCount));
  const gapPenalty = Math.min(1, signals.maxGapSeconds / 10);
  const hotZoneFactor = signals.topHotZoneSeverity ?? 0;

  // 加权：低置信度 40%、重叠 25%、间隙 15%、热区 20%
  // Weights: low-confidence 40%, overlap 25%, gap 15%, hot-zone 20%
  const raw = confRatio * 0.4 + overlapRatio * 0.25 + gapPenalty * 0.15 + hotZoneFactor * 0.2;
  return Math.round(Math.min(100, raw * 100));
}

export function generateRecommendations(
  metrics: ObserverMetrics,
  waveformSignals?: WaveformSignals,
  locale: Locale = 'zh-CN',
): Recommendation[] {
  const stage = inferStage(metrics);
  const noWaveformRecommendation: Recommendation | null = waveformSignals
    ? null
    : {
      id: 'acoustic-unavailable',
      priority: 78,
      title: t(locale, 'ai.observer.recommendation.acousticUnavailable.title'),
      detail: t(locale, 'ai.observer.recommendation.acousticUnavailable.detail'),
      actionLabel: t(locale, 'ai.observer.recommendation.acousticUnavailable.actionLabel'),
    };
  const riskScore = waveformSignals ? computeMultiSignalRiskScore(waveformSignals, metrics.unitRowCount) : 0;

  if (stage === 'collecting') {
    return [
      makeRecommendation(locale, 'collectingNext', 100),
      ...(noWaveformRecommendation ? [noWaveformRecommendation] : []),
    ];
  }
  if (stage === 'transcribing') {
    const recs: Recommendation[] = [
      makeRecommendation(locale, 'transcribingJumpUntagged', 92),
      makeRecommendation(locale, 'transcribingBatchPos', 90),
      ...(noWaveformRecommendation ? [noWaveformRecommendation] : []),
    ];
    // 重叠信号额外提醒 | Overlap signal warning
    if (waveformSignals && waveformSignals.overlapCount >= 3) {
      recs.push({
        id: 'transcribing-overlap-warn',
        priority: 88,
        title: t(locale, 'ai.observer.recommendation.transcribingOverlapWarn.title'),
        detail: tf(locale, 'ai.observer.recommendation.transcribingOverlapWarn.detail', {
          count: waveformSignals.overlapCount,
        }),
        actionLabel: t(locale, 'ai.observer.recommendation.transcribingOverlapWarn.actionLabel'),
      });
    }
    return recs;
  }
  if (stage === 'glossing') {
    const recs: Recommendation[] = [
      {
        id: 'glossing-risk-review',
        priority: Math.min(99, 85 + Math.round(riskScore * 0.1)),
        title: t(locale, 'ai.observer.recommendation.glossingRiskReview.title'),
        detail: riskScore > 30
          ? tf(locale, 'ai.observer.recommendation.glossingRiskReview.detailHigh', { riskScore })
          : t(locale, 'ai.observer.recommendation.glossingRiskReview.detail'),
        actionLabel: t(locale, 'ai.observer.recommendation.glossingRiskReview.actionLabel'),
      },
      makeRecommendation(locale, 'glossingNext', 80),
      ...(noWaveformRecommendation ? [noWaveformRecommendation] : []),
    ];
    // 大间隙提醒 | Large gap warning
    if (waveformSignals && waveformSignals.maxGapSeconds > 3) {
      recs.push({
        id: 'glossing-gap-warn',
        priority: 82,
        title: t(locale, 'ai.observer.recommendation.glossingGapWarn.title'),
        detail: tf(locale, 'ai.observer.recommendation.glossingGapWarn.detail', {
          maxGapSeconds: waveformSignals.maxGapSeconds.toFixed(1),
        }),
        actionLabel: t(locale, 'ai.observer.recommendation.glossingGapWarn.actionLabel'),
      });
    }
    return recs;
  }
  const reviewRecs: Recommendation[] = [
    {
      id: 'reviewing-risk-review',
      priority: Math.min(99, 75 + Math.round(riskScore * 0.15)),
      title: t(locale, 'ai.observer.recommendation.reviewingRiskReview.title'),
      detail: riskScore > 20
        ? tf(locale, 'ai.observer.recommendation.reviewingRiskReview.detailHigh', { riskScore })
        : t(locale, 'ai.observer.recommendation.reviewingRiskReview.detail'),
      actionLabel: t(locale, 'ai.observer.recommendation.reviewingRiskReview.actionLabel'),
    },
    makeRecommendation(locale, 'reviewingNext', 70),
    ...(noWaveformRecommendation ? [noWaveformRecommendation] : []),
  ];
  return reviewRecs;
}

export class ProjectObserver {
  evaluate(metrics: ObserverMetrics, waveformSignals?: WaveformSignals, locale: Locale = 'zh-CN'): ObserverResult {
    return {
      stage: inferStage(metrics),
      recommendations: generateRecommendations(metrics, waveformSignals, locale),
    };
  }
}
