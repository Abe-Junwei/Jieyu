import { describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import { buildLayerStyleMenuItems } from './LayerStyleSubmenu';

const NOW = new Date().toISOString();

const ORTHOGRAPHIES: OrthographyDocType[] = [{
  id: 'ortho-cmn',
  languageId: 'cmn',
  name: { zho: '汉字' },
  scriptTag: 'Hans',
  exemplarCharacters: {
    main: ['你', '好', '语'],
  },
  createdAt: NOW,
}];

describe('buildLayerStyleMenuItems local fonts', () => {
  it('filters local fonts by current layer language and prefers localized names', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-cmn',
      'cmn',
      'ortho-cmn',
      ORTHOGRAPHIES,
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        getCoverage: (fontFamily) => fontFamily === 'Noto Sans SC'
          ? { status: 'verified', sampleText: '你好语', source: 'cache' }
          : undefined,
        fonts: [
          {
            family: 'PingFang SC',
            fullNames: ['苹方-简 常规', 'PingFang SC Regular'],
            postscriptNames: ['PingFangSC-Regular'],
          },
          {
            family: 'Yu Gothic',
            fullNames: ['Yu Gothic Regular'],
            postscriptNames: ['YuGothic-Regular'],
          },
          {
            family: 'Arial',
            fullNames: ['Arial Regular'],
            postscriptNames: ['ArialMT'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.find((item) => item.label === '字体覆盖')?.meta).toBe('样例 3 项');
    expect(fontMenu?.children?.map((item) => item.label)).toEqual(expect.arrayContaining([
      expect.stringContaining('苹方-简 (PingFang SC)'),
    ]));
    expect(fontMenu?.children?.find((item) => item.label === 'Noto Sans SC')?.meta).toBe('推荐 · 已验证');
    expect(fontMenu?.children?.find((item) => item.label.includes('苹方-简 (PingFang SC)'))?.meta).toBe('脚本匹配');
    expect(fontMenu?.children?.some((item) => item.label.includes('Yu Gothic'))).toBe(false);
    expect(fontMenu?.children?.some((item) => item.label.includes('Arial'))).toBe(false);
  });

  it('shows missing-glyph risk when cached font verification fails', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-cmn',
      'cmn',
      'ortho-cmn',
      ORTHOGRAPHIES,
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        getCoverage: (fontFamily) => fontFamily === 'PingFang SC'
          ? { status: 'missing-glyphs', sampleText: '你好语', source: 'cache' }
          : undefined,
        fonts: [
          {
            family: 'PingFang SC',
            fullNames: ['苹方-简 常规', 'PingFang SC Regular'],
            postscriptNames: ['PingFangSC-Regular'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.find((item) => item.label.includes('苹方-简 (PingFang SC)'))?.meta).toBe('脚本匹配 · 缺字');
  });

  it('downgrades verified local Arabic fonts to shaping-risk instead of treating them as verified', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-ara',
      'ara',
      'ortho-ara',
      [{
        id: 'ortho-ara',
        languageId: 'ara',
        name: { zho: '阿拉伯语' },
        scriptTag: 'Arab',
        exemplarCharacters: {
          main: ['ا', 'ب', 'ت'],
        },
        createdAt: NOW,
      }],
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        getCoverage: (fontFamily) => fontFamily === 'Amiri'
          ? { status: 'verified', sampleText: 'ابت', source: 'cache' }
          : undefined,
        fonts: [
          {
            family: 'Amiri',
            fullNames: ['Amiri Regular'],
            postscriptNames: ['Amiri-Regular'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.find((item) => item.label.includes('Amiri'))?.meta).toBe('脚本匹配 · 高风险');
  });

  it('keeps unverified complex-script local fonts as script-matched until verification completes', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-ara',
      'ara',
      'ortho-ara',
      [{
        id: 'ortho-ara',
        languageId: 'ara',
        name: { zho: '阿拉伯语' },
        scriptTag: 'Arab',
        exemplarCharacters: {
          main: ['ا', 'ب', 'ت'],
        },
        createdAt: NOW,
      }],
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        getCoverage: () => undefined,
        fonts: [
          {
            family: 'Amiri',
            fullNames: ['Amiri Regular'],
            postscriptNames: ['Amiri-Regular'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.find((item) => item.label.includes('Amiri'))?.meta).toBe('脚本匹配');
  });

  it('shows an empty-state hint when no local fonts match the current language', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-cmn',
      'cmn',
      'ortho-cmn',
      ORTHOGRAPHIES,
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        fonts: [{
          family: 'Arial',
          fullNames: ['Arial Regular'],
          postscriptNames: ['ArialMT'],
        }],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.some((item) => item.label.includes('当前层语言无匹配本地字体') && item.disabled)).toBe(true);
  });

  it('adds a show-all toggle and search field for local fonts', () => {
    const setSearchQuery = vi.fn();
    const toggleShowAllFonts = vi.fn();

    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-cmn',
      'cmn',
      'ortho-cmn',
      ORTHOGRAPHIES,
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        showAllFonts: false,
        toggleShowAllFonts,
        getSearchQuery: (currentLayerId) => currentLayerId === 'layer-cmn' ? 'ping' : '',
        setSearchQuery,
        fonts: [
          {
            family: 'PingFang SC',
            fullNames: ['苹方-简 常规', 'PingFang SC Regular'],
            postscriptNames: ['PingFangSC-Regular'],
          },
          {
            family: 'Arial',
            fullNames: ['Arial Regular'],
            postscriptNames: ['ArialMT'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    const searchItem = fontMenu?.children?.find((item) => item.searchField);
    expect(searchItem?.searchField?.value).toBe('ping');
    searchItem?.searchField?.onChange('fang');
    expect(setSearchQuery).toHaveBeenCalledWith('layer-cmn', 'fang');

    const showAllItem = fontMenu?.children?.find((item) => item.label.includes('显示所有本地字体'));
    showAllItem?.onClick?.();
    expect(toggleShowAllFonts).toHaveBeenCalledTimes(1);

    const countItem = fontMenu?.children?.find((item) => item.label === '结果');
    expect(countItem?.meta).toBe('1 / 1');
  });

  it('shows all fonts when show-all mode is enabled', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-cmn',
      'cmn',
      'ortho-cmn',
      ORTHOGRAPHIES,
      vi.fn(),
      vi.fn(),
      {
        status: 'loaded',
        load: async () => undefined,
        showAllFonts: true,
        toggleShowAllFonts: vi.fn(),
        getSearchQuery: () => '',
        setSearchQuery: vi.fn(),
        fonts: [
          {
            family: 'PingFang SC',
            fullNames: ['苹方-简 常规', 'PingFang SC Regular'],
            postscriptNames: ['PingFangSC-Regular'],
          },
          {
            family: 'Arial',
            fullNames: ['Arial Regular'],
            postscriptNames: ['ArialMT'],
          },
        ],
      },
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.some((item) => item.label.includes('Arial'))).toBe(true);
    expect(fontMenu?.children?.find((item) => item.label.includes('Arial'))?.meta).toBe('风险高');
    const countItem = fontMenu?.children?.find((item) => item.label === '结果');
    expect(countItem?.meta).toBe('2 / 2');
  });

  it('uses the selected orthography to choose script-specific presets', () => {
    const items = buildLayerStyleMenuItems(
      undefined,
      'layer-kas',
      'kas',
      'ortho-kas-deva',
      [
        {
          id: 'ortho-kas-arab',
          languageId: 'kas',
          name: { zho: '克什米尔文（阿拉伯）' },
          scriptTag: 'Arab',
          createdAt: NOW,
        },
        {
          id: 'ortho-kas-deva',
          languageId: 'kas',
          name: { zho: '克什米尔文（天城）' },
          scriptTag: 'Deva',
          createdAt: NOW,
        },
      ],
      vi.fn(),
      vi.fn(),
    );

    const fontMenu = items.find((item) => item.label === '字体');
    expect(fontMenu?.children?.some((item) => item.label === 'Annapurna SIL')).toBe(true);
    expect(fontMenu?.children?.some((item) => item.label === 'Noto Sans Arabic')).toBe(false);
    expect(fontMenu?.children?.find((item) => item.label === '字体覆盖')?.meta).toBe('未配置样例');
  });
});