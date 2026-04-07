import { useEffect, useRef, useState } from 'react';
import { createLogger } from '../observability/logger';
import { loadPdfJsRuntime } from '../services/PdfJsRuntime';

type PdfDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;

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
  const pdfDocRef = useRef<PdfDocumentProxy | null>(null);
  const highlightedTextsRef = useRef<Set<string>>(new Set());
  const [documentVersion, setDocumentVersion] = useState(0);
  const [highlightVersion, setHighlightVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      try {
        onLoadingChange(true);
        onErrorChange(null);
        const pdfjsLib = await loadPdfJsRuntime();
        const doc = await pdfjsLib.getDocument(url).promise;
        if (!isMounted) return;
        pdfDocRef.current = doc;
        setDocumentVersion((version) => version + 1);
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
    let renderTask: import('pdfjs-dist').RenderTask | null = null;

    const renderPage = async () => {
      try {
        onErrorChange(null);
        const page = await pdfDocRef.current?.getPage(currentPage);
        if (!isMounted || !page || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const canvasContext = canvas.getContext('2d');

        if (!canvasContext) {
          throw new Error('Failed to acquire PDF canvas context');
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvas, canvasContext, viewport });
        await renderTask.promise;
        renderTask = null;

        if (!isMounted) return;
        if (textLayerRef.current) {
          textLayerRef.current.textContent = '';
          const textContent = await page.getTextContent();
          if (!isMounted) return;
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
      renderTask?.cancel();
    };
  }, [currentPage, documentVersion, highlightVersion, onErrorChange]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc) {
      return;
    }

    const normalizedSnippet = searchSnippet?.trim().toLowerCase() ?? '';
    if (!normalizedSnippet) {
      if (highlightedTextsRef.current.size > 0) {
        highlightedTextsRef.current.clear();
        setHighlightVersion((version) => version + 1);
      }
      return;
    }

    let cancelled = false;

    const searchAndHighlight = async () => {
      const nextHighlights = new Set<string>();
      let matchedPage: number | undefined;

      try {
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          if (cancelled) break;
          const textItems = textContent.items.filter(isPdfTextItem) as unknown as PdfTextItem[];
          const pageText = textItems.map((item) => item.str).join(' ').toLowerCase();

          if (!pageText.includes(normalizedSnippet)) continue;

          // 注：逐项匹配只能高亮完整词组在单个 TextItem 内的情况；
          // 跨 item 边界的词组页面跳转正确，但高亮不会出现。
          // Note: per-item filter highlights only when the full snippet falls within one TextItem;
          // cross-boundary multi-word snippets still navigate to the correct page but won't be highlighted.
          const words = textItems.filter((item) => item.str.toLowerCase().includes(normalizedSnippet));
          words.forEach((word) => {
            nextHighlights.add(word.str.trim());
          });
          matchedPage = i;
          break;
        }
      } catch (err) {
        if (!cancelled) {
          log.warn('Failed to search snippet in PDF document', {
            currentPage,
            snippetLength: normalizedSnippet.length,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (cancelled) {
        return;
      }

      highlightedTextsRef.current = nextHighlights;
      setHighlightVersion((version) => version + 1);

      if (matchedPage && matchedPage !== currentPage) {
        onPageResolved?.(matchedPage);
      }
    };

    void searchAndHighlight();
    return () => {
      cancelled = true;
    };
  }, [currentPage, documentVersion, onPageResolved, searchSnippet]);

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