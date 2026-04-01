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

export function generateRecommendations(metrics: ObserverMetrics): Recommendation[] {
  const stage = inferStage(metrics);
  if (stage === 'collecting') {
    return [{
      id: 'collecting-next',
      priority: 100,
      title: '\u5148\u5b8c\u6210\u5206\u6bb5\u4e0e\u8f6c\u5199\u8986\u76d6',
      detail: '\u5efa\u8bae\u5148\u8865\u9f50\u5f53\u524d\u5a92\u4f53\u7684\u57fa\u7840\u5206\u6bb5\uff0c\u5e76\u5b8c\u6210\u4e3b\u8981\u8bed\u6bb5\u8f6c\u5199\u3002',
      actionLabel: '\u8df3\u8f6c\u5904\u7406',
    }];
  }
  if (stage === 'transcribing') {
    return [
      {
        id: 'transcribing-jump-untagged',
        priority: 92,
        title: '\u8df3\u8f6c\u5230\u672a\u6807\u6ce8\u8bed\u6bb5',
        detail: '\u4f18\u5148\u5904\u7406\u5305\u542b\u672a\u6807\u6ce8 POS \u7684\u8bed\u6bb5\uff0c\u5feb\u901f\u63d0\u5347\u6807\u6ce8\u8986\u76d6\u3002',
        actionLabel: '\u8df3\u8f6c\u672a\u6807\u6ce8',
      },
      {
        id: 'transcribing-batch-pos',
        priority: 90,
        title: '\u6267\u884c\u540c\u8bcd\u5f62\u6279\u91cf POS',
        detail: '\u5bf9\u540c\u8bcd\u5f62\u4e14\u5df2\u77e5\u8bcd\u6027\u7684 token \u6267\u884c\u6279\u91cf\u8d4b\u503c\uff0c\u51cf\u5c11\u91cd\u590d\u64cd\u4f5c\u3002',
        actionLabel: '\u6279\u91cf POS',
      },
    ];
  }
  if (stage === 'glossing') {
    return [
      {
        id: 'glossing-risk-review',
        priority: 85,
        title: '\u4f18\u5148\u590d\u6838\u9ad8\u98ce\u9669\u8bed\u6bb5',
        detail: '\u5148\u5904\u7406\u4f4e\u7f6e\u4fe1\u5ea6\u8bed\u6bb5\uff0c\u53ef\u5feb\u901f\u964d\u4f4e\u9519\u8bef\u4f20\u64ad\u3002',
        actionLabel: '\u98ce\u9669\u590d\u6838',
      },
      {
        id: 'glossing-next',
        priority: 80,
        title: '\u8fdb\u5165\u6821\u6838\u9636\u6bb5',
        detail: '\u5efa\u8bae\u4f18\u5148\u590d\u6838\u4f4e\u7f6e\u4fe1\u5ea6\u6761\u76ee\u5e76\u7edf\u4e00\u6807\u7b7e\u89c4\u8303\u3002',
        actionLabel: '\u8df3\u8f6c\u5904\u7406',
      },
    ];
  }
  return [
    {
      id: 'reviewing-risk-review',
      priority: 75,
      title: '\u590d\u6838\u5269\u4f59\u98ce\u9669\u8bed\u6bb5',
      detail: '\u5bfc\u51fa\u524d\u4f18\u5148\u68c0\u67e5\u4f4e\u7f6e\u4fe1\u5ea6\u6216\u53ef\u7591\u8bed\u6bb5\u3002',
      actionLabel: '\u98ce\u9669\u590d\u6838',
    },
    {
      id: 'reviewing-next',
      priority: 70,
      title: '\u51c6\u5907\u5bfc\u51fa\u524d\u68c0\u67e5',
      detail: '\u5efa\u8bae\u6267\u884c\u4e00\u81f4\u6027\u68c0\u67e5\u4e0e\u5bfc\u51fa\u9884\u68c0\u3002',
      actionLabel: '\u67e5\u770b\u8bed\u6bb5',
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
