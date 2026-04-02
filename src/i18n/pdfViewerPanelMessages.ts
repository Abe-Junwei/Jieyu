import type { Locale } from './index';

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

const zhCN: PdfViewerPanelMessages = {
  viewerTitle: '\u6587\u6863\u67e5\u770b\u5668',
  pageStatus: (current, total) => `\u7b2c ${current} / ${Math.max(total, 1)} \u9875`,
  searchHit: '\u5b9a\u4f4d\u7247\u6bb5',
  searchHint: '\u5df2\u6839\u636e\u5f53\u524d\u5f15\u7528\u4f20\u5165\u9ad8\u4eae\u7ebf\u7d22\u3002',
  noSearchHint: '\u672a\u4f20\u5165\u68c0\u7d22\u7247\u6bb5\uff0c\u53ef\u76f4\u63a5\u7ffb\u9605\u539f\u59cb PDF\u3002',
  prevPage: '\u4e0a\u4e00\u9875',
  nextPage: '\u4e0b\u4e00\u9875',
  loading: '\u52a0\u8f7d\u4e2d...',
  preparingRenderer: '\u51c6\u5907\u6e32\u67d3\u5668...',
};

const enUS: PdfViewerPanelMessages = {
  viewerTitle: 'Document Viewer',
  pageStatus: (current, total) => `Page ${current} / ${Math.max(total, 1)}`,
  searchHit: 'Snippet focus',
  searchHint: 'Highlight context is available for the current citation snippet.',
  noSearchHint: 'No snippet was passed in. Browse the source PDF directly.',
  prevPage: 'Prev',
  nextPage: 'Next',
  loading: 'Loading...',
  preparingRenderer: 'Preparing renderer...',
};

export function getPdfViewerPanelMessages(locale: Locale): PdfViewerPanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
