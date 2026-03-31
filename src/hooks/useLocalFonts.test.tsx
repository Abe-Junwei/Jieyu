// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalFonts } from './useLocalFonts';
import { clearFontCoverageVerificationCache, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';

const NOW = '2026-03-31T00:00:00.000Z';

beforeEach(() => {
  clearFontCoverageVerificationCache();
  const mockFonts = {
    check: vi.fn(() => true),
    load: vi.fn(async () => []),
  };
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: mockFonts,
  });
  window.localStorage.clear();
});

describe('useLocalFonts', () => {
  it('stores font search queries per layer', () => {
    const { result } = renderHook(() => useLocalFonts());

    act(() => {
      result.current.setSearchQuery('layer-a', 'ping');
      result.current.setSearchQuery('layer-b', 'yu');
    });

    expect(result.current.getSearchQuery('layer-a')).toBe('ping');
    expect(result.current.getSearchQuery('layer-b')).toBe('yu');

    act(() => {
      result.current.setSearchQuery('layer-a', '');
    });

    expect(result.current.getSearchQuery('layer-a')).toBe('');
    expect(result.current.getSearchQuery('layer-b')).toBe('yu');
  });

  it('toggles show-all mode independently from search queries', () => {
    const { result } = renderHook(() => useLocalFonts());

    act(() => {
      result.current.setSearchQuery('layer-a', 'ping');
      result.current.toggleShowAllFonts();
    });

    expect(result.current.showAllFonts).toBe(true);
    expect(result.current.getSearchQuery('layer-a')).toBe('ping');
  });

  it('caches font coverage checks by font family and render policy', async () => {
    const renderPolicy = resolveOrthographyRenderPolicy('ara', [{
      id: 'orth-ara',
      languageId: 'ara',
      name: { zho: '阿拉伯语' },
      scriptTag: 'Arab',
      exemplarCharacters: { main: ['ا', 'ب', 'ت'] },
      createdAt: NOW,
    }], 'orth-ara');
    const { result } = renderHook(() => useLocalFonts());

    await act(async () => {
      await result.current.ensureCoverage('Scheherazade New', renderPolicy);
      await result.current.ensureCoverage('Scheherazade New', renderPolicy);
    });

    expect(document.fonts.load).toHaveBeenCalledTimes(1);
    expect(document.fonts.check).toHaveBeenCalledTimes(1);
    expect(result.current.getCoverage('Scheherazade New', renderPolicy)).toEqual(expect.objectContaining({
      status: 'verified',
    }));
  });
});