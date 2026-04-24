import { normalizeLocale, t, tf, type Locale } from './index';

export type SearchReplaceOverlayMessages = {
  searchPlaceholder: string;
  noResults: string;
  previousTitle: string;
  nextTitle: string;
  toggleReplaceTitle: string;
  closeTitle: string;
  scopeTitle: string;
  scopeCurrentLayer: string;
  scopeCurrentUnit: string;
  scopeGlobal: string;
  layerKindTitle: string;
  layerKindAll: string;
  layerKindTranscription: string;
  layerKindTranslation: string;
  layerKindGloss: string;
  caseSensitive: string;
  wholeWord: string;
  regexMode: string;
  replacePlaceholder: string;
  replaceCurrentTitle: string;
  replaceCurrent: string;
  previewAllReplaceTitle: string;
  preview: string;
  replacePlanTitle: (count: number) => string;
  originalText: string;
  replacedText: string;
  cancelPreviewTitle: string;
  cancel: string;
  confirmReplaceAllTitle: string;
  confirmReplace: string;
  clippedEllipsis: string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getSearchReplaceOverlayMessages(locale: Locale): SearchReplaceOverlayMessages {
  const l = dictLocale(locale);
  return {
    searchPlaceholder: t(l, 'msg.searchReplace.searchPlaceholder'),
    noResults: t(l, 'msg.searchReplace.noResults'),
    previousTitle: t(l, 'msg.searchReplace.previousTitle'),
    nextTitle: t(l, 'msg.searchReplace.nextTitle'),
    toggleReplaceTitle: t(l, 'msg.searchReplace.toggleReplaceTitle'),
    closeTitle: t(l, 'msg.searchReplace.closeTitle'),
    scopeTitle: t(l, 'msg.searchReplace.scopeTitle'),
    scopeCurrentLayer: t(l, 'msg.searchReplace.scopeCurrentLayer'),
    scopeCurrentUnit: t(l, 'msg.searchReplace.scopeCurrentUnit'),
    scopeGlobal: t(l, 'msg.searchReplace.scopeGlobal'),
    layerKindTitle: t(l, 'msg.searchReplace.layerKindTitle'),
    layerKindAll: t(l, 'msg.searchReplace.layerKindAll'),
    layerKindTranscription: t(l, 'msg.searchReplace.layerKindTranscription'),
    layerKindTranslation: t(l, 'msg.searchReplace.layerKindTranslation'),
    layerKindGloss: t(l, 'msg.searchReplace.layerKindGloss'),
    caseSensitive: t(l, 'msg.searchReplace.caseSensitive'),
    wholeWord: t(l, 'msg.searchReplace.wholeWord'),
    regexMode: t(l, 'msg.searchReplace.regexMode'),
    replacePlaceholder: t(l, 'msg.searchReplace.replacePlaceholder'),
    replaceCurrentTitle: t(l, 'msg.searchReplace.replaceCurrentTitle'),
    replaceCurrent: t(l, 'msg.searchReplace.replaceCurrent'),
    previewAllReplaceTitle: t(l, 'msg.searchReplace.previewAllReplaceTitle'),
    preview: t(l, 'msg.searchReplace.preview'),
    replacePlanTitle: (count) => tf(l, 'msg.searchReplace.replacePlanTitle', { count }),
    originalText: t(l, 'msg.searchReplace.originalText'),
    replacedText: t(l, 'msg.searchReplace.replacedText'),
    cancelPreviewTitle: t(l, 'msg.searchReplace.cancelPreviewTitle'),
    cancel: t(l, 'msg.searchReplace.cancel'),
    confirmReplaceAllTitle: t(l, 'msg.searchReplace.confirmReplaceAllTitle'),
    confirmReplace: t(l, 'msg.searchReplace.confirmReplace'),
    clippedEllipsis: t(l, 'msg.searchReplace.clippedEllipsis'),
  };
}
