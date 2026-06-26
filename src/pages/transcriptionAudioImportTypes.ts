/** 导入对话框在「已存在声学轨」时传给 `onImportAudio` 的选项。 */
export type TranscriptionAudioImportOptions = {
  mode?: 'replace' | 'add';
  /** 用户已在对话框确认时长不匹配说明。 */
  mismatchAcknowledged?: boolean;
  /** 导入完成后自动扩展 `logicalDurationSec` 的目标（秒）。 */
  postImportExpandLogicalToSec?: number;
};

/** 控制导入对话框是否展示 Replace / Add（占位-only 项目为 simple）。 */
export type AudioImportDisposition =
  | { kind: 'simple' }
  | { kind: 'choose'; replaceMediaId: string; replaceLabel: string };

/** 导入前时长不匹配感知（不阻止导入）。 */
export type AudioImportTimelineMismatchContext = {
  logicalDurationSecFromMapping?: number;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
};
