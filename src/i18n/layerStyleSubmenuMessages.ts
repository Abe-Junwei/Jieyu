import { normalizeLocale, t, tf, type Locale } from './index';

export type LayerStyleSubmenuMessages = {
  defaultFontSizeOption: (value: number) => string;
  fontCoverage: string;
  fontCoverageSamples: (count: number) => string;
  fontCoverageMissing: string;
  findFonts: string;
  searchAllLocalFonts: string;
  searchCurrentLanguageFonts: string;
  showAllLocalFonts: string;
  showAllEnabledMeta: (count: number) => string;
  showAllFilteredMeta: (count: number) => string;
  results: string;
  noMatchingLocalFonts: string;
  noAvailableLocalFonts: string;
  noLanguageMatchedFonts: string;
  localFontsDenied: string;
  loadLocalFonts: string;
  loading: string;
  localFontsIcon: string;
  fontMenu: string;
  fontSizeMenu: string;
  bold: string;
  italic: string;
  resetStyle: string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getLayerStyleSubmenuMessages(locale: Locale): LayerStyleSubmenuMessages {
  const l = dictLocale(locale);
  return {
    defaultFontSizeOption: (value) => tf(l, 'msg.layerStyle.defaultFontSizeOption', { value }),
    fontCoverage: t(l, 'msg.layerStyle.fontCoverage'),
    fontCoverageSamples: (count) => tf(l, 'msg.layerStyle.fontCoverageSamples', { count }),
    fontCoverageMissing: t(l, 'msg.layerStyle.fontCoverageMissing'),
    findFonts: t(l, 'msg.layerStyle.findFonts'),
    searchAllLocalFonts: t(l, 'msg.layerStyle.searchAllLocalFonts'),
    searchCurrentLanguageFonts: t(l, 'msg.layerStyle.searchCurrentLanguageFonts'),
    showAllLocalFonts: t(l, 'msg.layerStyle.showAllLocalFonts'),
    showAllEnabledMeta: (count) => tf(l, 'msg.layerStyle.showAllEnabledMeta', { count }),
    showAllFilteredMeta: (count) => tf(l, 'msg.layerStyle.showAllFilteredMeta', { count }),
    results: t(l, 'msg.layerStyle.results'),
    noMatchingLocalFonts: t(l, 'msg.layerStyle.noMatchingLocalFonts'),
    noAvailableLocalFonts: t(l, 'msg.layerStyle.noAvailableLocalFonts'),
    noLanguageMatchedFonts: t(l, 'msg.layerStyle.noLanguageMatchedFonts'),
    localFontsDenied: t(l, 'msg.layerStyle.localFontsDenied'),
    loadLocalFonts: t(l, 'msg.layerStyle.loadLocalFonts'),
    loading: t(l, 'msg.layerStyle.loading'),
    localFontsIcon: t(l, 'msg.layerStyle.localFontsIcon'),
    fontMenu: t(l, 'msg.layerStyle.fontMenu'),
    fontSizeMenu: t(l, 'msg.layerStyle.fontSizeMenu'),
    bold: t(l, 'msg.layerStyle.bold'),
    italic: t(l, 'msg.layerStyle.italic'),
    resetStyle: t(l, 'msg.layerStyle.resetStyle'),
  };
}
