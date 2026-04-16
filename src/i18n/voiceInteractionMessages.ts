import { normalizeLocale } from './index';

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

const zhCN: VoiceInteractionMessages = {
  analysisWritebackDone: 'AI \u5206\u6790\u7ed3\u679c\u5df2\u5199\u56de\u3002',
  analysisWritebackFailed: 'AI \u5206\u6790\u5199\u56de\u5931\u8d25\u3002',
  sendToAiFailed: '\u53d1\u9001\u5230 AI \u5931\u8d25\u3002',
  currentIndependentSegment: '\u5f53\u524d\u72ec\u7acb\u6bb5',
  currentSentenceWithIndex: (rowNumber) => `\u7b2c ${rowNumber} \u53e5`,
  currentUnit: '\u5f53\u524d\u53e5\u6bb5',
  noUnitSelected: '\u672a\u9009\u62e9\u53e5\u6bb5',
  currentPageAction: '\u5f53\u524d\u9875\u9762\u64cd\u4f5c',
  analysisNoteSuffix: 'AI \u5206\u6790\u5907\u6ce8',
  noLayerSelected: '\u672a\u9009\u62e9\u5c42',
  targetSummary: (layerLabel, rowLabel) => `${layerLabel} / ${rowLabel}`,
  listeningDictation: '\u6b63\u5728\u542c\u5199\uff0c\u8bf7\u76f4\u63a5\u8bf4\u51fa\u8981\u5199\u5165\u7684\u5185\u5bb9\u3002',
  listening: '\u6b63\u5728\u76d1\u542c\uff0c\u8bf7\u5f00\u59cb\u8bf4\u8bdd\u3002',
  routing: '\u5df2\u8bc6\u522b\u8bed\u97f3\uff0c\u6b63\u5728\u5224\u65ad\u610f\u56fe\u3002',
  executingDictation: '\u6b63\u5728\u5c06\u8bc6\u522b\u7ed3\u679c\u5199\u5165\u6587\u672c\u6846\u3002',
  executingAnalysis: '\u6b63\u5728\u51c6\u5907\u53d1\u9001\u5230 AI \u5206\u6790\u3002',
  executingAction: '\u6b63\u5728\u6267\u884c\u8bed\u97f3\u64cd\u4f5c\u3002',
  aiThinking: '\u6b63\u5728\u7b49\u5f85 AI \u5904\u7406\u7ed3\u679c\u3002',
  pushToTalkReady: '\u8bed\u97f3\u901a\u9053\u5df2\u5c31\u7eea\uff0c\u6309\u4f4f\u9ea6\u514b\u98ce\u5f00\u59cb\u5f55\u97f3\u3002',
  listeningIdle: '\u8bed\u97f3\u901a\u9053\u5df2\u5f00\u542f\uff0c\u7b49\u5f85\u4e0b\u4e00\u53e5\u8f93\u5165\u3002',
  readyToStart: '\u5c31\u7eea\uff0c\u70b9\u51fb\u9ea6\u514b\u98ce\u5f00\u59cb\u8bed\u97f3\u4ea4\u4e92\u3002',
  autoDetectLanguage: '\u81ea\u52a8\u68c0\u6d4b',
  commercialModel: '\u5546\u4e1a\u6a21\u578b',
  detectedLanguageSuffix: (language) => ` \u00b7 \u5df2\u8bc6\u522b ${language}`,
  unknownSegment: '\u672a\u5b9a\u4f4d\u53e5\u6bb5',
};

const enUS: VoiceInteractionMessages = {
  analysisWritebackDone: 'AI analysis result written back.',
  analysisWritebackFailed: 'Failed to write back AI analysis.',
  sendToAiFailed: 'Failed to send to AI.',
  currentIndependentSegment: 'Current independent segment',
  currentSentenceWithIndex: (rowNumber) => `Sentence ${rowNumber}`,
  currentUnit: 'Current segment',
  noUnitSelected: 'No segment selected',
  currentPageAction: 'Current page action',
  analysisNoteSuffix: 'AI analysis note',
  noLayerSelected: 'No layer selected',
  targetSummary: (layerLabel, rowLabel) => `${layerLabel} / ${rowLabel}`,
  listeningDictation: 'Listening for dictation. Please speak the content to insert.',
  listening: 'Listening. Please start speaking.',
  routing: 'Voice recognized. Determining intent...',
  executingDictation: 'Writing recognized speech into the text field.',
  executingAnalysis: 'Preparing to send for AI analysis.',
  executingAction: 'Executing voice action.',
  aiThinking: 'Waiting for AI processing result.',
  pushToTalkReady: 'Voice channel is ready. Hold the mic to start recording.',
  listeningIdle: 'Voice channel is enabled. Waiting for your next input.',
  readyToStart: 'Ready. Click the mic to start voice interaction.',
  autoDetectLanguage: 'Auto detect',
  commercialModel: 'Commercial model',
  detectedLanguageSuffix: (language) => ` · detected ${language}`,
  unknownSegment: 'Segment not located',
};

export function getVoiceInteractionMessages(locale: string): VoiceInteractionMessages {
  return normalizeLocale(locale) === 'zh-CN' ? zhCN : enUS;
}
