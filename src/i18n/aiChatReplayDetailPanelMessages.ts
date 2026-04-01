export type AiChatReplayDetailPanelMessages = {
  title: string;
  hideDetail: string;
  showDetail: string;
  close: string;
  tool: string;
  request: string;
  status: string;
  latestDecision: string;
  toolArguments: string;
  decisionTimeline: string;
  goldenPreview: string;
  importAndCompare: string;
  clearDiff: string;
  snapshotDiff: string;
  matches: string;
  changed: string;
  baseline: (requestId: string) => string;
};

const zhCN: AiChatReplayDetailPanelMessages = {
  title: '\u56de\u653e / \u5bf9\u6bd4',
  hideDetail: '\u6536\u8d77\u8be6\u60c5',
  showDetail: '\u5c55\u5f00\u8be6\u60c5',
  close: '\u5173\u95ed',
  tool: '\u5de5\u5177',
  request: '\u8bf7\u6c42',
  status: '\u72b6\u6001',
  latestDecision: '\u6700\u65b0\u51b3\u7b56',
  toolArguments: '\u6267\u884c\u53c2\u6570',
  decisionTimeline: '\u51b3\u7b56\u8f68\u8ff9',
  goldenPreview: 'Golden \u5feb\u7167\u9884\u89c8',
  importAndCompare: '\u5bfc\u5165\u5feb\u7167\u5bf9\u6bd4',
  clearDiff: '\u6e05\u9664\u5bf9\u6bd4',
  snapshotDiff: '\u5feb\u7167\u5bf9\u6bd4',
  matches: '\u2713 \u4e00\u81f4',
  changed: '\u25b3 \u6709\u5dee\u5f02',
  baseline: (requestId) => `\u57fa\u51c6: ${requestId}`,
};

const enUS: AiChatReplayDetailPanelMessages = {
  title: 'Replay / Compare',
  hideDetail: 'Hide detail',
  showDetail: 'Show detail',
  close: 'Close',
  tool: 'Tool',
  request: 'Request',
  status: 'Status',
  latestDecision: 'Latest decision',
  toolArguments: 'Tool arguments',
  decisionTimeline: 'Decision timeline',
  goldenPreview: 'Golden Snapshot Preview',
  importAndCompare: 'Import & Compare',
  clearDiff: 'Clear diff',
  snapshotDiff: 'Snapshot Diff',
  matches: '\u2713 Matches',
  changed: '\u25b3 Changed',
  baseline: (requestId) => `Baseline: ${requestId}`,
};

export function getAiChatReplayDetailPanelMessages(isZh: boolean): AiChatReplayDetailPanelMessages {
  return isZh ? zhCN : enUS;
}
