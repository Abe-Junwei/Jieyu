import { useCallback, useEffect, useRef } from 'react';
import { PdfPreviewSection } from '../components/PdfPreviewSection';
import { usePdfPreview } from '../hooks/usePdfPreview';
import type { Locale } from '../i18n';

export interface PdfPreviewOpenRequest {
  nonce: number;
  title: string;
  page: number | null;
  sourceUrl?: string;
  sourceBlob?: Blob;
  hashSuffix?: string;
  searchSnippet?: string;
}

interface TranscriptionPagePdfRuntimeProps {
  locale: Locale;
  request: PdfPreviewOpenRequest | null;
  onCloseRequest?: () => void;
}

export function TranscriptionPagePdfRuntime({
  locale,
  request,
  onCloseRequest,
}: TranscriptionPagePdfRuntimeProps) {
  const {
    pdfPreview,
    setPdfPreview,
    pdfPreviewPos,
    pdfPreviewDragging,
    pdfPreviewRef,
    openPdfPreview,
    handlePdfPreviewPageChange,
    handlePdfPreviewOpenExternal,
    handlePdfPreviewDragStart,
  } = usePdfPreview();
  const managedObjectUrlRef = useRef<string | null>(null);
  const handledRequestNonceRef = useRef<number | null>(null);

  const cleanupManagedObjectUrl = useCallback(() => {
    const current = managedObjectUrlRef.current;
    if (!current) return;
    URL.revokeObjectURL(current);
    managedObjectUrlRef.current = null;
  }, []);

  const handleClosePdfPreview = useCallback(() => {
    setPdfPreview(null);
    cleanupManagedObjectUrl();
    onCloseRequest?.();
  }, [cleanupManagedObjectUrl, onCloseRequest, setPdfPreview]);

  useEffect(() => {
    if (!request) return;
    if (handledRequestNonceRef.current === request.nonce) return;
    handledRequestNonceRef.current = request.nonce;

    let resolvedSourceUrl = request.sourceUrl?.trim() ?? '';
    if (request.sourceBlob instanceof Blob) {
      cleanupManagedObjectUrl();
      resolvedSourceUrl = URL.createObjectURL(request.sourceBlob);
      managedObjectUrlRef.current = resolvedSourceUrl;
    } else {
      cleanupManagedObjectUrl();
    }

    if (!resolvedSourceUrl) return;
    openPdfPreview(
      resolvedSourceUrl,
      request.title,
      request.page,
      request.hashSuffix ?? '',
      request.searchSnippet,
    );
  }, [cleanupManagedObjectUrl, openPdfPreview, request]);

  useEffect(() => () => {
    cleanupManagedObjectUrl();
  }, [cleanupManagedObjectUrl]);

  return (
    <PdfPreviewSection
      locale={locale}
      pdfPreview={pdfPreview}
      pdfPreviewDragging={pdfPreviewDragging}
      pdfPreviewPos={pdfPreviewPos}
      pdfPreviewRef={pdfPreviewRef}
      onDragStart={handlePdfPreviewDragStart}
      onChangePage={handlePdfPreviewPageChange}
      onOpenExternal={handlePdfPreviewOpenExternal}
      onClose={handleClosePdfPreview}
    />
  );
}