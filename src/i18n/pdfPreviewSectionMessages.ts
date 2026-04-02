import type { Locale } from './index';

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

const zhCN: PdfPreviewSectionMessages = {
  panelAriaLabel: '\u6587\u6863\u9884\u89c8\u9762\u677f',
  pageTag: (page) => `\u7b2c ${page} \u9875`,
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  enhancedHighlight: '\u589e\u5f3a\u9ad8\u4eae',
  openExternal: '\u65b0\u7a97\u53e3\u6253\u5f00',
  closePreviewAriaLabel: '\u5173\u95ed\u6587\u6863\u9884\u89c8',
  loadingPdf: '\u6587\u6863\u52a0\u8f7d\u4e2d...',
};

const enUS: PdfPreviewSectionMessages = {
  panelAriaLabel: 'PDF preview panel',
  pageTag: (page) => `Page ${page}`,
  prevPage: 'Prev',
  nextPage: 'Next',
  enhancedHighlight: 'Enhanced Highlight',
  openExternal: 'Open',
  closePreviewAriaLabel: 'Close PDF preview',
  loadingPdf: 'Loading PDF...',
};

export function getPdfPreviewSectionMessages(locale: Locale): PdfPreviewSectionMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
