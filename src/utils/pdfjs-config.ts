/** pdfjs-dist v6+ asset URLs (served by Vite plugin in dev/build). */
export const PDFJS_STANDARD_FONT_URL = '/pdfjs-standard-fonts/';
export const PDFJS_WASM_URL = '/pdfjs-wasm/';

export type PdfJsDocumentParams = {
  url?: string;
  data?: Uint8Array;
  useWorkerFetch?: boolean;
};

export function buildPdfJsDocumentParams(params: PdfJsDocumentParams): PdfJsDocumentParams & {
  standardFontDataUrl: string;
  wasmUrl: string;
} {
  return {
    ...params,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    wasmUrl: PDFJS_WASM_URL,
  };
}
