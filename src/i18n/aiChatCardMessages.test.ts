import { describe, expect, it } from 'vitest';
import { getAiChatCardMessages } from './aiChatCardMessages';
import { DEFAULT_VOICE_MODE } from '../services/voiceMode';

describe('getAiChatCardMessages.recommendedInputPlaceholder', () => {
  it('builds a translation-layer placeholder from focused context in zh-CN', () => {
    const message = getAiChatCardMessages(true).recommendedInputPlaceholder({
      fallback: '输入问题',
      page: 'transcription',
      observerStage: 'reviewing',
      aiCurrentTask: 'risk_review',
      selectedLayerType: 'translation',
      selectedUnitKind: 'unit',
      selectedTimeRangeLabel: '00:12-00:15',
      rowNumber: 12,
      selectedText: '这是当前译文，需要再检查一遍',
      confidence: 0.61,
      preferredMode: 'analysis',
      confirmationThreshold: 'always',
    });

    expect(message).toContain('析：');
    expect(message).toContain('第 12 行');
    expect(message).toContain('翻译层');
    expect(message).toContain('复核');
  });

  it('builds a transcription completion placeholder when current text is empty', () => {
    const message = getAiChatCardMessages(true).recommendedInputPlaceholder({
      fallback: '输入问题',
      page: 'transcription',
      observerStage: 'transcribing',
      aiCurrentTask: 'transcription',
      selectedLayerType: 'transcription',
      selectedUnitKind: 'segment',
      rowNumber: 4,
      selectedText: '',
      preferredMode: DEFAULT_VOICE_MODE,
      confirmationThreshold: 'destructive',
    });

    expect(message).toContain('问：');
    expect(message).toContain('转写层');
    expect(message).toContain('补全');
  });

  it('falls back to stage-based recommendation without focused selection in English', () => {
    const message = getAiChatCardMessages(false).recommendedInputPlaceholder({
      fallback: 'Ask a question',
      page: 'transcription',
      observerStage: 'glossing',
      aiCurrentTask: 'glossing',
      selectedText: '',
      preferredMode: 'analysis',
      confirmationThreshold: 'destructive',
    });

    expect(message).toContain('Analyze:');
    expect(message).toContain('gloss or POS');
  });
});
