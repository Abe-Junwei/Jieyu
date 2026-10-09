import type { Dispatch, SetStateAction } from 'react';
import type { ImportConflictStrategy } from '../../db';
import {
  importJieyuArchiveFile,
  previewJieyuArchiveFile,
  type JieyuArchiveImportPreview,
} from '../../services/JymService';
import { t, tf, type Locale } from '../../i18n';
import { toErrorMessage } from '../../utils/saveStateError';
import { describeArchiveImportError } from '../../utils/archiveImportErrorMessage';
import { reportActionError } from '../../utils/actionErrorReporter';
import { createLogger } from '../../observability/logger';
import type { SaveState } from '../useTranscriptionData';
import { resolveCurrentProjectTextId } from '../../utils/transcriptionUrlDeepLink';

const log = createLogger('useImportExport');

function isArchivePasswordError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('password required') || message.includes('decrypt jieyu archive');
}

async function isJytFile(file: File): Promise<boolean> {
  const jyt = await import('../../services/JytService');
  return jyt.isJytPackage(new Uint8Array(await file.arrayBuffer()));
}

function pickProjectTitle(title: Record<string, string> | undefined, fallback: string): string {
  const value = title?.['default'] ?? Object.values(title ?? {}).find((item) => item.trim());
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function getArchivePasswordCacheKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

interface CreateImportExportArchiveHandlersInput {
  activeTextId: string | null;
  /** 必须传当前项目 textId（JY-02）| Must pass the current project textId (JY-02) */
  loadSnapshot: (textId: string) => Promise<void>;
  locale: Locale;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
}

export function createImportExportArchiveHandlers(input: CreateImportExportArchiveHandlersInput) {
  const { activeTextId, loadSnapshot, locale, setSaveState } = input;
  const passwordCache = new Map<string, string>();

  const withArchivePasswordRetry = async <T>(
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

      const promptValue = window.prompt(
        t(locale, 'transcription.importExport.archivePasswordPrompt'),
      );
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jyt = await import('../../services/JytService');
    if (jyt.isJytPackage(bytes)) {
      // JYT：恢复为新项目（D5 默认），预览里没有冲突和策略 | JYT restores as a new project (D5)
      const preview = await withArchivePasswordRetry(file, (password) =>
        jyt.previewJytRestore(bytes, password ? { password } : undefined),
      );
      const title = pickProjectTitle(preview.sourceProject.title, preview.sourceProject.id);
      return {
        kind: 'jyt',
        manifest: {
          formatVersion: preview.manifest.formatVersion,
          kind: 'jyt',
          schemaVersion: preview.manifest.dataSchemaVersion,
          exportedAt: preview.manifest.created,
          systemRefs: preview.manifest.systemRefs,
        },
        collections: preview.collections.map((item) => ({
          name: item.name,
          incoming: item.incoming,
          conflicts: 0,
          existing: 0,
          willInsertUpsert: item.incoming,
          willInsertSkipExisting: item.incoming,
          willInsertReplaceAll: item.incoming,
        })),
        unresolvedSystemRefs: preview.unresolvedSystemRefs,
        totalIncoming: preview.totalIncoming,
        totalConflicts: 0,
        restoreAsNewProject: {
          sourceProjectTitle: title,
          mediaWithoutBytes: preview.mediaWithoutBytes,
          skippedLanguageIds: preview.skippedLanguageIds,
        },
      };
    }
    return withArchivePasswordRetry(file, (password) =>
      previewJieyuArchiveFile(file, password ? { password } : undefined),
    );
  };

  const restoreJytArchive = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const jyt = await import('../../services/JytService');
    const restored = await withArchivePasswordRetry(file, (password) =>
      jyt.restoreJytAsNewProject(bytes, password ? { password } : undefined),
    );
    const written = Object.values(restored.importResult.collections).reduce(
      (sum, c) => sum + (c?.written ?? 0),
      0,
    );
    return tf(locale, 'transcription.importExport.importDone.restoredAsNew', {
      title: pickProjectTitle(restored.title, restored.projectId),
      written,
    });
  };

  const importProjectArchive = async (
    file: File,
    strategy: ImportConflictStrategy,
  ): Promise<boolean> => {
    let resolvedTextId: string | null = activeTextId;

    try {
      if (await isJytFile(file)) {
        const message = await restoreJytArchive(file);
        // 仍停留在当前项目（JY-02）；新项目在项目列表里 | Stay on the current project (JY-02)
        await loadSnapshot(resolveCurrentProjectTextId(resolvedTextId));
        setSaveState({ kind: 'done', message });
        return true;
      }
      const imported = await withArchivePasswordRetry(file, (password) =>
        importJieyuArchiveFile(file, {
          strategy,
          ...(password ? { password } : {}),
        }),
      );
      const totals = Object.values(imported.importResult.collections).reduce(
        (acc, c) => ({
          written: acc.written + (c?.written ?? 0),
          skipped: acc.skipped + (c?.skipped ?? 0),
        }),
        { written: 0, skipped: 0 },
      );
      // 归档导入后仍停留在当前项目（JY-02）| Stay on the current project after an archive import (JY-02)
      await loadSnapshot(resolveCurrentProjectTextId(resolvedTextId));
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
      const rawMessage = describeArchiveImportError(locale, err);
      log.error('Import archive failed', {
        fileName: file.name,
        strategy,
        resolvedTextId,
        error: rawMessage,
      });
      reportActionError({
        actionLabel: t(locale, 'transcription.importExport.actionLabelImportFile'),
        error: err,
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        conflictNames: ['TranscriptionPersistenceConflictError', 'RecoveryApplyConflictError'],
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
