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
  totalInputTokensTitle: '\u7d2f\u8ba1\u63d0\u793a\u4fa7 token\uff08\u4ee5 provider / \u6a21\u578b\u56de\u4f20\u4e3a\u51c6\uff1b\u82e5\u4e0d\u652f\u6301\u5219\u663e\u793a \u2014 \uff09',
  totalInputTokensLabel: '\u63d0\u793a',
  totalOutputTokensTitle: '\u7d2f\u8ba1\u751f\u6210\u4fa7 token\uff08\u4ee5 provider / \u6a21\u578b\u56de\u4f20\u4e3a\u51c6\uff1b\u82e5\u4e0d\u652f\u6301\u5219\u663e\u793a \u2014 \uff09',
  totalOutputTokensLabel: '\u751f\u6210',
  currentTurnTokensTitle: '\u6700\u8fd1\u4e00\u8f6e\uff1aprovider \u56de\u4f20\u7684 prompt + generation token \u5408\u8ba1',
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
  totalInputTokensTitle: 'Cumulative prompt-side tokens reported by the provider or model; shows — when usage is unavailable',
  totalInputTokensLabel: 'Prompt',
  totalOutputTokensTitle: 'Cumulative generation tokens reported by the provider or model; shows — when usage is unavailable',
  totalOutputTokensLabel: 'Gen',
  currentTurnTokensTitle: 'Last turn: provider-reported prompt + generation tokens combined',
  currentTurnTokensLabel: 'Turn',
  lastToolTitle: 'Last tool',
};

export function getAiChatMetricsBarMessages(isZh: boolean): AiChatMetricsBarMessages {
  return isZh ? zhCN : enUS;
}
