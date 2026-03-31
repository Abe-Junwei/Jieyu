// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import { useOrthographies } from './useOrthographies';

const { mockGetDb, mockToArray, mockAnyOf, mockWhere } = vi.hoisted(() => ({
  mockToArray: vi.fn<() => Promise<OrthographyDocType[]>>(async () => []),
  mockAnyOf: vi.fn<(languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> }>(),
  mockWhere: vi.fn<(field: string) => { anyOf: (languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> } }>(),
  mockGetDb: vi.fn<() => Promise<{ dexie: { orthographies: { where: (field: string) => { anyOf: (languageIds: string[]) => { toArray: () => Promise<OrthographyDocType[]> } } } } }>>(),
}));

vi.mock('../db', () => ({
  getDb: mockGetDb,
}));

describe('useOrthographies', () => {
  beforeEach(() => {
    mockToArray.mockReset();
    mockAnyOf.mockReset();
    mockWhere.mockReset();
    mockGetDb.mockReset();

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

  it('clears orthographies when there are no layer languages', async () => {
    const { result } = renderHook(() => useOrthographies([]));

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });

    expect(mockGetDb).not.toHaveBeenCalled();
  });
});