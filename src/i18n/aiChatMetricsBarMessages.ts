import { t, type Locale } from './index';

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

function dictLocale(isZh: boolean): Locale {
  return isZh ? 'zh-CN' : 'en-US';
}

export function getAiChatMetricsBarMessages(isZh: boolean): AiChatMetricsBarMessages {
  const l = dictLocale(isZh);
  return {
    turnsTitle: t(l, 'msg.metricsBar.turnsTitle'),
    turnsLabel: t(l, 'msg.metricsBar.turnsLabel'),
    successesTitle: t(l, 'msg.metricsBar.successesTitle'),
    failuresTitle: t(l, 'msg.metricsBar.failuresTitle'),
    clarificationsTitle: t(l, 'msg.metricsBar.clarificationsTitle'),
    clarificationsLabel: t(l, 'msg.metricsBar.clarificationsLabel'),
    cancellationsTitle: t(l, 'msg.metricsBar.cancellationsTitle'),
    cancellationsLabel: t(l, 'msg.metricsBar.cancellationsLabel'),
    explainFallbacksTitle: t(l, 'msg.metricsBar.explainFallbacksTitle'),
    explainFallbacksLabel: t(l, 'msg.metricsBar.explainFallbacksLabel'),
    recoveriesTitle: t(l, 'msg.metricsBar.recoveriesTitle'),
    recoveriesLabel: t(l, 'msg.metricsBar.recoveriesLabel'),
    totalInputTokensTitle: t(l, 'msg.metricsBar.totalInputTokensTitle'),
    totalInputTokensLabel: t(l, 'msg.metricsBar.totalInputTokensLabel'),
    totalOutputTokensTitle: t(l, 'msg.metricsBar.totalOutputTokensTitle'),
    totalOutputTokensLabel: t(l, 'msg.metricsBar.totalOutputTokensLabel'),
    currentTurnTokensTitle: t(l, 'msg.metricsBar.currentTurnTokensTitle'),
    currentTurnTokensLabel: t(l, 'msg.metricsBar.currentTurnTokensLabel'),
    lastToolTitle: t(l, 'msg.metricsBar.lastToolTitle'),
  };
}
