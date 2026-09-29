import { describe, expect, it } from 'vitest';
import {
  annotationSegmenterLocale,
  annotationUsesDictionaryTokenization,
} from './annotationTokenizationProfile';
import { previewAnnotationRetokenize, proposeAnnotationTokenForms } from './annotationRetokenize';

describe('annotation tokenization profile', () => {
  it('maps Chinese, Japanese, and Thai codes onto dictionary segmenter locales', () => {
    expect(annotationSegmenterLocale('zho')).toBe('zh');
    expect(annotationSegmenterLocale('cmn')).toBe('zh');
    expect(annotationSegmenterLocale('zh-CN')).toBe('zh');
    expect(annotationSegmenterLocale('jpn')).toBe('ja');
    expect(annotationSegmenterLocale('tha')).toBe('th');
    expect(annotationSegmenterLocale('eng')).toBe('und');
    expect(annotationUsesDictionaryTokenization('zho')).toBe(true);
    expect(annotationUsesDictionaryTokenization('eng')).toBe(false);
  });

  it('proposes dictionary words for Chinese, Japanese, and Thai', () => {
    expect(proposeAnnotationTokenForms('你好世界', 'zho')).toEqual(['你好', '世界']);
    expect(proposeAnnotationTokenForms('私は学生です', 'jpn')).toEqual([
      '私',
      'は',
      '学生',
      'です',
    ]);
    expect(proposeAnnotationTokenForms('ฉันรักเธอ', 'tha')).toEqual(['ฉัน', 'รัก', 'เธอ']);
    expect(proposeAnnotationTokenForms('hello world', 'eng')).toEqual(['hello', 'world']);
  });

  it('previews with the transcription language', () => {
    const preview = previewAnnotationRetokenize({
      unitId: 'unit-1',
      surface: '你好世界',
      currentForms: ['你好世界'],
      languageId: 'zho',
    });
    expect(preview.proposedForms).toEqual(['你好', '世界']);
    expect(preview.unchanged).toBe(false);
  });
});
