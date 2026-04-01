import { Suspense, lazy, useEffect, useState } from 'react';

const PdfViewerPanel = lazy(async () => import('./PdfViewerPanel').then((module) => ({ default: module.PdfViewerPanel })));

type PdfPreviewState = {
  url: string;
  title: string;
  page: number | null;
  navToken: number;
  searchSnippet?: string;
};

type Props = {
  locale: string;
  pdfPreview: PdfPreviewState | null;
  pdfPreviewDragging: boolean;
  pdfPreviewPos: { right: number; bottom: number };
  pdfPreviewRef: React.MutableRefObject<HTMLElement | null>;
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  onChangePage: (delta: number) => void;
  onOpenExternal: () => void;
  onClose: () => void;
};

export function PdfPreviewSection({
  locale,
  pdfPreview,
  pdfPreviewDragging,
  pdfPreviewPos,
  pdfPreviewRef,
  onDragStart,
  onChangePage,
  onOpenExternal,
  onClose,
}: Props) {
  const [useEnhancedPreview, setUseEnhancedPreview] = useState(false);

  useEffect(() => {
    setUseEnhancedPreview(false);
  }, [pdfPreview?.navToken, pdfPreview?.searchSnippet]);

  if (!pdfPreview) return null;

  return (
    <section
      ref={(node) => {
        pdfPreviewRef.current = node;
      }}
      className={`transcription-pdf-preview-panel ${pdfPreviewDragging ? 'is-dragging' : ''}`}
      aria-label={locale === 'zh-CN' ? 'PDF \u9884\u89c8\u9762\u677f' : 'PDF preview panel'}
      style={{ right: `${pdfPreviewPos.right}px`, bottom: `${pdfPreviewPos.bottom}px` }}
    >
      <header className="transcription-pdf-preview-header" onPointerDown={onDragStart}>
        <strong className="transcription-pdf-preview-title" title={pdfPreview.title}>{pdfPreview.title}</strong>
        {pdfPreview.page && (
          <span className="transcription-pdf-preview-page-tag">
            {locale === 'zh-CN' ? `\u7b2c ${pdfPreview.page} \u9875` : `Page ${pdfPreview.page}`}
          </span>
        )}
        <div className="transcription-pdf-preview-actions">
          <button type="button" className="transcription-pdf-preview-nav" onClick={() => onChangePage(-1)} disabled={(pdfPreview.page ?? 1) <= 1}>
            {locale === 'zh-CN' ? '\u4e0a\u4e00\u9875' : 'Prev'}
          </button>
          <button type="button" className="transcription-pdf-preview-nav" onClick={() => onChangePage(1)}>
            {locale === 'zh-CN' ? '\u4e0b\u4e00\u9875' : 'Next'}
          </button>
          {pdfPreview.searchSnippet && !useEnhancedPreview && (
            <button type="button" className="transcription-pdf-preview-nav" onClick={() => setUseEnhancedPreview(true)}>
              {locale === 'zh-CN' ? '\u589e\u5f3a\u9ad8\u4eae' : 'Enhanced Highlight'}
            </button>
          )}
          <button type="button" className="transcription-pdf-preview-nav" onClick={onOpenExternal}>
            {locale === 'zh-CN' ? '\u65b0\u7a97\u53e3\u6253\u5f00' : 'Open'}
          </button>
          <button type="button" className="transcription-pdf-preview-close" onClick={onClose} aria-label={locale === 'zh-CN' ? '\u5173\u95ed PDF \u9884\u89c8' : 'Close PDF preview'}>
            ×
          </button>
        </div>
      </header>
      <div className="transcription-pdf-preview-frame">
        {pdfPreview.searchSnippet && useEnhancedPreview ? (
          <Suspense
            fallback={
              <div className="transcription-pdf-preview-loading" role="status" aria-live="polite">
                {locale === 'zh-CN' ? 'PDF \u52a0\u8f7d\u4e2d...' : 'Loading PDF...'}
              </div>
            }
          >
            <PdfViewerPanel
              key={pdfPreview.navToken}
              url={pdfPreview.url}
              title={pdfPreview.title}
              page={pdfPreview.page}
              searchSnippet={pdfPreview.searchSnippet}
            />
          </Suspense>
        ) : (
          <iframe
            key={pdfPreview.navToken}
            src={pdfPreview.url}
            title={pdfPreview.title}
            className="transcription-pdf-preview-iframe"
            style={{ width: '100%', height: '100%', border: 'none', background: 'var(--surface-panel)' }}
          />
        )}
      </div>
    </section>
  );
}
