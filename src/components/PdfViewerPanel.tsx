import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createLogger } from '../observability/logger';

interface PdfViewerPanelProps {
  url: string;
  title?: string;
  page?: number | null;
  searchSnippet?: string | undefined;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
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

/**
 * PDF 查看器组件，支持文本搜索与高亮
 * Embedded PDF viewer with text search and highlight support
 */
export function PdfViewerPanel({
  url,
  title,
  page = 1,
  searchSnippet,
}: PdfViewerPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(Math.max(1, page ?? 1));
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const highlightedTextsRef = useRef<Set<string>>(new Set());

  // 设置 PDF.js worker 路径 | Configure PDF.js worker path
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);

  // 加载 PDF 文件 | Load PDF document
  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        const doc = await pdfjsLib.getDocument(url).promise;
        if (!isMounted) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setCurrentPage(Math.max(1, Math.min(page ?? 1, doc.numPages)));
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadPdf();
    return () => { isMounted = false; };
  }, [url, page]);

  // 渲染当前页面 | Render current page
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    let isMounted = true;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current!.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvas: canvas,
          viewport,
        }).promise;

        // 渲染文本层用于搜索/选择 | Render text layer for search and selection
        if (textLayerRef.current) {
          textLayerRef.current.textContent = '';
          const textContent = await page.getTextContent();
          const textItems = textContent.items.filter(isPdfTextItem) as unknown as PdfTextItem[];
          const spans = textItems
            .map((item) => {
              const span = document.createElement('span');
              const tx = item.transform[4] ?? 0;
              const ty = item.transform[5] ?? 0;
              span.textContent = item.str;
              span.style.position = 'absolute';
              span.style.left = `${tx}px`;
              span.style.top = `${viewport.height - ty}px`;
              span.style.fontSize = `${Math.abs(item.height)}px`;
              span.style.fontFamily = 'Arial, sans-serif';
              span.style.whiteSpace = 'nowrap';
              span.style.pointerEvents = 'auto';
              span.style.cursor = 'text';

              // 如果该段文本是搜索结果，高亮它 | Highlight if part of search result
              if (highlightedTextsRef.current.size > 0 && highlightedTextsRef.current.has(item.str.trim())) {
                span.style.backgroundColor = '#ffff00';
                span.style.color = '#000';
              }

              return span;
            });

          textLayerRef.current.style.position = 'absolute';
          textLayerRef.current.style.top = '0';
          textLayerRef.current.style.left = '0';
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;
          spans.forEach((s) => textLayerRef.current!.appendChild(s));
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to render page');
      }
    };

    renderPage();
    return () => { isMounted = false; };
  }, [currentPage]);

  // 搜索并高亮文本 | Search and highlight text
  useEffect(() => {
    if (!searchSnippet?.trim() || !pdfDocRef.current) return;

    const searchAndHighlight = async () => {
      const snippet = searchSnippet.trim().toLowerCase();
      highlightedTextsRef.current.clear();

      try {
        for (let i = 1; i <= pdfDocRef.current!.numPages; i++) {
          const page = await pdfDocRef.current!.getPage(i);
          const textContent = await page.getTextContent();
          const textItems = textContent.items.filter(isPdfTextItem) as unknown as PdfTextItem[];
          const pageText = textItems
            .map((item) => item.str)
            .join(' ')
            .toLowerCase();

          if (pageText.includes(snippet)) {
            // 在该页面附近页面添加高亮标记 | Mark page for highlighting
            const words = textItems
              .filter((item) => item.str.toLowerCase().includes(snippet));

            words.forEach((w) => {
              highlightedTextsRef.current.add(w.str);
            });

            // 跳转到该页面 | Navigate to page with match
            if (i !== currentPage) {
              setCurrentPage(i);
            }
            return;
          }
        }
      } catch (err) {
        log.warn('Failed to search snippet in PDF document', {
          currentPage,
          snippetLength: snippet.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    searchAndHighlight();
  }, [searchSnippet, currentPage]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#f5f5f5',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          background: '#fff',
          borderBottom: '1px solid #e0e0e0',
          height: 40,
        }}
      >
        <button
          type="button"
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #ccc',
            background: '#fff',
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.5 : 1,
          }}
        >
          上一页 / Prev
        </button>
        <div style={{ fontSize: 12, color: '#666' }}>
          {currentPage} / {totalPages}
        </div>
        <button
          type="button"
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #ccc',
            background: '#fff',
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage >= totalPages ? 0.5 : 1,
          }}
        >
          下一页 / Next
        </button>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
          加载中... / Loading...
        </div>
      )}

      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d32f2f', padding: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
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
          <div style={{ position: 'relative', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
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
      )}
    </div>
  );
}
