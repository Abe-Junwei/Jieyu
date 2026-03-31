/**
 * 层显示样式子菜单构建器 | Layer display style submenu builder
 * 纯数据函数，返回 ContextMenuItem[] | Pure data function, returns ContextMenuItem[]
 */

import type { LayerDisplaySettings, OrthographyDocType } from '../db';
import type { ContextMenuItem } from './ContextMenu';
import type { FontCoverageVerification, LocalFontEntry, OrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import {
  BASE_FONT_SIZE,
  describeLocalFontCoverage,
  describePresetFontCoverage,
  filterLocalFontsForLanguage,
  formatLocalFontLabel,
  LAYER_FONT_SIZE_STEP,
  MAX_LAYER_FONT_SIZE,
  MIN_LAYER_FONT_SIZE,
  resolveOrthographyRenderPolicy,
} from '../utils/layerDisplayStyle';

const FONT_SIZE_OPTIONS = Array.from(
  { length: Math.floor((MAX_LAYER_FONT_SIZE - MIN_LAYER_FONT_SIZE) / LAYER_FONT_SIZE_STEP) + 1 },
  (_, index) => {
    const value = MIN_LAYER_FONT_SIZE + index * LAYER_FONT_SIZE_STEP;
    return {
      label: value === BASE_FONT_SIZE ? `默认 (${value}px)` : `${value}px`,
      value,
    };
  },
);

/** 构建"显示样式"子菜单项 | Build "Display Style" submenu items */
export function buildLayerStyleMenuItems(
  current: LayerDisplaySettings | undefined,
  layerId: string,
  languageId: string,
  orthographyId: string | undefined,
  orthographies: OrthographyDocType[],
  onUpdate: (patch: Partial<LayerDisplaySettings>) => void,
  onReset: () => void,
  localFonts?: {
    fonts: LocalFontEntry[];
    status: 'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported';
    load: () => Promise<void>;
    showAllFonts?: boolean;
    toggleShowAllFonts?: () => void;
    getSearchQuery?: (layerId: string) => string;
    setSearchQuery?: (layerId: string, nextValue: string) => void;
    getCoverage?: (fontFamily: string, renderPolicy: OrthographyRenderPolicy) => FontCoverageVerification | undefined;
    ensureCoverage?: (fontFamily: string, renderPolicy: OrthographyRenderPolicy) => Promise<FontCoverageVerification | undefined>;
  },
): ContextMenuItem[] {
  const renderPolicy = resolveOrthographyRenderPolicy(languageId, orthographies, orthographyId);
  const currentFont = current?.fontFamily ?? renderPolicy.defaultFontKey;
  const currentSize = current?.fontSize ?? BASE_FONT_SIZE;

  // 根据语言动态获取字体列表 | Dynamically get fonts based on language
  const fontPresets = renderPolicy.fontPresets;

  // 字体子菜单 | Font submenu
  const fontMenuItems: ContextMenuItem[] = [
    {
      label: '字体覆盖',
      meta: renderPolicy.coverageSummary.confidence === 'sample-backed'
        ? `样例 ${renderPolicy.coverageSummary.exemplarCharacterCount} 项`
        : '未配置样例',
      disabled: true,
    },
    ...fontPresets.map((preset) => ({
      label: preset.key,
      meta: describePresetFontCoverage(preset.key, renderPolicy, localFonts?.getCoverage?.(preset.key, renderPolicy)),
      selectionState: currentFont === preset.key ? 'selected' : 'unselected',
      selectionVariant: 'check',
      onClick: () => {
        void localFonts?.ensureCoverage?.(preset.key, renderPolicy);
        onUpdate({ fontFamily: preset.key });
      },
    })),
  ];

  if (renderPolicy.coverageSummary.warning) {
    fontMenuItems.push({
      label: renderPolicy.coverageSummary.warning,
      disabled: true,
    });
  }

  // 本地字体（Chrome/Edge）| Local fonts (Chrome/Edge)
  if (localFonts && localFonts.status !== 'unsupported') {
    if (localFonts.status === 'loaded' && localFonts.fonts.length > 0) {
      const showAllFonts = localFonts.showAllFonts ?? false;
      const currentSearchQuery = localFonts.getSearchQuery?.(layerId) ?? '';
      const searchQuery = currentSearchQuery.trim().toLowerCase();
      const visibleLocalFonts = showAllFonts
        ? localFonts.fonts
        : filterLocalFontsForLanguage(localFonts.fonts, languageId, orthographies, orthographyId);
      const searchedLocalFonts = searchQuery.length > 0
        ? visibleLocalFonts.filter((font) => {
            const localizedLabel = formatLocalFontLabel(font, languageId, orthographies, orthographyId).toLowerCase();
            const englishLabel = font.family.toLowerCase();
            const fullNames = font.fullNames.join(' ').toLowerCase();
            const postscriptNames = font.postscriptNames.join(' ').toLowerCase();
            return localizedLabel.includes(searchQuery)
              || englishLabel.includes(searchQuery)
              || fullNames.includes(searchQuery)
              || postscriptNames.includes(searchQuery);
          })
        : visibleLocalFonts;
      fontMenuItems.push({
        label: '查找字体',
        separatorBefore: true,
        searchField: {
          value: currentSearchQuery,
          placeholder: showAllFonts ? '输入字体名，查找全部本地字体' : '输入字体名，查找当前语言字体',
          onChange: (nextValue) => localFonts.setSearchQuery?.(layerId, nextValue),
        },
      });
      fontMenuItems.push({
        label: '显示所有本地字体',
        selectionState: showAllFonts ? 'selected' : 'unselected',
        meta: showAllFonts ? `已开 · 全部 ${localFonts.fonts.length}` : `适配 ${visibleLocalFonts.length}`,
        keepOpen: true,
        onClick: () => localFonts.toggleShowAllFonts?.(),
      });
      fontMenuItems.push({
        label: '结果',
        meta: `${searchedLocalFonts.length} / ${visibleLocalFonts.length}`,
        disabled: true,
      });
      let isFirst = true;
      for (const lf of searchedLocalFonts) {
        fontMenuItems.push({
          label: formatLocalFontLabel(lf, languageId, orthographies, orthographyId),
          meta: describeLocalFontCoverage(lf, renderPolicy, localFonts.getCoverage?.(lf.family, renderPolicy)),
          selectionState: currentFont === lf.family ? 'selected' : 'unselected',
          selectionVariant: 'check',
          ...(isFirst ? { separatorBefore: true } : {}),
          onClick: () => {
            void localFonts.ensureCoverage?.(lf.family, renderPolicy);
            onUpdate({ fontFamily: lf.family });
          },
        });
        isFirst = false;
      }
      if (searchedLocalFonts.length === 0) {
        fontMenuItems.push({
          label: searchQuery.length > 0
            ? '未找到匹配的本地字体'
            : (showAllFonts ? '未发现可用本地字体' : '当前层语言无匹配本地字体'),
          separatorBefore: isFirst,
          disabled: true,
        });
      }
    } else if (localFonts.status === 'idle' || localFonts.status === 'denied') {
      fontMenuItems.push({
        label: localFonts.status === 'denied' ? '本地字体（权限被拒）' : '加载本地字体…',
        icon: '本',
        separatorBefore: true,
        disabled: localFonts.status === 'denied',
        keepOpen: true,
        onClick: () => { void localFonts.load(); },
      });
    } else if (localFonts.status === 'loading') {
      fontMenuItems.push({ label: '加载中…', icon: '本', separatorBefore: true, disabled: true });
    }
  }

  return [
    {
      label: '字体',
      children: fontMenuItems,
    },
    {
      label: '字号',
      children: FONT_SIZE_OPTIONS.map((opt) => ({
        label: opt.label,
        selectionState: currentSize === opt.value ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => onUpdate({ fontSize: opt.value }),
      })),
    },
    {
      label: '粗体',
      selectionState: current?.bold ? 'selected' : 'unselected',
      selectionVariant: 'dot',
      shortcut: '⌘B',
      onClick: () => onUpdate({ bold: !current?.bold }),
    },
    {
      label: '斜体',
      selectionState: current?.italic ? 'selected' : 'unselected',
      selectionVariant: 'dot',
      shortcut: '⌘I',
      onClick: () => onUpdate({ italic: !current?.italic }),
    },
    {
      label: '重置样式',
      separatorBefore: true,
      danger: true,
      onClick: onReset,
    },
  ];
}
