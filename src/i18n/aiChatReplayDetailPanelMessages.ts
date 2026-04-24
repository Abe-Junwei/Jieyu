import { t, tf, type Locale } from './index';

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

function dictLocale(isZh: boolean): Locale {
  return isZh ? 'zh-CN' : 'en-US';
}

export function getAiChatReplayDetailPanelMessages(isZh: boolean): AiChatReplayDetailPanelMessages {
  const l = dictLocale(isZh);
  return {
    title: t(l, 'msg.aiReplayDetail.title'),
    hideDetail: t(l, 'msg.aiReplayDetail.hideDetail'),
    showDetail: t(l, 'msg.aiReplayDetail.showDetail'),
    close: t(l, 'msg.aiReplayDetail.close'),
    tool: t(l, 'msg.aiReplayDetail.tool'),
    request: t(l, 'msg.aiReplayDetail.request'),
    status: t(l, 'msg.aiReplayDetail.status'),
    latestDecision: t(l, 'msg.aiReplayDetail.latestDecision'),
    toolArguments: t(l, 'msg.aiReplayDetail.toolArguments'),
    decisionTimeline: t(l, 'msg.aiReplayDetail.decisionTimeline'),
    goldenPreview: t(l, 'msg.aiReplayDetail.goldenPreview'),
    importAndCompare: t(l, 'msg.aiReplayDetail.importAndCompare'),
    clearDiff: t(l, 'msg.aiReplayDetail.clearDiff'),
    snapshotDiff: t(l, 'msg.aiReplayDetail.snapshotDiff'),
    matches: t(l, 'msg.aiReplayDetail.matches'),
    changed: t(l, 'msg.aiReplayDetail.changed'),
    baseline: (requestId) => tf(l, 'msg.aiReplayDetail.baseline', { requestId }),
  };
}
