import { describe, expect, it } from 'vitest';
import { extractPdfDetailsPatch, extractPdfTextFragments, extractPdfTextFragmentsFromSource, splitPdfFragmentsToChunks } from './pdfTextUtils';

describe('pdfTextUtils', () => {
  it('extracts fragments from structured details fields', () => {
    const fragments = extractPdfTextFragments({
      extractedText: 'summary block',
      pages: [
        { page: 1, text: 'page one content' },
        { pageNumber: 2, content: 'page two content' },
      ],
    });

    expect(fragments.length).toBe(3);
    expect(fragments[1]).toEqual({ page: 1, text: 'page one content' });
    expect(fragments[2]).toEqual({ page: 2, text: 'page two content' });
  });

  it('splits long fragments into multiple chunks with overlap', () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const chunks = splitPdfFragmentsToChunks([{ page: 1, text }], 80, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 1)).toBe(true);
  });

  it('falls back to source parser when no text fields exist', async () => {
    const fakeBlob = new Blob(['fake pdf'], { type: 'application/pdf' });
    const fragments = await extractPdfTextFragmentsFromSource(
      { pdfBlob: fakeBlob },
      async () => [
        { page: 1, text: 'first page text' },
        { page: 2, text: 'second page text' },
      ],
    );

    expect(fragments).toEqual([
      { page: 1, text: 'first page text' },
      { page: 2, text: 'second page text' },
    ]);
  });

  it('builds details patch from parsed page fragments', async () => {
    const fakeBlob = new Blob(['fake pdf'], { type: 'application/pdf' });
    const patch = await extractPdfDetailsPatch(
      { pdfBlob: fakeBlob },
      async () => [
        { page: 1, text: 'intro' },
        { page: 2, text: 'chapter body' },
      ],
    );

    expect(patch).not.toBeNull();
    expect(patch?.extractor).toBe('pdfjs-dist');
    expect(patch?.pages.length).toBe(2);
    expect(patch?.extractedText).toContain('intro');
    expect(patch?.extractedText).toContain('chapter body');
  });
});
