// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as languageCatalogService from '../services/LinguisticService.languageCatalog';
import { useLanguageMetadataCustomFieldController } from './languageMetadataWorkspace.customFieldController';
import type { LanguageMetadataDraft } from './languageMetadataWorkspace.shared';

function createDraft(customFieldValues: Record<string, string>): LanguageMetadataDraft {
  return {
    idInput: '',
    languageCode: '',
    canonicalTag: '',
    iso6391: '',
    iso6392B: '',
    iso6392T: '',
    iso6393: '',
    localName: '',
    englishName: '',
    nativeName: '',
    aliasesText: '',
    genus: '',
    subfamily: '',
    branch: '',
    classificationPath: '',
    macrolanguage: '',
    scope: '',
    languageType: '',
    endangermentLevel: '',
    aesStatus: '',
    endangermentSource: '',
    endangermentAssessmentYear: '',
    speakerCountL1: '',
    speakerCountL2: '',
    speakerCountSource: '',
    speakerCountYear: '',
    speakerTrend: '',
    countriesText: '',
    macroarea: '',
    administrativeDivisionsText: '',
    intergenerationalTransmission: '',
    domainsText: '',
    officialStatus: '',
    egids: '',
    documentationLevel: '',
    dialectsText: '',
    writingSystemsText: '',
    literacyRate: '',
    glottocode: '',
    wikidataId: '',
    visibility: 'visible',
    notesZh: '',
    notesEn: '',
    latitude: '',
    longitude: '',
    changeReason: '',
    vernacularsText: '',
    displayNameRows: [],
    displayNameHiddenRows: [],
    customFieldValues,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe('useLanguageMetadataCustomFieldController', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the latest custom field values after async field deletion resolves', async () => {
    const fieldDefinition = {
      id: 'field-a',
      name: { 'zh-CN': '字段 A' },
      fieldType: 'text' as const,
      sortOrder: 0,
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    };
    vi.spyOn(languageCatalogService, 'listCustomFieldDefinitions').mockResolvedValue([fieldDefinition]);
    const deletion = createDeferred<void>();
    vi.spyOn(languageCatalogService, 'deleteCustomFieldDefinition').mockImplementation(() => deletion.promise);

    const onDraftChange = vi.fn<(field: string, value: unknown) => void>();
    const { result, rerender } = renderHook(
      ({ draft }) => useLanguageMetadataCustomFieldController('zh-CN', draft, onDraftChange),
      {
        initialProps: {
          draft: createDraft({ 'field-a': 'remove-me', 'field-b': 'old-value' }),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.fieldDefs).toHaveLength(1);
    });

    act(() => {
      void result.current.handleDeleteFieldDef(fieldDefinition);
    });

    rerender({
      draft: createDraft({ 'field-a': 'remove-me', 'field-b': 'new-value' }),
    });

    await act(async () => {
      deletion.resolve();
      await deletion.promise;
    });

    expect(onDraftChange).toHaveBeenLastCalledWith('customFieldValues', { 'field-b': 'new-value' });
  });

  it('sanitizes incompatible constraints when switching field type', async () => {
    const fieldDefinition = {
      id: 'field-switch',
      name: { 'zh-CN': '评分字段' },
      fieldType: 'number' as const,
      minValue: 1,
      maxValue: 5,
      pattern: '^\\d+$',
      defaultValue: 3,
      sortOrder: 0,
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    };

    vi.spyOn(languageCatalogService, 'listCustomFieldDefinitions').mockResolvedValue([fieldDefinition]);
    const upsertSpy = vi.spyOn(languageCatalogService, 'upsertCustomFieldDefinition').mockResolvedValue({
      ...fieldDefinition,
      fieldType: 'select',
      options: ['单选 1'],
      updatedAt: '2026-04-07T00:10:00.000Z',
    });

    const onDraftChange = vi.fn<(field: string, value: unknown) => void>();
    const { result } = renderHook(() =>
      useLanguageMetadataCustomFieldController('zh-CN', createDraft({}), onDraftChange),
    );

    await waitFor(() => {
      expect(result.current.fieldDefs).toHaveLength(1);
    });

    await act(async () => {
      await result.current.handleFieldTypeChange(fieldDefinition, 'select');
    });

    const payload = upsertSpy.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      id: 'field-switch',
      fieldType: 'select',
      options: ['单选 1'],
      sortOrder: 0,
    });
    expect(payload).not.toHaveProperty('minValue');
    expect(payload).not.toHaveProperty('maxValue');
    expect(payload).not.toHaveProperty('pattern');
    expect(payload).not.toHaveProperty('defaultValue');
    expect(result.current.fieldDefs[0]?.fieldType).toBe('select');
    expect(result.current.fieldDefs[0]?.options).toEqual(['单选 1']);
  });
});