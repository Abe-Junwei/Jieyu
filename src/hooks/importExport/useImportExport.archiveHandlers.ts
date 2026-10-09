import type { Dispatch, SetStateAction } from 'react';
import type { ImportConflictStrategy } from '../../db';
import type {
  JieyuArchiveImportPreview,
  ProjectArchiveRestoreMode,
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

function loadProjectPackageModule() {
  return import('../../services/projectPackageService');
}

/** 不是 JYT / JYM 时给出明确的拒绝（T32）| Not a JYT / JYM: refuse clearly (T32) */
async function readProjectPackageBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const packages = await loadProjectPackageModule();
  if (packages.detectProjectPackageKind(bytes) === null) {
    const { SnapshotFormatError } = await import('../../db/snapshotFormatError');
    throw new SnapshotFormatError({
      code: 'unsupported-package',
      message: 'Not a Jieyu project package (JYT / JYM).',
    });
  }
  return { bytes, packages };
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
    const { bytes, packages } = await readProjectPackageBytes(file);
    // JYT / JYM：恢复为新项目（D5 默认），预览里没有冲突和策略 | Restore as a new project (D5)
    const preview = await withArchivePasswordRetry(file, (password) =>
      packages.previewProjectPackageRestore(bytes, {
        ...(password ? { password } : {}),
        ...(activeTextId ? { overwriteTargetProjectId: activeTextId } : {}),
      }),
    );
    const title = pickProjectTitle(preview.sourceProject.title, preview.sourceProject.id);
    const overwrite = preview.overwrite;
    return {
      kind: preview.kind,
      manifest: {
        formatVersion: preview.manifest.formatVersion,
        kind: preview.kind,
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
        includedBytesCount: preview.includedBytes.count,
        includedBytesTotal: preview.includedBytes.totalBytes,
        skippedLanguageIds: preview.skippedLanguageIds,
        ...(overwrite
          ? {
              overwriteCurrentProject: {
                targetProjectId: overwrite.targetProjectId,
                targetTitle: pickProjectTitle(overwrite.targetTitle, overwrite.targetProjectId),
                available: overwrite.available,
                bytesAtRiskCount: overwrite.bytesAtRisk.length,
              },
            }
          : {}),
      },
    };
  };

  const restoreProjectPackage = async (file: File): Promise<string> => {
    const { bytes, packages } = await readProjectPackageBytes(file);
    const restored = await withArchivePasswordRetry(file, (password) =>
      packages.restoreProjectPackageAsNew(bytes, password ? { password } : undefined),
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

  const overwriteWithProjectPackage = async (
    file: File,
    targetProjectId: string,
  ): Promise<string> => {
    const { bytes, packages } = await readProjectPackageBytes(file);
    const result = await withArchivePasswordRetry(file, (password) =>
      packages.overwriteProjectWithPackage(bytes, {
        targetProjectId,
        ...(password ? { password } : {}),
      }),
    );
    const written = Object.values(result.importResult.collections).reduce(
      (sum, c) => sum + (c?.written ?? 0),
      0,
    );
    return tf(locale, 'transcription.importExport.importDone.overwritten', {
      kind: result.kind.toUpperCase(),
      title: pickProjectTitle(result.title, result.projectId),
      written,
    });
  };

  const importProjectArchive = async (
    file: File,
    strategy: ImportConflictStrategy,
    restoreMode: ProjectArchiveRestoreMode = 'restore-as-new',
  ): Promise<boolean> => {
    let resolvedTextId: string | null = activeTextId;

    try {
      if (restoreMode === 'overwrite-current') {
        // D5：覆盖只针对当前项目；界面已经做了二次确认 | D5: overwrite targets the current project only
        if (!resolvedTextId) {
          throw new Error(t(locale, 'transcription.importExport.overwriteNotAllowed'));
        }
        const message = await overwriteWithProjectPackage(file, resolvedTextId);
        await loadSnapshot(resolveCurrentProjectTextId(resolvedTextId));
        setSaveState({ kind: 'done', message });
        return true;
      }
      const message = await restoreProjectPackage(file);
      // 仍停留在当前项目（JY-02）；新项目在项目列表里 | Stay on the current project (JY-02)
      await loadSnapshot(resolveCurrentProjectTextId(resolvedTextId));
      setSaveState({ kind: 'done', message });
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
