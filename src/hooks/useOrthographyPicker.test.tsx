// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import { createLocaleWrapper } from '../test/localeTestUtils';
import { groupOrthographiesForSelect, useOrthographyPicker } from './useOrthographyPicker';

const { mockCreateOrthography, mockCloneOrthographyToLanguage, mockCreateOrthographyBridge, mockUseOrthographies } = vi.hoisted(() => ({
  mockCreateOrthography: vi.fn(),
  mockCloneOrthographyToLanguage: vi.fn(),
  mockCreateOrthographyBridge: vi.fn(),
  mockUseOrthographies: vi.fn(),
}));

vi.mock('../services/LinguisticService.orthography', () => ({
  createOrthographyRecord: mockCreateOrthography,
  cloneOrthographyRecordToLanguage: mockCloneOrthographyToLanguage,
  createOrthographyBridgeRecord: mockCreateOrthographyBridge,
}));

vi.mock('./useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

describe('useOrthographyPicker render warnings', () => {
  beforeEach(() => {
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyBridge.mockReset();
    mockUseOrthographies.mockReset();
    mockUseOrthographies.mockReturnValue([] as OrthographyDocType[]);
  });

  it('requires an explicit second submit when render warnings exist', async () => {
    mockCreateOrthography.mockResolvedValue({
      id: 'ortho-eng-ipa',
      languageId: 'eng',
      name: { zho: 'English IPA', eng: 'English IPA' },
      abbreviation: 'IPA',
      scriptTag: 'Latn',
      type: 'phonetic',
      createdAt: '2026-03-31T00:00:00.000Z',
      updatedAt: '2026-03-31T00:00:00.000Z',
    });

    const onChange = vi.fn();
    const { result } = renderHook(() => useOrthographyPicker('eng', '', onChange));

    await waitFor(() => {
      expect(result.current.draftRenderWarnings.length).toBeGreaterThan(0);
      expect(result.current.requiresRenderWarningConfirmation).toBe(true);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCreateOrthography).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(true);
      expect(result.current.requiresRenderWarningConfirmation).toBe(false);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCreateOrthography).toHaveBeenCalledWith(expect.objectContaining({
      languageId: 'eng',
      abbreviation: 'IPA',
      scriptTag: 'Latn',
    }));
    expect(onChange).toHaveBeenCalledWith('ortho-eng-ipa');
  });

  it('clears the confirmation state after warning-related fields change', async () => {
    const { result } = renderHook(() => useOrthographyPicker('urd', '', vi.fn()));

    await waitFor(() => {
      expect(result.current.draftRenderWarnings.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(true);
    });

    act(() => {
      result.current.setDraftExemplarMain('ا, ب, ت');
    });

    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(false);
    });
  });

  it('keeps the created orthography selected when bridge creation fails afterward', async () => {
    const sourceOrthography: OrthographyDocType = {
      id: 'ortho-source',
      languageId: 'eng',
      name: { eng: 'Source orthography' },
      abbreviation: 'SRC',
      scriptTag: 'Latn',
      type: 'practical',
      exemplarCharacters: { main: ['a', 'b'] },
      direction: 'ltr',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    };
    const createdOrthography: OrthographyDocType = {
      id: 'ortho-created',
      languageId: 'eng',
      name: { eng: 'Created orthography' },
      abbreviation: 'NEW',
      scriptTag: 'Latn',
      type: 'practical',
      exemplarCharacters: { main: ['a', 'b'] },
      direction: 'ltr',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    };
    mockUseOrthographies.mockReturnValue([sourceOrthography]);
    mockCloneOrthographyToLanguage.mockResolvedValue(createdOrthography);
    mockCreateOrthographyBridge.mockRejectedValue(new Error('bridge exploded'));

    const onChange = vi.fn();
    const { result } = renderHook(() => useOrthographyPicker('eng', '', onChange));

    act(() => {
      result.current.handleSelectionChange('__create_new_orthography__');
      result.current.setCreateMode('copy-current');
    });

    await waitFor(() => {
      expect(result.current.sourceOrthographyId).toBe('ortho-source');
    });

    act(() => {
      result.current.setBridgeEnabled(true);
      result.current.setDraftVariantTag('fonipa');
      result.current.setDraftBridgeRuleText('aa -> a');
    });

    let created: OrthographyDocType | undefined;
    await act(async () => {
      created = await result.current.createOrthography();
    });

    expect(created).toEqual(createdOrthography);
    expect(mockCloneOrthographyToLanguage).toHaveBeenCalledWith(expect.objectContaining({
      sourceOrthographyId: 'ortho-source',
      targetLanguageId: 'eng',
      variantTag: 'fonipa',
    }));
    expect(mockCreateOrthographyBridge).toHaveBeenCalledWith(expect.objectContaining({
      sourceOrthographyId: 'ortho-source',
      targetOrthographyId: 'ortho-created',
    }));
    expect(onChange).toHaveBeenCalledWith('ortho-created');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toContain('Orthography created, but bridge creation failed');
    expect(result.current.orthographies.some((item) => item.id === 'ortho-created')).toBe(true);
  });

  it('blocks creating a duplicate orthography identity that already exists in the merged catalog', async () => {
    const sourceOrthography: OrthographyDocType = {
      id: 'eng-latn',
      languageId: 'eng',
      name: { eng: 'English Standard Orthography' },
      scriptTag: 'Latn',
      type: 'practical',
      exemplarCharacters: { main: ['a', 'e', 'i'] },
      fontPreferences: { primary: ['Noto Sans'] },
      direction: 'ltr',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    };
    mockUseOrthographies.mockReturnValue([sourceOrthography]);

    const { result } = renderHook(() => useOrthographyPicker('eng', '', vi.fn()));

    act(() => {
      result.current.handleSelectionChange('__create_new_orthography__');
      result.current.setCreateMode('copy-current');
    });

    await waitFor(() => {
      expect(result.current.sourceOrthographyId).toBe('eng-latn');
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCloneOrthographyToLanguage).not.toHaveBeenCalled();
    expect(result.current.error).toContain('已存在相同身份的正字法');
  });

  it('formats duplicate orthography errors with the active locale label', async () => {
    const sourceOrthography: OrthographyDocType = {
      id: 'eng-latn',
      languageId: 'eng',
      name: { zho: '英语标准正字法', eng: 'English Standard Orthography' },
      scriptTag: 'Latn',
      type: 'practical',
      exemplarCharacters: { main: ['a', 'e', 'i'] },
      direction: 'ltr',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    };
    mockUseOrthographies.mockReturnValue([sourceOrthography]);

    const { result } = renderHook(
      () => useOrthographyPicker('eng', '', vi.fn()),
      { wrapper: createLocaleWrapper('zh-CN') },
    );

    act(() => {
      result.current.handleSelectionChange('__create_new_orthography__');
      result.current.setCreateMode('copy-current');
    });

    await waitFor(() => {
      expect(result.current.sourceOrthographyId).toBe('eng-latn');
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCloneOrthographyToLanguage).not.toHaveBeenCalled();
    expect(result.current.error).toContain('已存在相同身份的正字法：英语标准正字法');
    expect(result.current.error).not.toContain('English Standard Orthography');
  });

  it('groups orthographies into explicit catalog sections', () => {
    const groups = groupOrthographiesForSelect([
      {
        id: 'user-1',
        languageId: 'eng',
        name: { eng: 'User' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        catalogMetadata: { catalogSource: 'user' },
      },
      {
        id: 'reviewed-primary',
        languageId: 'eng',
        name: { eng: 'Reviewed Primary' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
      },
      {
        id: 'reviewed-secondary',
        languageId: 'eng',
        name: { eng: 'Reviewed Secondary' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-secondary', priority: 'secondary' },
      },
      {
        id: 'generated-review',
        languageId: 'eng',
        name: { eng: 'Needs Review' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        catalogMetadata: { catalogSource: 'built-in-generated', reviewStatus: 'needs-review', priority: 'secondary' },
      },
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      'user',
      'reviewed-primary',
      'reviewed-secondary',
      'needs-review',
    ]);
    expect(groups[0]?.orthographies.map((item) => item.id)).toEqual(['user-1']);
    expect(groups[3]?.orthographies.map((item) => item.id)).toEqual(['generated-review']);
  });

  it('preserves custom source language asset ids without truncating to three letters', async () => {
    const sourceOrthography: OrthographyDocType = {
      id: 'eng-source',
      languageId: 'user:eng-community',
      name: { eng: 'English Source' },
      scriptTag: 'Latn',
      type: 'practical',
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    };
    mockUseOrthographies.mockImplementation((languageIds: string[]) => (
      languageIds.includes('user:eng-community') ? [sourceOrthography] : []
    ));

    const { result } = renderHook(() => useOrthographyPicker('cmn', '', vi.fn()));

    act(() => {
      result.current.handleSelectionChange('__create_new_orthography__');
      result.current.setCreateMode('derive-other');
      result.current.setSourceLanguageId('__custom__');
      result.current.setSourceCustomLanguageId('User:Eng Community');
    });

    await waitFor(() => {
      expect(result.current.sourceCustomLanguageId).toBe('user:eng-community');
      expect(result.current.sourceOrthographies.map((item) => item.id)).toEqual(['eng-source']);
    });
  });
});
