import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Locale } from '../i18n';
import type { PdfPreviewOpenRequest, TranscriptionPagePdfRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { createPdfRuntimeProps } from './TranscriptionPage.runtimeProps';

interface UseTranscriptionPdfRuntimePropsInput {
  locale: Locale;
  pdfPreviewRequest: PdfPreviewOpenRequest | null;
  setPdfPreviewRequest: Dispatch<SetStateAction<PdfPreviewOpenRequest | null>>;
}

export function useTranscriptionPdfRuntimeProps({
  locale,
  pdfPreviewRequest,
  setPdfPreviewRequest,
}: UseTranscriptionPdfRuntimePropsInput): TranscriptionPagePdfRuntimeProps {
  const handleClosePdfPreviewRequest = useCallback(() => {
    setPdfPreviewRequest(null);
  }, [setPdfPreviewRequest]);

  return useMemo(() => createPdfRuntimeProps({
    locale,
    request: pdfPreviewRequest,
    onCloseRequest: handleClosePdfPreviewRequest,
  }), [handleClosePdfPreviewRequest, locale, pdfPreviewRequest]);
}
