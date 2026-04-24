import { t, type Locale } from './index';

export type AiChatReplayUtilsMessages = {
  replayNotFound: string;
  replayLoadFailed: string;
  exportReplayNotFound: string;
  exportSnapshotFailed: string;
  invalidSnapshotFormat: string;
  parseSnapshotFailed: string;
};

export function getAiChatReplayUtilsMessages(isZh: boolean): AiChatReplayUtilsMessages {
  const locale: Locale = isZh ? 'zh-CN' : 'en-US';
  return {
    replayNotFound: t(locale, 'ai.chat.replayUtils.replayNotFound'),
    replayLoadFailed: t(locale, 'ai.chat.replayUtils.replayLoadFailed'),
    exportReplayNotFound: t(locale, 'ai.chat.replayUtils.exportReplayNotFound'),
    exportSnapshotFailed: t(locale, 'ai.chat.replayUtils.exportSnapshotFailed'),
    invalidSnapshotFormat: t(locale, 'ai.chat.replayUtils.invalidSnapshotFormat'),
    parseSnapshotFailed: t(locale, 'ai.chat.replayUtils.parseSnapshotFailed'),
  };
}
