import { normalizeLocale, t, tf, type Locale } from './index';

export type PdfPreviewSectionMessages = {
  panelAriaLabel: string;
  pageTag: (page: number) => string;
  prevPage: string;
  nextPage: string;
  enhancedHighlight: string;
  openExternal: string;
  closePreviewAriaLabel: string;
  loadingPdf: string;
};

export function getPdfPreviewSectionMessages(locale: Locale): PdfPreviewSectionMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    panelAriaLabel: t(normalizedLocale, 'pdf.preview.section.panelAriaLabel'),
    pageTag: (page) => tf(normalizedLocale, 'pdf.preview.section.pageTag', { page }),
    prevPage: t(normalizedLocale, 'pdf.preview.section.prevPage'),
    nextPage: t(normalizedLocale, 'pdf.preview.section.nextPage'),
    enhancedHighlight: t(normalizedLocale, 'pdf.preview.section.enhancedHighlight'),
    openExternal: t(normalizedLocale, 'pdf.preview.section.openExternal'),
    closePreviewAriaLabel: t(normalizedLocale, 'pdf.preview.section.closePreviewAriaLabel'),
    loadingPdf: t(normalizedLocale, 'pdf.preview.section.loadingPdf'),
  };
}
