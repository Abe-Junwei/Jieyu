export type ProjectStage = 'collecting' | 'transcribing' | 'glossing' | 'reviewing';

export interface ObserverMetrics {
  transcribedRate: number;
  glossedRate: number;
  verifiedRate: number;
  utteranceCount: number;
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

export function inferStage(metrics: ObserverMetrics): ProjectStage {
  if (metrics.utteranceCount <= 0) return 'collecting';
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
export function computeMultiSignalRiskScore(signals: WaveformSignals, utteranceCount: number): number {
  if (utteranceCount <= 0) return 0;
  const confRatio = Math.min(1, signals.lowConfidenceCount / utteranceCount);
  const overlapRatio = Math.min(1, signals.overlapCount / Math.max(1, utteranceCount));
  const gapPenalty = Math.min(1, signals.maxGapSeconds / 10);
  const hotZoneFactor = signals.topHotZoneSeverity ?? 0;

  // 加权：低置信度 40%、重叠 25%、间隙 15%、热区 20%
  // Weights: low-confidence 40%, overlap 25%, gap 15%, hot-zone 20%
  const raw = confRatio * 0.4 + overlapRatio * 0.25 + gapPenalty * 0.15 + hotZoneFactor * 0.2;
  return Math.round(Math.min(100, raw * 100));
}

export function generateRecommendations(metrics: ObserverMetrics, waveformSignals?: WaveformSignals): Recommendation[] {
  const stage = inferStage(metrics);
  const riskScore = waveformSignals ? computeMultiSignalRiskScore(waveformSignals, metrics.utteranceCount) : 0;

  if (stage === 'collecting') {
    return [{
      id: 'collecting-next',
      priority: 100,
      title: '先完成分段与转写覆盖',
      detail: '建议先补齐当前媒体的基础分段，并完成主要语段转写。',
      actionLabel: '跳转处理',
    }];
  }
  if (stage === 'transcribing') {
    const recs: Recommendation[] = [
      {
        id: 'transcribing-jump-untagged',
        priority: 92,
        title: '跳转到未标注语段',
        detail: '优先处理包含未标注 POS 的语段，快速提升标注覆盖。',
        actionLabel: '跳转未标注',
      },
      {
        id: 'transcribing-batch-pos',
        priority: 90,
        title: '执行同词形批量 POS',
        detail: '对同词形且已知词性的 token 执行批量赋值，减少重复操作。',
        actionLabel: '批量 POS',
      },
    ];
    // 重叠信号额外提醒 | Overlap signal warning
    if (waveformSignals && waveformSignals.overlapCount >= 3) {
      recs.push({
        id: 'transcribing-overlap-warn',
        priority: 88,
        title: '存在多处说话人重叠',
        detail: `检测到 ${waveformSignals.overlapCount} 处重叠，建议检查分段边界后再标注。`,
        actionLabel: '查看重叠',
      });
    }
    return recs;
  }
  if (stage === 'glossing') {
    const recs: Recommendation[] = [
      {
        id: 'glossing-risk-review',
        priority: Math.min(99, 85 + Math.round(riskScore * 0.1)),
        title: '优先复核高风险语段',
        detail: riskScore > 30
          ? `综合风险分 ${riskScore}/100，含低置信度、重叠、间隙多种信号，建议集中复核。`
          : '先处理低置信度语段，可快速降低错误传播。',
        actionLabel: '风险复核',
      },
      {
        id: 'glossing-next',
        priority: 80,
        title: '进入校核阶段',
        detail: '建议优先复核低置信度条目并统一标签规范。',
        actionLabel: '跳转处理',
      },
    ];
    // 大间隙提醒 | Large gap warning
    if (waveformSignals && waveformSignals.maxGapSeconds > 3) {
      recs.push({
        id: 'glossing-gap-warn',
        priority: 82,
        title: '存在较大静音间隙',
        detail: `最大间隙 ${waveformSignals.maxGapSeconds.toFixed(1)}s，可能需要补充分段或标记静音区。`,
        actionLabel: '查看间隙',
      });
    }
    return recs;
  }
  const reviewRecs: Recommendation[] = [
    {
      id: 'reviewing-risk-review',
      priority: Math.min(99, 75 + Math.round(riskScore * 0.15)),
      title: '复核剩余风险语段',
      detail: riskScore > 20
        ? `综合风险分 ${riskScore}/100，导出前建议集中复核风险区域。`
        : '导出前优先检查低置信度或可疑语段。',
      actionLabel: '风险复核',
    },
    {
      id: 'reviewing-next',
      priority: 70,
      title: '准备导出前检查',
      detail: '建议执行一致性检查与导出预检。',
      actionLabel: '查看语段',
    },
  ];
  return reviewRecs;
}

export class ProjectObserver {
  evaluate(metrics: ObserverMetrics, waveformSignals?: WaveformSignals): ObserverResult {
    return {
      stage: inferStage(metrics),
      recommendations: generateRecommendations(metrics, waveformSignals),
    };
  }
}
