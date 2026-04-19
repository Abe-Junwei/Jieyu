import type { Dispatch, SetStateAction } from 'react';
import type { ImportConflictStrategy } from '../db';
import { importJieyuArchiveFile, previewJieyuArchiveFile, type JieyuArchiveImportPreview } from '../services/JymService';
import { t, tf, type Locale } from '../i18n';
import { toErrorMessage } from '../utils/saveStateError';
import { reportActionError } from '../utils/actionErrorReporter';
import { createLogger } from '../observability/logger';
import type { SaveState } from './useTranscriptionData';

const log = createLogger('useImportExport');

function isArchivePasswordError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('password required') || message.includes('decrypt jieyu archive');
}

function getArchivePasswordCacheKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

interface CreateImportExportArchiveHandlersInput {
  activeTextId: string | null;
  loadSnapshot: () => Promise<void>;
  locale: Locale;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
}

export function createImportExportArchiveHandlers(input: CreateImportExportArchiveHandlersInput) {
  const { activeTextId, loadSnapshot, locale, setSaveState } = input;
  const passwordCache = new Map<string, string>();

  const withArchivePasswordRetry = async <T,>(
    file: File,
    operation: (password?: string) => Promise<T>,
  ): Promise<T> => {
    const cacheKey = getArchivePasswordCacheKey(file);
    const cachedPassword = passwordCache.get(cacheKey);

    try {
      return await operation(cachedPassword);
    } catch (error) {
      if (!isArchivePasswordError(error) || typeof window === 'undefined') {
        throw error;
      }

      const promptValue = window.prompt(t(locale, 'transcription.importExport.archivePasswordPrompt'));
      if (promptValue == null) {
        throw error;
      }

      const password = promptValue.trim();
      if (!password) {
        throw new Error(t(locale, 'transcription.importExport.archivePasswordRequired'));
      }

      passwordCache.set(cacheKey, password);
      return operation(password);
    }
  };

  const previewProjectArchiveImport = async (file: File): Promise<JieyuArchiveImportPreview> => {
    return withArchivePasswordRetry(file, (password) => previewJieyuArchiveFile(file, password ? { password } : undefined));
  };

  const importProjectArchive = async (
    file: File,
    strategy: ImportConflictStrategy,
  ): Promise<boolean> => {
    let resolvedTextId: string | null = activeTextId;

    try {
      const imported = await withArchivePasswordRetry(file, (password) => importJieyuArchiveFile(file, {
        strategy,
        ...(password ? { password } : {}),
      }));
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
