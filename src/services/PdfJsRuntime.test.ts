import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedRuntime, runtimeState } = vi.hoisted(() => ({
  mockedRuntime: {
    version: '9.9.9',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
  },
  runtimeState: {
    importCount: 0,
  },
}));

vi.mock('pdfjs-dist', () => {
  runtimeState.importCount += 1;
  return mockedRuntime;
});

describe('PdfJsRuntime', () => {
  beforeEach(() => {
    runtimeState.importCount = 0;
    mockedRuntime.GlobalWorkerOptions.workerSrc = '';
    vi.resetModules();
  });

  it('loads pdfjs runtime once and configures worker src', async () => {
    const { loadPdfJsRuntime } = await import('./PdfJsRuntime');

    await Promise.all([
      loadPdfJsRuntime(),
      loadPdfJsRuntime(),
    ]);

    expect(runtimeState.importCount).toBe(1);
    expect(mockedRuntime.GlobalWorkerOptions.workerSrc).toBe('//cdnjs.cloudflare.com/ajax/libs/pdf.js/9.9.9/pdf.worker.min.js');
  });

  it('allows retry when loader fails once', async () => {
    const { loadPdfJsRuntime } = await import('./PdfJsRuntime');
    let attempts = 0;

    const flakyLoader = vi.fn(async (): Promise<typeof import('pdfjs-dist')> => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('chunk fetch failed');
      }
      return mockedRuntime as unknown as typeof import('pdfjs-dist');
    });

    await expect(loadPdfJsRuntime(flakyLoader)).rejects.toThrow('chunk fetch failed');
    await expect(loadPdfJsRuntime(flakyLoader)).resolves.toBe(mockedRuntime);

    expect(flakyLoader).toHaveBeenCalledTimes(2);
    expect(mockedRuntime.GlobalWorkerOptions.workerSrc).toBe('//cdnjs.cloudflare.com/ajax/libs/pdf.js/9.9.9/pdf.worker.min.js');
  });
});
