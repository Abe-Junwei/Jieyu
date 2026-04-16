import type { Locale } from './index';

export type TranscriptionOverlaysMessages = {
  note: string;
  segment: string;
  deleteSegments: (count: number) => string;
  mergeSegments: (count: number) => string;
  selectBeforeAll: string;
  selectAfterAll: string;
  deleteSegment: string;
  mergePrevious: string;
  mergeNext: string;
  splitFromCurrent: string;
  splitSegment: string;
  addNote: string;
  assignSpeakerRecent: (name: string) => string;
  assignSpeaker: (name: string) => string;
  clearSpeaker: string;
  createSpeakerAndAssign: string;
  speakerManagement: string;
  editTranscriptionLayerMetadata: string;
  editTranslationLayerMetadata: string;
  layerDisplayStyle: string;
};

const zhCN: TranscriptionOverlaysMessages = {
  note: '\u5907\u6ce8',
  segment: '\u53e5\u6bb5',
  deleteSegments: (count) => `\u5220\u9664 ${count} \u4e2a\u53e5\u6bb5`,
  mergeSegments: (count) => `\u5408\u5e76 ${count} \u4e2a\u53e5\u6bb5`,
  selectBeforeAll: '\u9009\u4e2d\u6b64\u53e5\u6bb5\u53ca\u4e4b\u524d\u6240\u6709',
  selectAfterAll: '\u9009\u4e2d\u6b64\u53e5\u6bb5\u53ca\u4e4b\u540e\u6240\u6709',
  deleteSegment: '\u5220\u9664\u53e5\u6bb5',
  mergePrevious: '\u5411\u524d\u5408\u5e76',
  mergeNext: '\u5411\u540e\u5408\u5e76',
  splitFromCurrent: '\u4ece\u5f53\u524d\u4f4d\u7f6e\u62c6\u5206\u53e5\u6bb5',
  splitSegment: '\u62c6\u5206\u53e5\u6bb5',
  addNote: '\u6dfb\u52a0\u5907\u6ce8',
  assignSpeakerRecent: (name) => `\u6307\u6d3e\u8bf4\u8bdd\u4eba\uff08\u6700\u8fd1\uff09\u2192 ${name}`,
  assignSpeaker: (name) => `\u6307\u6d3e\u8bf4\u8bdd\u4eba \u2192 ${name}`,
  clearSpeaker: '\u6e05\u7a7a\u8bf4\u8bdd\u4eba',
  createSpeakerAndAssign: '\u65b0\u5efa\u8bf4\u8bdd\u4eba\u5e76\u6307\u6d3e\u2026',
  speakerManagement: '\u8bf4\u8bdd\u4eba\u7ba1\u7406',
  editTranscriptionLayerMetadata: '编辑转写层元信息',
  editTranslationLayerMetadata: '编辑翻译层元信息',
  layerDisplayStyle: '\u672c\u5c42\u663e\u793a\u6837\u5f0f',
};

const enUS: TranscriptionOverlaysMessages = {
  note: 'Note',
  segment: 'Segment',
  deleteSegments: (count) => `Delete ${count} segment(s)`,
  mergeSegments: (count) => `Merge ${count} segment(s)`,
  selectBeforeAll: 'Select this segment and all before',
  selectAfterAll: 'Select this segment and all after',
  deleteSegment: 'Delete Segment',
  mergePrevious: 'Merge Backward',
  mergeNext: 'Merge Forward',
  splitFromCurrent: 'Split Segment at Current Position',
  splitSegment: 'Split Segment',
  addNote: 'Add Note',
  assignSpeakerRecent: (name) => `Assign Speaker (Recent) -> ${name}`,
  assignSpeaker: (name) => `Assign Speaker -> ${name}`,
  clearSpeaker: 'Clear Speaker',
  createSpeakerAndAssign: 'Create Speaker and Assign…',
  speakerManagement: 'Speaker Management',
  editTranscriptionLayerMetadata: 'Edit transcription metadata',
  editTranslationLayerMetadata: 'Edit translation metadata',
  layerDisplayStyle: 'Layer Display Style',
};

export function getTranscriptionOverlaysMessages(locale: Locale): TranscriptionOverlaysMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
