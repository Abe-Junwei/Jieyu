import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useOptionalLocale } from '../i18n';
import { getPdfViewerPanelMessages } from '../i18n/messages';
import { PanelButton, PanelChip } from './ui';
import { PanelSummary } from './ui/PanelSummary';
import { EmbeddedPanelShell } from './ui/EmbeddedPanelShell';

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
  const locale = useOptionalLocale() ?? 'zh-CN';
  const messages = getPdfViewerPanelMessages(locale);
  const resolvedTitle = title?.trim() || messages.viewerTitle;
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
  }, [totalPages]);

  const summaryProps = {
    ...(searchSnippet ? { supportingText: searchSnippet, supportingClassName: 'pdf-viewer-panel-snippet' } : {}),
  };

  return (
    <EmbeddedPanelShell
      className="pnl-pdf-viewer-panel"
      bodyClassName="pdf-viewer-panel-body"
      footerClassName="pdf-viewer-panel-footer"
      title={resolvedTitle}
      footer={(
        <>
          <div className="pdf-viewer-panel-page-status">{messages.pageStatus(currentPage, totalPages)}</div>
          <div className="pdf-viewer-panel-toolbar">
            <PanelButton
              className="pdf-viewer-panel-nav"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
            >
              {messages.prevPage}
            </PanelButton>
            <PanelButton
              className="pdf-viewer-panel-nav"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
            >
              {messages.nextPage}
            </PanelButton>
          </div>
        </>
      )}
    >
      <PanelSummary
        className="pdf-viewer-panel-summary"
        description={searchSnippet ? messages.searchHint : messages.noSearchHint}
        meta={(
          <div className="panel-meta">
            <PanelChip>{messages.pageStatus(currentPage, totalPages)}</PanelChip>
            {searchSnippet ? <PanelChip>{messages.searchHit}</PanelChip> : null}
          </div>
        )}
        {...summaryProps}
      />

      <div className="pdf-viewer-panel-stage">
        {loading && (
          <div className="pdf-viewer-panel-state pdf-viewer-panel-state-loading">
            {messages.loading}
          </div>
        )}

        {error && (
          <div className="pdf-viewer-panel-state pdf-viewer-panel-state-error">
            {error}
          </div>
        )}

        {!loading && !error && (
          <Suspense
            fallback={
              <div className="pdf-viewer-panel-state pdf-viewer-panel-state-loading">
                {messages.preparingRenderer}
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
    </EmbeddedPanelShell>
  );
}
