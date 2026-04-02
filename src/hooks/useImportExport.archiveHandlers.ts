import type { Dispatch, SetStateAction } from 'react';
import type { ImportConflictStrategy } from '../db';
import { importJieyuArchiveFile, previewJieyuArchiveFile, type JieyuArchiveImportPreview } from '../services/JymService';
import { t, tf, type Locale } from '../i18n';
import { toErrorMessage } from '../utils/saveStateError';
import { reportActionError } from '../utils/actionErrorReporter';
import { createLogger } from '../observability/logger';
import type { SaveState } from './useTranscriptionData';

const log = createLogger('useImportExport');

interface CreateImportExportArchiveHandlersInput {
  activeTextId: string | null;
  loadSnapshot: () => Promise<void>;
  locale: Locale;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
}

export function createImportExportArchiveHandlers(input: CreateImportExportArchiveHandlersInput) {
  const { activeTextId, loadSnapshot, locale, setSaveState } = input;

  const previewProjectArchiveImport = async (file: File): Promise<JieyuArchiveImportPreview> => {
    return previewJieyuArchiveFile(file);
  };

  const importProjectArchive = async (
    file: File,
    strategy: ImportConflictStrategy,
  ): Promise<boolean> => {
    let resolvedTextId: string | null = activeTextId;

    try {
      const imported = await importJieyuArchiveFile(file, { strategy });
      const totals = Object.values(imported.importResult.collections).reduce(
        (acc, c) => ({
          written: acc.written + (c?.written ?? 0),
          skipped: acc.skipped + (c?.skipped ?? 0),
        }),
        { written: 0, skipped: 0 },
      );
      await loadSnapshot();
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.importExport.importDone.archive', {
          kind: imported.kind.toUpperCase(),
          written: totals.written,
          skipped: totals.skipped,
        }),
      });
      return true;
    } catch (err) {
      const rawMessage = toErrorMessage(err);
      log.error('Import archive failed', {
        fileName: file.name,
        strategy,
        resolvedTextId,
        error: rawMessage,
      });
      reportActionError({
        actionLabel: t(locale, 'transcription.importExport.actionLabelImportFile'),
        error: err,
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        conflictNames: [
          'TranscriptionPersistenceConflictError',
          'RecoveryApplyConflictError',
        ],
        conflictI18nKey: 'transcription.importExport.conflict',
        fallbackI18nKey: 'transcription.importExport.failed',
        conflictMessage: t(locale, 'transcription.importExport.conflict'),
        fallbackMessage: tf(locale, 'transcription.importExport.failed', {
          message: rawMessage,
        }),
      });
      return false;
    }
  };

  return {
    previewProjectArchiveImport,
    importProjectArchive,
  };
}
