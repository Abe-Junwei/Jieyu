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
  if (metrics.transcribedRate < 0.2) return 'collecting';
  if (metrics.glossedRate < 0.2) return 'transcribing';
  if (metrics.verifiedRate < 0.5) return 'glossing';
  return 'reviewing';
}

export function generateRecommendations(metrics: ObserverMetrics): Recommendation[] {
  const stage = inferStage(metrics);
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
    return [
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
  }
  if (stage === 'glossing') {
    return [
      {
        id: 'glossing-risk-review',
        priority: 85,
        title: '优先复核高风险语段',
        detail: '先处理低置信度语段，可快速降低错误传播。',
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
  }
  return [
    {
      id: 'reviewing-risk-review',
      priority: 75,
      title: '复核剩余风险语段',
      detail: '导出前优先检查低置信度或可疑语段。',
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
}

export class ProjectObserver {
  evaluate(metrics: ObserverMetrics): ObserverResult {
    return {
      stage: inferStage(metrics),
      recommendations: generateRecommendations(metrics),
    };
  }
}
