/**
 * 层显示样式子菜单构建器 | Layer display style submenu builder
 * 纯数据函数，返回 ContextMenuItem[] | Pure data function, returns ContextMenuItem[]
 */

import type { LayerDisplaySettings, OrthographyDocType } from '../db';
import type { Locale } from '../i18n';
import { getLayerStyleSubmenuMessages } from '../i18n/layerStyleSubmenuMessages';
import type { ContextMenuItem } from './ContextMenu';
import type { FontCoverageVerification, LocalFontEntry, OrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { BASE_FONT_SIZE, describeLocalFontCoverage, describePresetFontCoverage, filterLocalFontsForLanguage, formatLocalFontLabel, LAYER_FONT_SIZE_STEP, MAX_LAYER_FONT_SIZE, MIN_LAYER_FONT_SIZE, resolveOrthographyRenderPolicy } from '../utils/layerDisplayStyle';

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
  locale: Locale = 'zh-CN',
): ContextMenuItem[] {
  const messages = getLayerStyleSubmenuMessages(locale);
  const fontSizeOptions = Array.from(
    { length: Math.floor((MAX_LAYER_FONT_SIZE - MIN_LAYER_FONT_SIZE) / LAYER_FONT_SIZE_STEP) + 1 },
    (_, index) => {
      const value = MIN_LAYER_FONT_SIZE + index * LAYER_FONT_SIZE_STEP;
      return {
        label: value === BASE_FONT_SIZE ? messages.defaultFontSizeOption(value) : `${value}px`,
        value,
      };
    },
  );
  const renderPolicy = resolveOrthographyRenderPolicy(languageId, orthographies, orthographyId);
  const currentFont = current?.fontFamily ?? renderPolicy.defaultFontKey;
  const currentSize = current?.fontSize ?? BASE_FONT_SIZE;

  // 根据语言动态获取字体列表 | Dynamically get fonts based on language
  const fontPresets = renderPolicy.fontPresets;

  // 字体子菜单 | Font submenu
  const fontMenuItems: ContextMenuItem[] = [
    {
      label: messages.fontCoverage,
      meta: renderPolicy.coverageSummary.confidence === 'sample-backed'
        ? messages.fontCoverageSamples(renderPolicy.coverageSummary.exemplarCharacterCount)
        : messages.fontCoverageMissing,
      disabled: true,
    },
    ...fontPresets.map((preset) => ({
      label: preset.key,
      meta: describePresetFontCoverage(preset.key, renderPolicy, localFonts?.getCoverage?.(preset.key, renderPolicy)),
      selectionState: currentFont === preset.key ? 'selected' as const : 'unselected' as const,
      selectionVariant: 'check' as const,
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
        label: messages.findFonts,
        separatorBefore: true,
        searchField: {
          value: currentSearchQuery,
          placeholder: showAllFonts ? messages.searchAllLocalFonts : messages.searchCurrentLanguageFonts,
          onChange: (nextValue) => localFonts.setSearchQuery?.(layerId, nextValue),
        },
      });
      fontMenuItems.push({
        label: messages.showAllLocalFonts,
        selectionState: showAllFonts ? 'selected' : 'unselected',
        meta: showAllFonts
          ? messages.showAllEnabledMeta(localFonts.fonts.length)
          : messages.showAllFilteredMeta(visibleLocalFonts.length),
        keepOpen: true,
        onClick: () => localFonts.toggleShowAllFonts?.(),
      });
      fontMenuItems.push({
        label: messages.results,
        meta: `${searchedLocalFonts.length} / ${visibleLocalFonts.length}`,
        disabled: true,
      });
      let isFirst = true;
      for (const lf of searchedLocalFonts) {
        fontMenuItems.push({
          label: formatLocalFontLabel(lf, languageId, orthographies, orthographyId),
          meta: describeLocalFontCoverage(lf, renderPolicy, localFonts.getCoverage?.(lf.family, renderPolicy)),
          selectionState: currentFont === lf.family ? 'selected' as const : 'unselected' as const,
          selectionVariant: 'check' as const,
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
            ? messages.noMatchingLocalFonts
            : (showAllFonts ? messages.noAvailableLocalFonts : messages.noLanguageMatchedFonts),
          separatorBefore: isFirst,
          disabled: true,
        });
      }
    } else if (localFonts.status === 'idle' || localFonts.status === 'denied') {
      fontMenuItems.push({
        label: localFonts.status === 'denied' ? messages.localFontsDenied : messages.loadLocalFonts,
        icon: messages.localFontsIcon,
        separatorBefore: true,
        disabled: localFonts.status === 'denied',
        keepOpen: true,
        onClick: () => { void localFonts.load(); },
      });
    } else if (localFonts.status === 'loading') {
      fontMenuItems.push({ label: messages.loading, icon: messages.localFontsIcon, separatorBefore: true, disabled: true });
    }
  }

  return [
    {
      label: messages.fontMenu,
      children: fontMenuItems,
    },
    {
      label: messages.fontSizeMenu,
      children: fontSizeOptions.map((opt) => ({
        label: opt.label,
        selectionState: currentSize === opt.value ? 'selected' : 'unselected',
        selectionVariant: 'check',
        onClick: () => onUpdate({ fontSize: opt.value }),
      })),
    },
    {
      label: messages.bold,
      selectionState: current?.bold ? 'selected' : 'unselected',
      selectionVariant: 'dot',
      shortcut: '⌘B',
      onClick: () => onUpdate({ bold: !current?.bold }),
    },
    {
      label: messages.italic,
      selectionState: current?.italic ? 'selected' : 'unselected',
      selectionVariant: 'dot',
      shortcut: '⌘I',
      onClick: () => onUpdate({ italic: !current?.italic }),
    },
    {
      label: messages.resetStyle,
      separatorBefore: true,
      danger: true,
      onClick: onReset,
    },
  ];
}
