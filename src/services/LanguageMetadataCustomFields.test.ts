import { describe, expect, it } from 'vitest';
import { applyCustomFieldDraftDefaults, buildPersistedCustomFieldValues, validateCustomFieldDefinitionInput, validateCustomFieldDraftValue } from './LanguageMetadataCustomFields';

describe('LanguageMetadataCustomFields', () => {
  it('normalizes definition governance fields', () => {
    expect(validateCustomFieldDefinitionInput({
      name: { 'zh-CN': '  田野区域  ' },
      fieldType: 'multiselect',
      options: ['  四川 ', '云南', '四川'],
      required: true,
      defaultValue: ['云南'],
      helpText: { 'zh-CN': '  用于聚合地图筛选  ' },
      placeholder: { 'zh-CN': '  请选择区域  ' },
      sortOrder: 2,
    })).toEqual({
      name: { 'zh-CN': '田野区域' },
      fieldType: 'multiselect',
      options: ['四川', '云南'],
      required: true,
      defaultValue: ['云南'],
      helpText: { 'zh-CN': '用于聚合地图筛选' },
      placeholder: { 'zh-CN': '请选择区域' },
      sortOrder: 2,
    });
  });

  it('applies defaults only to empty draft values', () => {
    expect(applyCustomFieldDraftDefaults([
      {
        id: 'region',
        name: { 'zh-CN': '区域' },
        fieldType: 'text',
        defaultValue: '川西',
        sortOrder: 0,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
      {
        id: 'status',
        name: { 'zh-CN': '状态' },
        fieldType: 'boolean',
        defaultValue: true,
        sortOrder: 1,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ], {
      region: '',
      status: 'false',
    })).toEqual({
      region: '川西',
      status: 'false',
    });
  });

  it('validates persisted values against definition rules', () => {
    expect(buildPersistedCustomFieldValues({
      archiveUrl: 'https://example.com/archive',
      vitalityScore: '4',
    }, [
      {
        id: 'archiveUrl',
        name: { 'zh-CN': '档案链接' },
        fieldType: 'url',
        required: true,
        sortOrder: 0,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
      {
        id: 'vitalityScore',
        name: { 'zh-CN': '活力评分' },
        fieldType: 'number',
        minValue: 1,
        maxValue: 5,
        sortOrder: 1,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ], 'zh-CN')).toEqual({
      archiveUrl: 'https://example.com/archive',
      vitalityScore: 4,
    });
  });

  it('drops draft keys that no longer have active field definitions', () => {
    expect(buildPersistedCustomFieldValues({
      archiveUrl: 'https://example.com/archive',
      removedField: 'should-not-persist',
    }, [
      {
        id: 'archiveUrl',
        name: { 'zh-CN': '档案链接' },
        fieldType: 'url',
        required: true,
        sortOrder: 0,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ], 'zh-CN')).toEqual({
      archiveUrl: 'https://example.com/archive',
    });
  });

  it('returns localized validation errors for invalid draft values', () => {
    expect(validateCustomFieldDraftValue({
      id: 'orthography',
      name: { 'zh-CN': '正字法代码' },
      fieldType: 'text',
      required: true,
      pattern: '^[a-z]{3}$',
      sortOrder: 0,
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    }, 'AB', 'zh-CN')).toBe('正字法代码 不符合规则');
  });
});