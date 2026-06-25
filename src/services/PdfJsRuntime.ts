import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfJsRuntimeModule = typeof import('pdfjs-dist');

let pdfJsRuntimePromise: Promise<PdfJsRuntimeModule> | undefined;

export const pdfJsWorkerSrc = pdfWorkerSrc;

export async function loadPdfJsRuntime(
  loadModule: () => Promise<PdfJsRuntimeModule> = () => import('pdfjs-dist'),
): Promise<PdfJsRuntimeModule> {
  if (!pdfJsRuntimePromise) {
    pdfJsRuntimePromise = loadModule()
      .then((runtime) => {
        runtime.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        return runtime;
      })
      .catch((error) => {
        pdfJsRuntimePromise = undefined;
        throw error;
      });
  }

  return pdfJsRuntimePromise;
}
