type PdfJsRuntimeModule = typeof import('pdfjs-dist');

let pdfJsRuntimePromise: Promise<PdfJsRuntimeModule> | undefined;

export async function loadPdfJsRuntime(
  loadModule: () => Promise<PdfJsRuntimeModule> = () => import('pdfjs-dist'),
): Promise<PdfJsRuntimeModule> {
  if (!pdfJsRuntimePromise) {
    pdfJsRuntimePromise = loadModule()
      .then((runtime) => {
        runtime.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${runtime.version}/pdf.worker.min.js`;
        return runtime;
      })
      .catch((error) => {
        pdfJsRuntimePromise = undefined;
        throw error;
      });
  }

  return pdfJsRuntimePromise;
}