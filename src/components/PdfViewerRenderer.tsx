import { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createLogger } from '../observability/logger';

interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
}

interface PdfViewerRendererProps {
  url: string;
  currentPage: number;
  initialPage: number | null;
  searchSnippet?: string | undefined;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onTotalPagesChange: (totalPages: number) => void;
  onPageResolved?: (page: number) => void;
}

const log = createLogger('PdfViewerPanel');

function isPdfTextItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as { str?: unknown; transform?: unknown; height?: unknown };
  if (typeof candidate.str !== 'string') return false;
  if (!Array.isArray(candidate.transform) || candidate.transform.length < 6) return false;
  if (candidate.transform.some((value) => typeof value !== 'number')) return false;
  return typeof candidate.height === 'number';
}

export function PdfViewerRenderer({
  url,
  currentPage,
  initialPage,
  searchSnippet,
  onLoadingChange,
  onErrorChange,
  onTotalPagesChange,
  onPageResolved,
}: PdfViewerRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const highlightedTextsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      try {
        onLoadingChange(true);
        onErrorChange(null);
        const doc = await pdfjsLib.getDocument(url).promise;
        if (!isMounted) return;
        pdfDocRef.current = doc;
        onTotalPagesChange(doc.numPages);
        const resolvedPage = Math.max(1, Math.min(initialPage ?? 1, doc.numPages));
        onPageResolved?.(resolvedPage);
      } catch (err) {
        if (!isMounted) return;
        onErrorChange(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        if (isMounted) onLoadingChange(false);
      }
    };
    void loadPdf();
    return () => {
      isMounted = false;
    };
  }, [initialPage, onErrorChange, onLoadingChange, onPageResolved, onTotalPagesChange, url]);

  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    let isMounted = true;

    const renderPage = async () => {
      try {
        onErrorChange(null);
        const page = await pdfDocRef.current?.getPage(currentPage);
        if (!page || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvas,
          viewport,
        }).promise;

        if (textLayerRef.current) {
          textLayerRef.current.textContent = '';
          const textContent = await page.getTextContent();
          const textItems = textContent.items.filter(isPdfTextItem) as unknown as PdfTextItem[];
          const spans = textItems.map((item) => {
            const span = document.createElement('span');
            const tx = item.transform[4] ?? 0;
            const ty = item.transform[5] ?? 0;
            span.textContent = item.str;
            span.style.position = 'absolute';
            span.style.left = `${tx}px`;
            span.style.top = `${viewport.height - ty}px`;
            span.style.fontSize = `${Math.abs(item.height)}px`;
            span.style.fontFamily = 'var(--font-base)';
            span.style.whiteSpace = 'nowrap';
            span.style.pointerEvents = 'auto';
            span.style.cursor = 'text';

            if (highlightedTextsRef.current.size > 0 && highlightedTextsRef.current.has(item.str.trim())) {
              span.style.backgroundColor = 'var(--state-warning-bg)';
              span.style.color = 'var(--text-primary)';
            }

            return span;
          });

          textLayerRef.current.style.position = 'absolute';
          textLayerRef.current.style.top = '0';
          textLayerRef.current.style.left = '0';
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;
          spans.forEach((span) => textLayerRef.current?.appendChild(span));
        }
      } catch (err) {
        if (!isMounted) return;
        onErrorChange(err instanceof Error ? err.message : 'Failed to render page');
      }
    };

    void renderPage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, onErrorChange]);

  useEffect(() => {
    if (!searchSnippet?.trim() || !pdfDocRef.current) return;

    const searchAndHighlight = async () => {
      const snippet = searchSnippet.trim().toLowerCase();
      highlightedTextsRef.current.clear();

      try {
        for (let i = 1; i <= pdfDocRef.current!.numPages; i += 1) {
          const page = await pdfDocRef.current!.getPage(i);
          const textContent = await page.getTextContent();
          const textItems = textContent.items.filter(isPdfTextItem) as unknown as PdfTextItem[];
          const pageText = textItems.map((item) => item.str).join(' ').toLowerCase();

          if (!pageText.includes(snippet)) continue;

          const words = textItems.filter((item) => item.str.toLowerCase().includes(snippet));
          words.forEach((word) => {
            highlightedTextsRef.current.add(word.str);
          });

          if (i !== currentPage) {
            onPageResolved?.(i);
          }
          return;
        }
      } catch (err) {
        log.warn('Failed to search snippet in PDF document', {
          currentPage,
          snippetLength: snippet.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void searchAndHighlight();
  }, [currentPage, onPageResolved, searchSnippet]);

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ position: 'relative', background: 'var(--surface-panel)', boxShadow: '0 2px 8px color-mix(in srgb, var(--text-primary) 10%, transparent)' }}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
        <div
          ref={textLayerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            color: 'transparent',
            zIndex: 10,
          }}
        />
      </div>
    </div>
  );
}