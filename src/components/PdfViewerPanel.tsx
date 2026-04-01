import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

interface PdfViewerPanelProps {
  url: string;
  title?: string;
  page?: number | null;
  searchSnippet?: string | undefined;
}

const PdfViewerRenderer = lazy(async () => import('./PdfViewerRenderer').then((module) => ({
  default: module.PdfViewerRenderer,
})));

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
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, page ?? 1));
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCurrentPage(Math.max(1, page ?? 1));
  }, [url, page]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--surface-elevated)',
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
          background: 'var(--surface-panel)',
          borderBottom: '1px solid var(--border-soft)',
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
            border: '1px solid var(--border-soft)',
            background: 'var(--surface-panel)',
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.5 : 1,
          }}
        >
          上一页 / Prev
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
            border: '1px solid var(--border-soft)',
            background: 'var(--surface-panel)',
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage >= totalPages ? 0.5 : 1,
          }}
        >
          下一页 / Next
        </button>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          加载中... / Loading...
        </div>
      )}

      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--state-danger-solid)', padding: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <Suspense
          fallback={
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              准备渲染器... / Preparing renderer...
            </div>
          }
        >
          <PdfViewerRenderer
            url={url}
            currentPage={currentPage}
            initialPage={page}
            searchSnippet={searchSnippet}
            onLoadingChange={setLoading}
            onErrorChange={setError}
            onTotalPagesChange={setTotalPages}
            onPageResolved={setCurrentPage}
          />
        </Suspense>
      )}
    </div>
  );
}
