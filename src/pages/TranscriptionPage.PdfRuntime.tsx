import '../styles/panels/pdf-preview-embed.css';
import { useCallback, useEffect, useRef } from 'react';
import { PdfPreviewSection } from '../components/PdfPreviewSection';
import { usePdfPreview } from '../hooks/usePdfPreview';
import type { TranscriptionPagePdfRuntimeProps } from './TranscriptionPage.runtimeContracts';

export function TranscriptionPagePdfRuntime({
  locale,
  previewRequest,
}: TranscriptionPagePdfRuntimeProps) {
  const { request, onCloseRequest } = previewRequest;
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