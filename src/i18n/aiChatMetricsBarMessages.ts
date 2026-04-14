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
  totalInputTokensTitle: '\u7d2f\u8ba1\u63d0\u793a\u4fa7 token \u4f30\u7b97\uff08\u542b\u7528\u6237\u6d88\u606f\u3001\u5bf9\u8bdd\u5386\u53f2\u3001\u7cfb\u7edf\u4e0e\u4e0a\u4e0b\u6587\uff1b\u7ea6\u6bcf 4 \u5b57\u7b26 1 token\uff09',
  totalInputTokensLabel: '\u63d0\u793a',
  totalOutputTokensTitle: '\u7d2f\u8ba1\u751f\u6210\u4fa7 token \u4f30\u7b97\uff08\u52a9\u624b\u53ef\u89c1\u56de\u590d\u4e0e\u63a8\u7406/\u601d\u8003\u94fe\u6587\u672c\uff09',
  totalOutputTokensLabel: '\u751f\u6210',
  currentTurnTokensTitle: '\u6700\u8fd1\u4e00\u8f6e\uff1a\u63d0\u793a\u4fa7 + \u751f\u6210\u4fa7\u4f30\u7b97\u5408\u8ba1',
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
  totalInputTokensTitle: 'Cumulative prompt-side estimate (user message + chat history + system/context; ~4 chars ≈ 1 token)',
  totalInputTokensLabel: 'Prompt',
  totalOutputTokensTitle: 'Cumulative generation estimate (assistant reply + reasoning/thinking text if any)',
  totalOutputTokensLabel: 'Gen',
  currentTurnTokensTitle: 'Last turn: prompt-side + generation estimate combined',
  currentTurnTokensLabel: 'Turn',
  lastToolTitle: 'Last tool',
};

export function getAiChatMetricsBarMessages(isZh: boolean): AiChatMetricsBarMessages {
  return isZh ? zhCN : enUS;
}
