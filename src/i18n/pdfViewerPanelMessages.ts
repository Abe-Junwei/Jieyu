import type { Locale } from './index';

export type PdfViewerPanelMessages = {
  prevPage: string;
  nextPage: string;
  loading: string;
  preparingRenderer: string;
};

const zhCN: PdfViewerPanelMessages = {
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  loading: '\u52a0\u8f7d\u4e2d...',
  preparingRenderer: '\u51c6\u5907\u6e32\u67d3\u5668...',
};

const enUS: PdfViewerPanelMessages = {
  prevPage: 'Prev',
  nextPage: 'Next',
  loading: 'Loading...',
  preparingRenderer: 'Preparing renderer...',
};

export function getPdfViewerPanelMessages(locale: Locale): PdfViewerPanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
