import type { MediaItemDocType } from '../../../db';

export type PdfTextFragment = {
  text: string;
  page: number | null;
};

export type PdfChunk = {
  text: string;
  page: number | null;
  chunk: number;
};

export type PdfParsePage = {
  page: number;
  text: string;
};

export type PdfDetailsPatch = {
  extractedText: string;
  pages: Array<{ page: number; text: string }>;
  extractor: 'pdfjs-dist';
  extractedAt: string;
};

type PdfParseDataFn = (data: Uint8Array) => Promise<PdfParsePage[]>;

function nowIso(): string {
  return new Date().toISOString();
}

export function isPdfMediaItem(item: Pick<MediaItemDocType, 'filename' | 'details'>): boolean {
  const details = item.details as Record<string, unknown> | undefined;
  const mime = typeof details?.mimeType === 'string' ? details.mimeType.toLowerCase() : '';
  return item.filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf');
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function parsePageNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Math.max(1, Number.parseInt(value.trim(), 10));
  }
  return null;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return normalizeText(value);
  return '';
}

async function defaultParsePdfData(data: Uint8Array): Promise<PdfParsePage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false });
  const document = await loadingTask.promise;
  const pages: PdfParsePage[] = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = normalizeText(
      content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' '),
    );
    if (text) {
      pages.push({ page: pageIndex, text });
    }
  }

  return pages;
}

async function loadPdfBinary(details: Record<string, unknown> | undefined): Promise<Uint8Array | null> {
  if (!details) return null;

  const pdfBlob = details.pdfBlob;
  if (pdfBlob instanceof Blob) {
    return new Uint8Array(await pdfBlob.arrayBuffer());
  }

  const detailUrl = typeof details.url === 'string' ? details.url.trim() : '';
  if (detailUrl) {
    const response = await fetch(detailUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  return null;
}

export function extractPdfTextFragments(details: Record<string, unknown> | undefined): PdfTextFragment[] {
  if (!details) return [];

  const fragments: PdfTextFragment[] = [];
  const topLevelCandidates = ['extractedText', 'pdfText', 'text'];
  for (const key of topLevelCandidates) {
    const text = textFromUnknown(details[key]);
    if (text) {
      fragments.push({ text, page: null });
    }
  }

  const structuredCandidates = ['pages', 'chunks'];
  for (const key of structuredCandidates) {
    const raw = details[key];
    if (!Array.isArray(raw)) continue;

    for (const entry of raw) {
      if (typeof entry === 'string') {
        const text = normalizeText(entry);
        if (text) fragments.push({ text, page: null });
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;

      const record = entry as Record<string, unknown>;
      const text = textFromUnknown(record.text ?? record.content ?? record.rawText);
      if (!text) continue;
      const page = parsePageNumber(record.page ?? record.pageNumber ?? record.index);
      fragments.push({ text, page });
    }
  }

  return fragments;
}

export async function extractPdfTextFragmentsFromSource(
  details: Record<string, unknown> | undefined,
  parsePdfData: PdfParseDataFn = defaultParsePdfData,
): Promise<PdfTextFragment[]> {
  const existing = extractPdfTextFragments(details);
  if (existing.length > 0) return existing;

  const binary = await loadPdfBinary(details);
  if (!binary) return [];

  const pages = await parsePdfData(binary);
  return pages
    .map((page) => ({ page: page.page, text: normalizeText(page.text) }))
    .filter((page) => page.text.length > 0);
}

export async function extractPdfDetailsPatch(
  details: Record<string, unknown> | undefined,
  parsePdfData: PdfParseDataFn = defaultParsePdfData,
): Promise<PdfDetailsPatch | null> {
  const fragments = await extractPdfTextFragmentsFromSource(details, parsePdfData);
  if (fragments.length === 0) return null;

  return {
    extractedText: fragments.map((item) => item.text).join('\n\n'),
    pages: fragments
      .filter((item) => item.page !== null)
      .map((item) => ({ page: item.page as number, text: item.text })),
    extractor: 'pdfjs-dist',
    extractedAt: nowIso(),
  };
}

export function splitPdfFragmentsToChunks(
  fragments: readonly PdfTextFragment[],
  maxChars = 720,
  overlapChars = 120,
): PdfChunk[] {
  const normalizedMaxChars = Math.max(160, Math.floor(maxChars));
  const normalizedOverlap = Math.max(0, Math.min(Math.floor(overlapChars), Math.floor(normalizedMaxChars / 3)));
  const chunks: PdfChunk[] = [];

  for (const fragment of fragments) {
    const text = normalizeText(fragment.text);
    if (!text) continue;

    if (text.length <= normalizedMaxChars) {
      chunks.push({ text, page: fragment.page, chunk: chunks.length + 1 });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const tentativeEnd = Math.min(text.length, start + normalizedMaxChars);
      let end = tentativeEnd;
      if (tentativeEnd < text.length) {
        const boundary = text.lastIndexOf(' ', tentativeEnd);
        if (boundary > start + Math.floor(normalizedMaxChars * 0.5)) {
          end = boundary;
        }
      }

      const piece = normalizeText(text.slice(start, end));
      if (piece) {
        chunks.push({ text: piece, page: fragment.page, chunk: chunks.length + 1 });
      }

      if (end >= text.length) break;
      start = Math.max(end - normalizedOverlap, start + 1);
    }
  }

  return chunks;
}

export function buildPdfEmbeddingSourceId(mediaId: string, page: number | null, chunk: number): string {
  const suffix = page
    ? `#page=${page}&chunk=${chunk}`
    : `#chunk=${chunk}`;
  return `${mediaId}${suffix}`;
}

export function extractPdfSnippet(details: Record<string, unknown> | undefined, maxChars = 320): string {
  const fragments = extractPdfTextFragments(details);
  const first = fragments.find((item) => item.text.trim().length > 0)?.text ?? '';
  return normalizeText(first).slice(0, Math.max(80, maxChars));
}
