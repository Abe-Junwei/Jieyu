// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DICT_KEYS, detectLocale, dictionaries, t, tf } from './index';

describe('i18n key governance', () => {
  it('keeps keys in lower-case dot notation', () => {
    const pattern = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
    for (const key of DICT_KEYS) {
      expect(pattern.test(key)).toBe(true);
    }
  });

  it('keeps every locale dictionary aligned with DICT_KEYS', () => {
    const expected = new Set(DICT_KEYS);
    for (const locale of Object.keys(dictionaries) as Array<keyof typeof dictionaries>) {
      const actual = new Set(Object.keys(dictionaries[locale]));
      expect(actual).toEqual(expected);
    }
  });
});

describe('i18n runtime behavior', () => {
  it('detectLocale returns zh-CN for zh locales and en-US otherwise', () => {
    const getter = vi.spyOn(navigator, 'language', 'get');

    getter.mockReturnValue('zh-TW');
    expect(detectLocale()).toBe('zh-CN');

    getter.mockReturnValue('en-GB');
    expect(detectLocale()).toBe('en-US');

    getter.mockRestore();
  });

  it('returns translated text via t', () => {
    expect(t('zh-CN', 'transcription.toolbar.refresh')).toBe('刷新数据');
    expect(t('en-US', 'transcription.toolbar.refresh')).toBe('Refresh data');
  });

  it('interpolates placeholders via tf', () => {
    expect(tf('zh-CN', 'transcription.zoom.scale', { percent: 150 })).toBe('缩放：150%');
    expect(tf('en-US', 'transcription.action.audioImported', { filename: 'demo.wav' })).toBe('Audio "demo.wav" imported successfully.');
  });
});
