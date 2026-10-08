/** pdfjs-dist v6+ asset URLs (served by Vite plugin in dev/build). */
export const PDFJS_STANDARD_FONT_URL = '/pdfjs-standard-fonts/';
export const PDFJS_WASM_URL = '/pdfjs-wasm/';

export type PdfJsDocumentParams = {
  url?: string;
  data?: Uint8Array;
  useWorkerFetch?: boolean;
};

/**
 * JY-14：固定 isEvalSupported:false，调用方不能覆盖。pdfjs-dist 6.x 已不再读取该参数，
 * 真正的修复是升级到 ≥6.2.108（GHSA-hq66-cqwq-w95j）；本项目也不渲染 pdf.js 注释层 / 脚本。
 * JY-14: pin isEvalSupported:false (callers cannot override). pdfjs-dist 6.x no longer reads the
 * flag; the actual fix is the ≥6.2.108 upgrade (GHSA-hq66-cqwq-w95j). The app renders no pdf.js
 * annotation layer / scripting.
 */
export function buildPdfJsDocumentParams(params: PdfJsDocumentParams): PdfJsDocumentParams & {
  standardFontDataUrl: string;
  wasmUrl: string;
  isEvalSupported: false;
} {
  return {
    ...params,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    wasmUrl: PDFJS_WASM_URL,
    isEvalSupported: false,
  };
}
