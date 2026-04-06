import { describe, expect, it } from 'vitest';
import {
  createLanguageInputModel,
  reduceLanguageInput,
  selectCommittedLanguageInputValue,
  selectDisplayedLanguageInputValue,
} from './languageInputReducer';

const resolveInjectedLanguageDisplayName = (languageId: string | undefined) => {
  if (languageId?.trim().toLowerCase() === 'eng') {
    return '英语资产标签';
  }
  return languageId?.trim() ?? '';
};

describe('languageInputReducer', () => {
  it('invalidates a previously committed code when the name draft diverges', () => {
    const initial = createLanguageInputModel({ languageName: 'English', languageCode: 'eng' }, 'en-US');
    const next = reduceLanguageInput(initial, { type: 'nameChanged', value: 'P' }, 'en-US');

    expect(selectDisplayedLanguageInputValue(next)).toEqual({
      languageName: 'P',
      languageCode: '',
    });
    expect(selectCommittedLanguageInputValue(next)).toEqual({
      languageName: '',
      languageCode: '',
    });
    expect(next.status).toBe('suggesting');
  });

  it('commits an unambiguous language name match', () => {
    const initial = createLanguageInputModel({ languageName: '', languageCode: '' }, 'en-US');
    const next = reduceLanguageInput(initial, { type: 'nameChanged', value: 'Portuguese' }, 'en-US');

    expect(selectDisplayedLanguageInputValue(next)).toEqual({
      languageName: 'Portuguese',
      languageCode: 'por',
      languageAssetId: 'por',
      displayMode: 'input-first',
      preferredDisplayName: 'Portuguese',
      preferredDisplayKind: 'alias',
    });
    expect(selectCommittedLanguageInputValue(next)).toEqual({
      languageName: 'Portuguese',
      languageCode: 'por',
      languageAssetId: 'por',
      displayMode: 'input-first',
      preferredDisplayName: 'Portuguese',
      preferredDisplayKind: 'alias',
    });
    expect(next.status).toBe('selected');
  });

  it('keeps a two-letter code in deferred state until blur', () => {
    const initial = createLanguageInputModel({ languageName: '', languageCode: '' }, 'zh-CN');
    const deferred = reduceLanguageInput(initial, { type: 'codeChanged', value: 'en' }, 'zh-CN');

    expect(selectDisplayedLanguageInputValue(deferred)).toEqual({
      languageName: '',
      languageCode: 'en',
    });
    expect(selectCommittedLanguageInputValue(deferred)).toEqual({
      languageName: '',
      languageCode: '',
    });
    expect(deferred.status).toBe('deferred-code');

    const committed = reduceLanguageInput(deferred, { type: 'codeBlurred' }, 'zh-CN');
    expect(selectDisplayedLanguageInputValue(committed)).toEqual({
      languageName: '英语',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });
    expect(selectCommittedLanguageInputValue(committed)).toEqual({
      languageName: '英语',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });
    expect(committed.status).toBe('selected');
  });

  it('treats a one-letter code as in-progress and only marks invalid after blur', () => {
    const initial = createLanguageInputModel({ languageName: '', languageCode: '' }, 'zh-CN');
    const deferred = reduceLanguageInput(initial, { type: 'codeChanged', value: 'e' }, 'zh-CN');

    expect(selectDisplayedLanguageInputValue(deferred)).toEqual({
      languageName: '',
      languageCode: 'e',
    });
    expect(selectCommittedLanguageInputValue(deferred)).toEqual({
      languageName: '',
      languageCode: '',
    });
    expect(deferred.status).toBe('deferred-code');

    const blurred = reduceLanguageInput(deferred, { type: 'codeBlurred' }, 'zh-CN');
    expect(blurred.status).toBe('invalid');
    expect(blurred.draft.activeField).toBeNull();
  });

  it('commits a clicked suggestion with canonical values', () => {
    const initial = createLanguageInputModel({ languageName: '', languageCode: '' }, 'en-US');
    const suggesting = reduceLanguageInput(initial, { type: 'nameChanged', value: 'Chinese' }, 'en-US');
    const committed = reduceLanguageInput(suggesting, { type: 'nameSuggestionCommitted', index: 0, source: 'click' }, 'en-US');

    expect(selectCommittedLanguageInputValue(committed).languageCode).toBe('cmn');
    expect(selectDisplayedLanguageInputValue(committed).languageCode).toBe('cmn');
    expect(committed.status).toBe('selected');
  });

  it('does not let external sync overwrite a local deferred draft', () => {
    const initial = createLanguageInputModel({ languageName: '', languageCode: '' }, 'zh-CN');
    const deferred = reduceLanguageInput(initial, { type: 'codeChanged', value: 'en' }, 'zh-CN');
    const externallySynced = reduceLanguageInput(
      deferred,
      { type: 'externalValueSynced', value: { languageName: '英语', languageCode: 'eng' } },
      'zh-CN',
    );

    expect(selectDisplayedLanguageInputValue(externallySynced)).toEqual({
      languageName: '',
      languageCode: 'en',
    });
    expect(selectCommittedLanguageInputValue(externallySynced)).toEqual({
      languageName: '',
      languageCode: '',
    });
    expect(externallySynced.status).toBe('deferred-code');
  });

  it('relocalizes committed language names from code when rebuilt under a new locale', () => {
    const model = createLanguageInputModel({ languageName: '英语', languageCode: 'eng' }, 'en-US');

    expect(selectDisplayedLanguageInputValue(model)).toEqual({
      languageName: 'English',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });
    expect(selectCommittedLanguageInputValue(model)).toEqual({
      languageName: 'English',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });
    expect(model.status).toBe('selected');
  });

  it('uses an injected language display-name resolver when building committed values', () => {
    const model = createLanguageInputModel(
      { languageName: '英语', languageCode: 'eng' },
      'zh-CN',
      { resolveLanguageDisplayName: resolveInjectedLanguageDisplayName },
    );

    expect(selectDisplayedLanguageInputValue(model)).toEqual({
      languageName: '英语资产标签',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });

    const deferred = reduceLanguageInput(
      createLanguageInputModel({ languageName: '', languageCode: '' }, 'zh-CN', { resolveLanguageDisplayName: resolveInjectedLanguageDisplayName }),
      { type: 'codeChanged', value: 'en' },
      'zh-CN',
      { resolveLanguageDisplayName: resolveInjectedLanguageDisplayName },
    );
    const committed = reduceLanguageInput(deferred, { type: 'codeBlurred' }, 'zh-CN', { resolveLanguageDisplayName: resolveInjectedLanguageDisplayName });

    expect(selectCommittedLanguageInputValue(committed)).toEqual({
      languageName: '英语资产标签',
      languageCode: 'eng',
      languageAssetId: 'eng',
      displayMode: 'locale-first',
    });
  });
});