import { normalizeLocale, t, tf, type Locale } from './index';

export type PdfViewerPanelMessages = {
  viewerTitle: string;
  pageStatus: (current: number, total: number) => string;
  searchHit: string;
  searchHint: string;
  noSearchHint: string;
  prevPage: string;
  nextPage: string;
  loading: string;
  preparingRenderer: string;
};

export function getPdfViewerPanelMessages(locale: Locale): PdfViewerPanelMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    viewerTitle: t(normalizedLocale, 'pdf.viewer.title'),
    pageStatus: (current, total) => tf(normalizedLocale, 'pdf.viewer.pageStatus', {
      current,
      total: Math.max(total, 1),
    }),
    searchHit: t(normalizedLocale, 'pdf.viewer.searchHit'),
    searchHint: t(normalizedLocale, 'pdf.viewer.searchHint'),
    noSearchHint: t(normalizedLocale, 'pdf.viewer.noSearchHint'),
    prevPage: t(normalizedLocale, 'pdf.viewer.prevPage'),
    nextPage: t(normalizedLocale, 'pdf.viewer.nextPage'),
    loading: t(normalizedLocale, 'pdf.viewer.loading'),
    preparingRenderer: t(normalizedLocale, 'pdf.viewer.preparingRenderer'),
  };
}
