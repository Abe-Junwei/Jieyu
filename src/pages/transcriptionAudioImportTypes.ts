/** 导入对话框在「已存在声学轨」时传给 `onImportAudio` 的选项。 */
export type TranscriptionAudioImportOptions = { mode: 'replace' | 'add' };

/** 控制导入对话框是否展示 Replace / Add（占位-only 项目为 simple）。 */
export type AudioImportDisposition =
  | { kind: 'simple' }
  | { kind: 'choose'; replaceMediaId: string; replaceLabel: string };
