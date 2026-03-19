import { useCallback, useEffect, useRef, useState } from 'react';

export type PdfPreviewState = {
  sourceUrl: string;
  url: string;
  title: string;
  page: number | null;
  hashSuffix: string;
  navToken: number;
  searchSnippet?: string;
};

export function usePdfPreview() {
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewPos, setPdfPreviewPos] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 16 });
  const [pdfPreviewDragging, setPdfPreviewDragging] = useState(false);
  const pdfPreviewRef = useRef<HTMLElement | null>(null);
  const pdfPreviewDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);

  const buildPdfPreviewUrl = useCallback((sourceUrl: string, page: number | null, hashSuffix = '', searchSnippet?: string): string => {
    const trimmedSource = sourceUrl.trim();
    if (!trimmedSource) return '';
    const normalizedBase = trimmedSource.replace(/#.*/, '');
    let hash = '';
    if (page && Number.isFinite(page) && page >= 1) {
      hash = `page=${Math.floor(page)}`;
    } else if (hashSuffix) {
      hash = hashSuffix.replace(/^#/, '');
    }
    if (searchSnippet?.trim()) {
      const escapedSnippet = encodeURIComponent(searchSnippet.trim());
      hash = hash ? `${hash}&search=${escapedSnippet}` : `search=${escapedSnippet}`;
    }
    return hash ? `${normalizedBase}#${hash}` : normalizedBase;
  }, []);

  const openPdfPreview = useCallback((sourceUrl: string, title: string, page: number | null, hashSuffix = '', searchSnippet?: string) => {
    const normalizedPage = page && Number.isFinite(page) && page >= 1 ? Math.floor(page) : null;
    setPdfPreview((current) => {
      const next: PdfPreviewState = {
        sourceUrl,
        url: buildPdfPreviewUrl(sourceUrl, normalizedPage, hashSuffix, searchSnippet),
        title,
        page: normalizedPage,
        hashSuffix,
        navToken: (current?.navToken ?? 0) + 1,
      };
      if (searchSnippet) next.searchSnippet = searchSnippet;
      return next;
    });
  }, [buildPdfPreviewUrl]);

  const handlePdfPreviewPageChange = useCallback((delta: number) => {
    setPdfPreview((current) => {
      if (!current) return current;
      const basePage = current.page ?? 1;
      const nextPage = Math.max(1, basePage + delta);
      return {
        ...current,
        page: nextPage,
        url: buildPdfPreviewUrl(current.sourceUrl, nextPage, current.hashSuffix, current.searchSnippet),
        navToken: current.navToken + 1,
      };
    });
  }, [buildPdfPreviewUrl]);

  const handlePdfPreviewOpenExternal = useCallback(() => {
    if (!pdfPreview) return;
    window.open(pdfPreview.url, '_blank', 'noopener,noreferrer');
  }, [pdfPreview]);

  const handlePdfPreviewDragStart = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) {
      return;
    }
    setPdfPreviewDragging(true);
    pdfPreviewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: pdfPreviewPos.right,
      startBottom: pdfPreviewPos.bottom,
    };
    event.preventDefault();
  }, [pdfPreviewPos.bottom, pdfPreviewPos.right]);

  const handlePdfPreviewDragMove = useCallback((event: PointerEvent) => {
    const drag = pdfPreviewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const nextRight = Math.max(8, drag.startRight - dx);
    const nextBottom = Math.max(8, drag.startBottom - dy);
    setPdfPreviewPos({ right: nextRight, bottom: nextBottom });
  }, []);

  const handlePdfPreviewDragEnd = useCallback((event: PointerEvent) => {
    const drag = pdfPreviewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pdfPreviewDragRef.current = null;
    setPdfPreviewDragging(false);

    const edge = 16;
    const panelWidth = pdfPreviewRef.current?.offsetWidth ?? 520;
    const panelHeight = pdfPreviewRef.current?.offsetHeight ?? 360;
    const maxRight = Math.max(edge, window.innerWidth - panelWidth - edge);
    const maxBottom = Math.max(edge, window.innerHeight - panelHeight - edge);

    setPdfPreviewPos((current) => ({
      right: Math.max(edge, Math.min(maxRight, current.right)),
      bottom: Math.max(edge, Math.min(maxBottom, current.bottom)),
    }));
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePdfPreviewDragMove);
    window.addEventListener('pointerup', handlePdfPreviewDragEnd);
    window.addEventListener('pointercancel', handlePdfPreviewDragEnd);
    return () => {
      window.removeEventListener('pointermove', handlePdfPreviewDragMove);
      window.removeEventListener('pointerup', handlePdfPreviewDragEnd);
      window.removeEventListener('pointercancel', handlePdfPreviewDragEnd);
    };
  }, [handlePdfPreviewDragEnd, handlePdfPreviewDragMove]);

  return {
    pdfPreview,
    setPdfPreview,
    pdfPreviewPos,
    pdfPreviewDragging,
    pdfPreviewRef,
    buildPdfPreviewUrl,
    openPdfPreview,
    handlePdfPreviewPageChange,
    handlePdfPreviewOpenExternal,
    handlePdfPreviewDragStart,
  };
}
