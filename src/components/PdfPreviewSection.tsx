import { Suspense, lazy, useEffect, useState } from 'react';
import { normalizeLocale } from '../i18n';
import { getPdfPreviewSectionMessages } from '../i18n/pdfPreviewSectionMessages';

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
  const messages = getPdfPreviewSectionMessages(normalizeLocale(locale) ?? 'zh-CN');
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
      aria-label={messages.panelAriaLabel}
      style={{ right: `${pdfPreviewPos.right}px`, bottom: `${pdfPreviewPos.bottom}px` }}
    >
      <header className="transcription-pdf-preview-header" onPointerDown={onDragStart}>
        <strong className="transcription-pdf-preview-title" title={pdfPreview.title}>{pdfPreview.title}</strong>
        {pdfPreview.page && (
          <span className="transcription-pdf-preview-page-tag">
            {messages.pageTag(pdfPreview.page)}
          </span>
        )}
        <div className="transcription-pdf-preview-actions">
          <button type="button" className="transcription-pdf-preview-nav" onClick={() => onChangePage(-1)} disabled={(pdfPreview.page ?? 1) <= 1}>
            {messages.prevPage}
          </button>
          <button type="button" className="transcription-pdf-preview-nav" onClick={() => onChangePage(1)}>
            {messages.nextPage}
          </button>
          {pdfPreview.searchSnippet && !useEnhancedPreview && (
            <button type="button" className="transcription-pdf-preview-nav" onClick={() => setUseEnhancedPreview(true)}>
              {messages.enhancedHighlight}
            </button>
          )}
          <button type="button" className="transcription-pdf-preview-nav" onClick={onOpenExternal}>
            {messages.openExternal}
          </button>
          <button type="button" className="transcription-pdf-preview-close" onClick={onClose} aria-label={messages.closePreviewAriaLabel}>
            ×
          </button>
        </div>
      </header>
      <div className="transcription-pdf-preview-frame">
        {pdfPreview.searchSnippet && useEnhancedPreview ? (
          <Suspense
            fallback={
              <div className="transcription-pdf-preview-loading" role="status" aria-live="polite">
                {messages.loadingPdf}
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
          />
        )}
      </div>
    </section>
  );
}
