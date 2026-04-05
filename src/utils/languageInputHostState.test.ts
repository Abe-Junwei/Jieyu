import { describe, expect, it } from 'vitest';
import {
  buildLanguageInputSeed,
  getDisplayedLanguageInputLabel,
  normalizeLanguageInputAssetId,
  normalizeLanguageInputCode,
  resolveLanguageHostSelection,
  syncLanguageInputWithExternalCode,
} from './languageInputHostState';

const resolveInjectedLanguageDisplayName = (languageId: string | undefined) => {
  if (languageId?.trim().toLowerCase() === 'eng') {
    return '英语资产标签';
  }
  if (languageId?.trim().toLowerCase() === 'zho') {
    return '中文资产标签';
  }
  return languageId?.trim() ?? '';
};

describe('languageInputHostState', () => {
  it('builds locale-aware language seeds', () => {
    expect(buildLanguageInputSeed('eng', 'zh-CN')).toEqual({ languageName: '英语', languageCode: 'eng', languageAssetId: 'eng' });
    expect(buildLanguageInputSeed('eng', 'en-US')).toEqual({ languageName: 'English', languageCode: 'eng', languageAssetId: 'eng' });
  });

  it('supports an injected language display-name resolver for seeds and sync', () => {
    expect(buildLanguageInputSeed('eng', 'zh-CN', resolveInjectedLanguageDisplayName)).toEqual({
      languageName: '英语资产标签',
      languageCode: 'eng',
      languageAssetId: 'eng',
    });

    expect(syncLanguageInputWithExternalCode(
      { languageName: '', languageCode: '' },
      'zho',
      'zh-CN',
      resolveInjectedLanguageDisplayName,
    )).toEqual({
      languageName: '中文资产标签',
      languageCode: 'zho',
      languageAssetId: 'zho',
    });
  });

  it('normalizes and formats displayed language labels', () => {
    expect(normalizeLanguageInputCode({ languageName: ' English ', languageCode: ' ENG ' })).toBe('eng');
    expect(normalizeLanguageInputAssetId({ languageName: ' English ', languageCode: ' ENG ', languageAssetId: ' user:english-custom ' })).toBe('user:english-custom');
    expect(getDisplayedLanguageInputLabel({ languageName: '', languageCode: 'eng' })).toBe('ENG');
  });

  it('preserves provisional two-letter drafts when syncing external code', () => {
    expect(syncLanguageInputWithExternalCode({ languageName: '', languageCode: '' }, 'en', 'zh-CN')).toEqual({
      languageName: '',
      languageCode: 'en',
      languageAssetId: 'en',
    });
  });

  it('clears stale locale tags when syncing to a plain language code or empty code', () => {
    const previousValue = {
      languageName: 'English',
      languageCode: 'eng',
      localeTag: 'en-US',
      scriptTag: 'Latn',
      regionTag: 'US',
      variantTag: 'oxendict',
    };

    expect(syncLanguageInputWithExternalCode(previousValue, 'zho', 'zh-CN')).toEqual({
      languageName: '中文',
      languageCode: 'zho',
      languageAssetId: 'zho',
    });

    expect(syncLanguageInputWithExternalCode(previousValue, '', 'zh-CN')).toEqual({
      languageName: '',
      languageCode: '',
    });
  });

  it('resolves known and custom language selections for host components', () => {
    expect(resolveLanguageHostSelection('eng', [{ code: 'eng' }])).toEqual({ languageId: 'eng', customLanguageId: '' });
    expect(resolveLanguageHostSelection('hak', [{ code: 'eng' }])).toEqual({ languageId: '__custom__', customLanguageId: 'hak' });
    expect(resolveLanguageHostSelection('user:hak-community', [{ code: 'eng' }])).toEqual({ languageId: 'user:hak-community', customLanguageId: '' });
  });
});