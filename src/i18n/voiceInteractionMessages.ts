import { normalizeLocale, t, tf, type Locale } from './index';

export type VoiceInteractionMessages = {
  analysisWritebackDone: string;
  analysisWritebackFailed: string;
  sendToAiFailed: string;
  currentIndependentSegment: string;
  currentSentenceWithIndex: (rowNumber: number) => string;
  currentUnit: string;
  noUnitSelected: string;
  currentPageAction: string;
  analysisNoteSuffix: string;
  noLayerSelected: string;
  targetSummary: (layerLabel: string, rowLabel: string) => string;
  listeningDictation: string;
  listening: string;
  routing: string;
  executingDictation: string;
  executingAnalysis: string;
  executingAction: string;
  aiThinking: string;
  pushToTalkReady: string;
  listeningIdle: string;
  readyToStart: string;
  autoDetectLanguage: string;
  commercialModel: string;
  detectedLanguageSuffix: (language: string) => string;
  unknownSegment: string;
};

function dictLocale(locale: string): Locale {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getVoiceInteractionMessages(locale: string): VoiceInteractionMessages {
  const l = dictLocale(locale);
  return {
    analysisWritebackDone: t(l, 'msg.voice.analysisWritebackDone'),
    analysisWritebackFailed: t(l, 'msg.voice.analysisWritebackFailed'),
    sendToAiFailed: t(l, 'msg.voice.sendToAiFailed'),
    currentIndependentSegment: t(l, 'msg.voice.currentIndependentSegment'),
    currentSentenceWithIndex: (rowNumber) => tf(l, 'msg.voice.currentSentenceWithIndex', { rowNumber }),
    currentUnit: t(l, 'msg.voice.currentUnit'),
    noUnitSelected: t(l, 'msg.voice.noUnitSelected'),
    currentPageAction: t(l, 'msg.voice.currentPageAction'),
    analysisNoteSuffix: t(l, 'msg.voice.analysisNoteSuffix'),
    noLayerSelected: t(l, 'msg.voice.noLayerSelected'),
    targetSummary: (layerLabel, rowLabel) => tf(l, 'msg.voice.targetSummary', { layerLabel, rowLabel }),
    listeningDictation: t(l, 'msg.voice.listeningDictation'),
    listening: t(l, 'msg.voice.listening'),
    routing: t(l, 'msg.voice.routing'),
    executingDictation: t(l, 'msg.voice.executingDictation'),
    executingAnalysis: t(l, 'msg.voice.executingAnalysis'),
    executingAction: t(l, 'msg.voice.executingAction'),
    aiThinking: t(l, 'msg.voice.aiThinking'),
    pushToTalkReady: t(l, 'msg.voice.pushToTalkReady'),
    listeningIdle: t(l, 'msg.voice.listeningIdle'),
    readyToStart: t(l, 'msg.voice.readyToStart'),
    autoDetectLanguage: t(l, 'msg.voice.autoDetectLanguage'),
    commercialModel: t(l, 'msg.voice.commercialModel'),
    detectedLanguageSuffix: (language) => tf(l, 'msg.voice.detectedLanguageSuffix', { language }),
    unknownSegment: t(l, 'msg.voice.unknownSegment'),
  };
}
