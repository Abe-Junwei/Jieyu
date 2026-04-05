import type { Locale } from './index';

export type LayerActionLabels = {
  createTranscriptionLayer: string;
  createTranslationLayer: string;
  deleteLayer: string;
  transcriptionLayerType: string;
  translationLayerType: string;
};

const zhCN: LayerActionLabels = {
  createTranscriptionLayer: '\u65b0\u5efa\u8f6c\u5199\u5c42',
  createTranslationLayer: '\u65b0\u5efa\u7ffb\u8bd1\u5c42',
  deleteLayer: '\u5220\u9664\u5c42',
  transcriptionLayerType: '\u8f6c\u5199\u5c42',
  translationLayerType: '\u7ffb\u8bd1\u5c42',
};

const enUS: LayerActionLabels = {
  createTranscriptionLayer: 'New Transcription Layer',
  createTranslationLayer: 'New Translation Layer',
  deleteLayer: 'Delete Layer',
  transcriptionLayerType: 'Transcription',
  translationLayerType: 'Translation',
};

export function getLayerActionLabels(locale: Locale): LayerActionLabels {
  return locale === 'zh-CN' ? zhCN : enUS;
}