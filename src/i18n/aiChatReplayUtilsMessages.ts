export type AiChatReplayUtilsMessages = {
  replayNotFound: string;
  replayLoadFailed: string;
  exportReplayNotFound: string;
  exportSnapshotFailed: string;
  invalidSnapshotFormat: string;
  parseSnapshotFailed: string;
};

const zhCN: AiChatReplayUtilsMessages = {
  replayNotFound: '\u672a\u627e\u5230\u5bf9\u5e94\u56de\u653e\u6570\u636e\u3002',
  replayLoadFailed: '\u8bfb\u53d6\u56de\u653e\u5931\u8d25\u3002',
  exportReplayNotFound: '\u5bfc\u51fa\u5931\u8d25\uff1a\u672a\u627e\u5230\u5bf9\u5e94\u56de\u653e\u6570\u636e\u3002',
  exportSnapshotFailed: '\u5bfc\u51fa\u5feb\u7167\u5931\u8d25\u3002',
  invalidSnapshotFormat: '\u5feb\u7167\u683c\u5f0f\u65e0\u6548\uff0c\u8bf7\u5bfc\u5165\u6709\u6548\u7684 golden snapshot \u6587\u4ef6\u3002',
  parseSnapshotFailed: '\u5feb\u7167\u89e3\u6790\u5931\u8d25\uff0c\u6587\u4ef6\u683c\u5f0f\u6709\u8bef\u3002',
};

const enUS: AiChatReplayUtilsMessages = {
  replayNotFound: 'Replay bundle was not found.',
  replayLoadFailed: 'Failed to load replay bundle.',
  exportReplayNotFound: 'Export failed: replay bundle was not found.',
  exportSnapshotFailed: 'Failed to export snapshot.',
  invalidSnapshotFormat: 'Invalid snapshot format. Please import a valid golden snapshot file.',
  parseSnapshotFailed: 'Failed to parse snapshot file.',
};

export function getAiChatReplayUtilsMessages(isZh: boolean): AiChatReplayUtilsMessages {
  return isZh ? zhCN : enUS;
}
