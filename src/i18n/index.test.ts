// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DICT_KEYS, LOCALE_PREFERENCE_STORAGE_KEY, clearStoredLocalePreference, detectLocale, dictionaries, getStoredLocalePreference, setStoredLocalePreference, t, tf } from './index';

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
  it('prefers explicit stored locale over navigator language', () => {
    const getter = vi.spyOn(navigator, 'language', 'get');
    getter.mockReturnValue('en-GB');

    setStoredLocalePreference('zh-CN');
    expect(getStoredLocalePreference()).toBe('zh-CN');
    expect(detectLocale()).toBe('zh-CN');

    clearStoredLocalePreference();
    expect(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBeNull();
    getter.mockRestore();
  });

  it('detectLocale returns zh-CN for zh locales and en-US otherwise', () => {
    const getter = vi.spyOn(navigator, 'language', 'get');

    getter.mockReturnValue('zh-TW');
    expect(detectLocale()).toBe('zh-CN');

    getter.mockReturnValue('en-GB');
    expect(detectLocale()).toBe('en-US');

    getter.mockRestore();
  });

  it('falls back to navigator when stored locale is invalid', () => {
    const getter = vi.spyOn(navigator, 'language', 'get');
    getter.mockReturnValue('en-GB');
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'fr-FR');

    expect(getStoredLocalePreference()).toBeNull();
    expect(detectLocale()).toBe('en-US');

    getter.mockRestore();
  });

  it('returns translated text via t', () => {
    expect(t('zh-CN', 'transcription.toolbar.refresh')).toBe('刷新数据');
    expect(t('en-US', 'transcription.toolbar.refresh')).toBe('Refresh data');
    expect(t('zh-CN', 'transcription.toolbar.group.edit')).toBe('编辑');
    expect(t('en-US', 'transcription.toolbar.group.danger')).toBe('Danger');
  });

  it('interpolates placeholders via tf', () => {
    expect(tf('zh-CN', 'transcription.zoom.scale', { percent: 150 })).toBe('缩放：150%');
    expect(tf('en-US', 'transcription.action.audioImported', { filename: 'demo.wav' })).toBe('Media "demo.wav" imported successfully.');
  });

  it('surfaces missing tf() params with a bracket hint and warns in dev', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = tf('zh-CN', 'transcription.zoom.scale', {} as Record<string, string | number>);
    expect(out).toBe('缩放：[i18n missing: percent]%');
    if (import.meta.env.DEV) {
      expect(warnSpy).toHaveBeenCalled();
    }
    warnSpy.mockRestore();
  });
});
