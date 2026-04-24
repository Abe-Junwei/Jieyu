import { t, tf, type Locale } from './index';

export type AiChatCardUtilityMessages = {
  confirmed: string;
  cancelled: string;
  confirmFailed: string;
  unknown: string;
  toolNames: Record<string, string>;
  currentSelectedSegment: string;
  allSegments: string;
  selectedSegments: (count: number) => string;
  indexedSegment: (index: number) => string;
  lastSegment: string;
  previousSegment: string;
  nextSegment: string;
  penultimateSegment: string;
  middleSegment: string;
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
  timelineUnitRef: string;
  noteRef: string;
  documentRef: string;
  reference: string;
  /** Appended to citation chip when RAG ref is absent from current timeline index. */
  citationReadModelMissSuffix: string;
};

function dictLocale(isZh: boolean): Locale {
  return isZh ? 'zh-CN' : 'en-US';
}

export function getAiChatCardUtilityMessages(isZh: boolean): AiChatCardUtilityMessages {
  const l = dictLocale(isZh);
  return {
    confirmed: t(l, 'msg.aiChatUtil.confirmed'),
    cancelled: t(l, 'msg.aiChatUtil.cancelled'),
    confirmFailed: t(l, 'msg.aiChatUtil.confirmFailed'),
    unknown: t(l, 'msg.aiChatUtil.unknown'),
    toolNames: {
      delete_transcription_segment: t(l, 'msg.aiChatUtil.tool.deleteTranscriptionSegment'),
      split_transcription_segment: t(l, 'msg.aiChatUtil.tool.splitTranscriptionSegment'),
      delete_layer: t(l, 'msg.aiChatUtil.tool.deleteLayer'),
      set_transcription_text: t(l, 'msg.aiChatUtil.tool.setTranscriptionText'),
      set_translation_text: t(l, 'msg.aiChatUtil.tool.setTranslationText'),
      clear_translation_segment: t(l, 'msg.aiChatUtil.tool.clearTranslationSegment'),
      create_transcription_segment: t(l, 'msg.aiChatUtil.tool.createTranscriptionSegment'),
    },
    currentSelectedSegment: t(l, 'msg.aiChatUtil.currentSelectedSegment'),
    allSegments: t(l, 'msg.aiChatUtil.allSegments'),
    selectedSegments: (count) => tf(l, 'msg.aiChatUtil.selectedSegments', { count }),
    indexedSegment: (index) => tf(l, 'msg.aiChatUtil.indexedSegment', { index }),
    lastSegment: t(l, 'msg.aiChatUtil.lastSegment'),
    previousSegment: t(l, 'msg.aiChatUtil.previousSegment'),
    nextSegment: t(l, 'msg.aiChatUtil.nextSegment'),
    penultimateSegment: t(l, 'msg.aiChatUtil.penultimateSegment'),
    middleSegment: t(l, 'msg.aiChatUtil.middleSegment'),
    segmentWithId: (id) => tf(l, 'msg.aiChatUtil.segmentWithId', { id }),
    layerWithId: (id) => tf(l, 'msg.aiChatUtil.layerWithId', { id }),
    translationLayer: t(l, 'msg.aiChatUtil.translationLayer'),
    transcriptionLayer: t(l, 'msg.aiChatUtil.transcriptionLayer'),
    targetLayer: t(l, 'msg.aiChatUtil.targetLayer'),
    layerLanguage: (label, language) => tf(l, 'msg.aiChatUtil.layerLanguage', { label, language }),
    confirmDelete: t(l, 'msg.aiChatUtil.confirmDelete'),
    confirmAction: t(l, 'msg.aiChatUtil.confirmAction'),
    irreversiblePatternSource: t(l, 'msg.aiChatUtil.irreversiblePatternSource'),
    reversiblePatternSource: t(l, 'msg.aiChatUtil.reversiblePatternSource'),
    replayable: t(l, 'msg.aiChatUtil.replayable'),
    auditOnly: t(l, 'msg.aiChatUtil.auditOnly'),
    timelineUnitRef: t(l, 'msg.aiChatUtil.timelineUnitRef'),
    noteRef: t(l, 'msg.aiChatUtil.noteRef'),
    documentRef: t(l, 'msg.aiChatUtil.documentRef'),
    reference: t(l, 'msg.aiChatUtil.reference'),
    citationReadModelMissSuffix: t(l, 'msg.aiChatUtil.citationReadModelMissSuffix'),
  };
}
