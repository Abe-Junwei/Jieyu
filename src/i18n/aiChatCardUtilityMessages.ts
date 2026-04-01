export type AiChatCardUtilityMessages = {
  confirmed: string;
  cancelled: string;
  confirmFailed: string;
  unknown: string;
  toolNames: Record<string, string>;
  currentSelectedSegment: string;
  segmentWithId: (id: string) => string;
  layerWithId: (id: string) => string;
  translationLayer: string;
  transcriptionLayer: string;
  targetLayer: string;
  layerLanguage: (label: string, language: string) => string;
  confirmDelete: string;
  confirmAction: string;
  irreversiblePatternSource: string;
  reversiblePatternSource: string;
  replayable: string;
  auditOnly: string;
  utteranceRef: string;
  noteRef: string;
  documentRef: string;
  reference: string;
};

const zhCN: AiChatCardUtilityMessages = {
  confirmed: '\u5df2\u786e\u8ba4\u6267\u884c',
  cancelled: '\u5df2\u53d6\u6d88\u6267\u884c',
  confirmFailed: '\u786e\u8ba4\u540e\u6267\u884c\u5931\u8d25',
  unknown: '\u672a\u77e5',
  toolNames: {
    delete_transcription_segment: '\u5220\u9664\u53e5\u6bb5',
    split_transcription_segment: '\u5207\u5206\u53e5\u6bb5',
    delete_layer: '\u5220\u9664\u5c42',
    set_transcription_text: '\u5199\u5165\u8f6c\u5199',
    set_translation_text: '\u5199\u5165\u7ffb\u8bd1',
    clear_translation_segment: '\u6e05\u7a7a\u7ffb\u8bd1',
    create_transcription_segment: '\u521b\u5efa\u53e5\u6bb5',
  },
  currentSelectedSegment: '\u5f53\u524d\u9009\u4e2d\u53e5\u6bb5',
  segmentWithId: (id) => `\u53e5\u6bb5\uff08${id}\uff09`,
  layerWithId: (id) => `\u5c42\uff08${id}\uff09`,
  translationLayer: '\u7ffb\u8bd1\u5c42',
  transcriptionLayer: '\u8f6c\u5199\u5c42',
  targetLayer: '\u76ee\u6807\u5c42',
  layerLanguage: (label, language) => `${label}\uff08\u8bed\u8a00\uff1a${language}\uff09`,
  confirmDelete: '\u786e\u8ba4\u5220\u9664',
  confirmAction: '\u786e\u8ba4\u6267\u884c',
  irreversiblePatternSource: '\\u4e0d\\u53ef\\u9006|irreversible',
  reversiblePatternSource: '\\u53ef\\u64a4\\u9500|\\u53ef\\u9006|\\u64a4\\u9500\\u6062\\u590d|undo|reversible',
  replayable: '\u53ef\u91cd\u653e',
  auditOnly: '\u4ec5\u53ef\u5ba1\u8ba1',
  utteranceRef: '\u53e5\u6bb5\u53c2\u8003',
  noteRef: '\u7b14\u8bb0\u53c2\u8003',
  documentRef: '\u6587\u6863\u53c2\u8003',
  reference: '\u53c2\u8003',
};

const enUS: AiChatCardUtilityMessages = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  confirmFailed: 'Confirm failed',
  unknown: 'Unknown',
  toolNames: {
    delete_transcription_segment: 'Delete Segment',
    split_transcription_segment: 'Split Segment',
    delete_layer: 'Delete Layer',
    set_transcription_text: 'Set Transcription',
    set_translation_text: 'Set Translation',
    clear_translation_segment: 'Clear Translation',
    create_transcription_segment: 'Create Segment',
  },
  currentSelectedSegment: 'Current selected segment',
  segmentWithId: (id) => `Segment (${id})`,
  layerWithId: (id) => `Layer (${id})`,
  translationLayer: 'Translation layer',
  transcriptionLayer: 'Transcription layer',
  targetLayer: 'Target layer',
  layerLanguage: (label, language) => `${label} (language: ${language})`,
  confirmDelete: 'Confirm Delete',
  confirmAction: 'Confirm Action',
  irreversiblePatternSource: '\\u4e0d\\u53ef\\u9006|irreversible',
  reversiblePatternSource: '\\u53ef\\u64a4\\u9500|\\u53ef\\u9006|\\u64a4\\u9500\\u6062\\u590d|undo|reversible',
  replayable: 'Replayable',
  auditOnly: 'Audit only',
  utteranceRef: 'Utterance Ref',
  noteRef: 'Note Ref',
  documentRef: 'Document Ref',
  reference: 'Reference',
};

export function getAiChatCardUtilityMessages(isZh: boolean): AiChatCardUtilityMessages {
  return isZh ? zhCN : enUS;
}
