export type AiChatMetricsBarMessages = {
  turnsTitle: string;
  turnsLabel: string;
  successesTitle: string;
  failuresTitle: string;
  clarificationsTitle: string;
  clarificationsLabel: string;
  cancellationsTitle: string;
  cancellationsLabel: string;
  explainFallbacksTitle: string;
  explainFallbacksLabel: string;
  recoveriesTitle: string;
  recoveriesLabel: string;
  totalInputTokensTitle: string;
  totalInputTokensLabel: string;
  totalOutputTokensTitle: string;
  totalOutputTokensLabel: string;
  currentTurnTokensTitle: string;
  currentTurnTokensLabel: string;
  lastToolTitle: string;
};

const zhCN: AiChatMetricsBarMessages = {
  turnsTitle: '\u5bf9\u8bdd\u8f6e\u6b21',
  turnsLabel: '\u8f6e\u6b21',
  successesTitle: '\u6267\u884c\u6210\u529f',
  failuresTitle: '\u6267\u884c\u5931\u8d25',
  clarificationsTitle: '\u6f84\u6e05\u6b21\u6570',
  clarificationsLabel: '\u6f84\u6e05',
  cancellationsTitle: '\u53d6\u6d88\u6b21\u6570',
  cancellationsLabel: '\u53d6\u6d88',
  explainFallbacksTitle: '\u89e3\u91ca\u56de\u9000',
  explainFallbacksLabel: '\u89e3\u91ca',
  recoveriesTitle: '\u6062\u590d\u6b21\u6570',
  recoveriesLabel: '\u6062\u590d',
  totalInputTokensTitle: '\u7d2f\u8ba1\u8f93\u5165 token',
  totalInputTokensLabel: '\u8f93\u5165',
  totalOutputTokensTitle: '\u7d2f\u8ba1\u8f93\u51fa token',
  totalOutputTokensLabel: '\u8f93\u51fa',
  currentTurnTokensTitle: '\u5f53\u524d\u8f6e\u6b21 token',
  currentTurnTokensLabel: '\u672c\u8f6e',
  lastToolTitle: '\u4e0a\u6b21\u5de5\u5177',
};

const enUS: AiChatMetricsBarMessages = {
  turnsTitle: 'Turns',
  turnsLabel: 'Turns',
  successesTitle: 'Successes',
  failuresTitle: 'Failures',
  clarificationsTitle: 'Clarifications',
  clarificationsLabel: 'Clarify',
  cancellationsTitle: 'Cancellations',
  cancellationsLabel: 'Cancel',
  explainFallbacksTitle: 'Explain fallbacks',
  explainFallbacksLabel: 'Explain',
  recoveriesTitle: 'Recoveries',
  recoveriesLabel: 'Recover',
  totalInputTokensTitle: 'Total input tokens',
  totalInputTokensLabel: 'In',
  totalOutputTokensTitle: 'Total output tokens',
  totalOutputTokensLabel: 'Out',
  currentTurnTokensTitle: 'Current turn tokens',
  currentTurnTokensLabel: 'Turn',
  lastToolTitle: 'Last tool',
};

export function getAiChatMetricsBarMessages(isZh: boolean): AiChatMetricsBarMessages {
  return isZh ? zhCN : enUS;
}
