// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import { resetBuiltInOrthographyCatalogForTests } from '../data/builtInOrthographies';
import { useOrthographies } from './useOrthographies';

const { mockGetDb, mockToArray, mockAnyOf, mockWhere, mockFetch } = vi.hoisted(() => ({
  mockToArray: vi.fn<() => Promise<OrthographyDocType[]>>(async () => []),
  mockAnyOf: vi.fn<(languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> }>(),
  mockWhere: vi.fn<(field: string) => { anyOf: (languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> } }>(),
  mockGetDb: vi.fn<() => Promise<{ dexie: { orthographies: { where: (field: string) => { anyOf: (languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> } } } } }>>(),
  mockFetch: vi.fn(),
}));

vi.mock('../db', () => ({
  getDb: mockGetDb,
}));

describe('useOrthographies', () => {
  beforeEach(() => {
    resetBuiltInOrthographyCatalogForTests();
    mockToArray.mockReset();
    mockAnyOf.mockReset();
    mockWhere.mockReset();
    mockGetDb.mockReset();
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error('network disabled in test'));
    vi.stubGlobal('fetch', mockFetch);

    mockAnyOf.mockImplementation((languageIds: string[]) => {
      void languageIds;
      return { toArray: mockToArray };
    });
    mockWhere.mockImplementation((field: string) => {
      void field;
      return { anyOf: mockAnyOf };
    });
    mockGetDb.mockResolvedValue({
      dexie: {
        orthographies: {
          where: mockWhere,
        },
      },
    });
  });

  it('loads orthographies for current layer languages', async () => {
    const rows: OrthographyDocType[] = [
      {
        id: 'ortho-1',
        name: { 'zh-CN': 'IPA' },
        languageId: 'tha',
        type: 'phonetic',
        scriptTag: 'Thai',
        createdAt: '2026-03-31T00:00:00.000Z',
      },
    ];
    mockToArray.mockResolvedValue(rows);

    const { result } = renderHook(() => useOrthographies(['tha', 'bod']));

    await waitFor(() => {
      expect(result.current).toEqual(rows);
    });

    expect(mockWhere).toHaveBeenCalledWith('languageId');
    expect(mockAnyOf).toHaveBeenCalledWith(['bod', 'tha']);
  });

  it('merges reviewed built-in orthographies for supported top50 languages', async () => {
    mockToArray.mockResolvedValue([]);

    const { result } = renderHook(() => useOrthographies(['eng']));

    await waitFor(() => {
      expect(result.current.some((item) => item.id === 'eng-latn')).toBe(true);
      expect(result.current.some((item) => item.id === 'eng-ipa-latn')).toBe(true);
    });

    const englishStandard = result.current.find((item) => item.id === 'eng-latn');
    expect(englishStandard?.name.eng).toBe('English Standard Orthography');
    expect(englishStandard?.fontPreferences?.primary).toEqual(['Noto Sans', 'Noto Serif']);
    expect(englishStandard?.catalogMetadata).toEqual(expect.objectContaining({
      catalogSource: 'built-in-reviewed',
      reviewStatus: 'verified-primary',
      priority: 'primary',
    }));
  });

  it('expands mandarin orthography lookup to include zho catalog entries', async () => {
    mockToArray.mockResolvedValue([{
      id: 'zho-custom-user',
      languageId: 'zho',
      name: { zho: '中文自定义方案' },
      scriptTag: 'Hans',
      type: 'practical',
      catalogMetadata: { catalogSource: 'user' },
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    }]);

    const { result } = renderHook(() => useOrthographies(['cmn']));

    await waitFor(() => {
      expect(result.current.some((item) => item.id === 'zho-hans')).toBe(true);
      expect(result.current.some((item) => item.id === 'zho-custom-user')).toBe(true);
    });

    expect(mockAnyOf).toHaveBeenCalledWith(['cmn', 'zho']);
  });

  it('sorts user orthographies ahead of generated built-ins for non-top50 languages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        languages: [{
          iso6393: 'bod',
          languageLabel: 'Tibetan',
          orthographySeeds: [{
            id: 'bod-generated-test',
            labelEn: 'Tibetan Generated Test',
            scriptCode: 'Tibt',
            scriptName: 'Tibetan',
            priority: 'secondary',
            source: 'cldr-default',
            seedKind: 'script-derived',
          }],
        }],
      }),
    });
    mockToArray.mockResolvedValue([{
      id: 'bod-custom-user',
      languageId: 'bod',
      name: { eng: 'Tibetan Custom User' },
      scriptTag: 'Tibt',
      type: 'practical',
      catalogMetadata: { catalogSource: 'user' },
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z',
    }]);

    const { result } = renderHook(() => useOrthographies(['bod']));

    await waitFor(() => {
      expect(result.current.map((item) => item.id)).toEqual([
        'bod-custom-user',
        'bod-generated-test',
      ]);
    });

    expect(result.current[1]?.catalogMetadata).toEqual(expect.objectContaining({
      catalogSource: 'built-in-generated',
      reviewStatus: 'needs-review',
      priority: 'secondary',
    }));
  });

  it('clears orthographies when there are no layer languages', async () => {
    const { result } = renderHook(() => useOrthographies([]));

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });

    expect(mockGetDb).not.toHaveBeenCalled();
  });
});