import type { Dispatch, SetStateAction } from 'react';
import type { ImportConflictStrategy } from '../../db';
import type {
  JieyuArchiveImportPreview,
  ProjectArchiveImportSelection,
  ProjectArchiveRestoreMode,
} from '../../services/JymService';
import { t, tf, type Locale } from '../../i18n';
import { toErrorMessage } from '../../utils/saveStateError';
import { describeArchiveImportError } from '../../utils/archiveImportErrorMessage';
import { reportActionError } from '../../utils/actionErrorReporter';
import { createLogger } from '../../observability/logger';
import type { SaveState } from '../useTranscriptionData';
import {
  publishActiveProjectTextId,
  resolveCurrentProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';

const log = createLogger('useImportExport');

function isArchivePasswordError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('password required') || message.includes('decrypt jieyu archive');
}

function loadProjectPackageModule() {
  return import('../../services/projectPackageService');
}

function loadJybModule() {
  return import('../../services/JybService');
}

/**
 * 读出文件；是 JYB 时带上 JYB 模块。原始恢复快照（raw-idb ZIP）先转换成当前版本的 JYB（8.2，
 * T41），之后按 JYB 处理；同一个文件只转换一次。
 * Read the file; a JYB comes with the JYB module. A raw recovery snapshot (raw-idb ZIP) is first
 * converted into a current-version JYB (8.2, T41) and then handled as a JYB; once per file.
 */
async function readArchiveFile(file: File, converted: Map<string, Blob>) {
  // 文件本身就是 Blob：包按条目读取，不整份读进内存（4b）| The File is the Blob; read per entry (4b)
  const bytes: Blob = file;
  const jyb = await loadJybModule();
  const raw = await import('../../services/rawSnapshotConverter');
  if (await raw.isRawIdbSnapshot(bytes)) {
    const key = getArchivePasswordCacheKey(file);
    let jybBytes = converted.get(key);
    if (!jybBytes) {
      jybBytes = (await raw.convertRawSnapshotToJyb(bytes)).jyb;
      converted.set(key, jybBytes);
    }
    return { bytes: jybBytes, jyb };
  }
  return { bytes, jyb: (await jyb.isJybPackage(bytes)) ? jyb : null };
}

/** 不是 JYT / JYM 时给出明确的拒绝（T32）| Not a JYT / JYM: refuse clearly (T32) */
async function readProjectPackageBytes(file: File, alreadyRead?: Blob) {
  const bytes = alreadyRead ?? file;
  const packages = await loadProjectPackageModule();
  if ((await packages.detectProjectPackageKind(bytes)) === null) {
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
  const convertedRawSnapshots = new Map<string, Blob>();

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

  /** JYB：逐项目导入（默认）或灾难恢复（rev5 7.5）| JYB: per-project import or disaster restore */
  const previewLibraryBackup = async (
    file: File,
    bytes: Blob,
    jyb: Awaited<ReturnType<typeof loadJybModule>>,
  ): Promise<JieyuArchiveImportPreview> => {
    const preview = await withArchivePasswordRetry(file, (password) =>
      jyb.previewJybRestore(bytes, password ? { password } : undefined),
    );
    const projects = preview.projects.map((project) => ({
      id: project.id,
      title: pickProjectTitle(project.title, project.id),
      incoming: project.incoming,
      mediaWithoutBytes: project.mediaWithoutBytes,
      includedBytesCount: project.includedBytesCount,
      aiRows: project.aiRows,
    }));
    return {
      kind: 'jyb',
      manifest: {
        formatVersion: preview.manifest.formatVersion,
        kind: 'jyb',
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
        sourceProjectTitle: projects.map((project) => project.title).join(', '),
        mediaWithoutBytes: preview.mediaWithoutBytes,
        includedBytesCount: preview.includedBytes.count,
        includedBytesTotal: preview.includedBytes.totalBytes,
        skippedLanguageIds: [],
        // 各项目的孤儿行按表合计 | Orphan rows summed per table across projects
        skippedOrphanRows: [
          ...preview.projects
            .flatMap((project) => project.skippedOrphanRows)
            .reduce(
              (sums, { collection, count }) =>
                sums.set(collection, (sums.get(collection) ?? 0) + count),
              new Map<string, number>(),
            ),
        ].map(([collection, count]) => ({ collection, count })),
      },
      libraryBackup: {
        mediaIncluded: preview.manifest.media === 'included',
        projects,
        preferenceKeys: preview.preferences.keys,
        disasterRestore: {
          available: preview.disasterRestore.available,
          ...(preview.disasterRestore.reason ? { reason: preview.disasterRestore.reason } : {}),
          localProjectCount: preview.disasterRestore.localProjectCount,
          bytesAtRiskCount: preview.disasterRestore.bytesAtRisk.length,
        },
      },
    };
  };

  const previewProjectArchiveImport = async (file: File): Promise<JieyuArchiveImportPreview> => {
    const read = await readArchiveFile(file, convertedRawSnapshots);
    if (read.jyb) return previewLibraryBackup(file, read.bytes, read.jyb);
    const { bytes, packages } = await readProjectPackageBytes(file, read.bytes);
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
        skippedOrphanRows: preview.skippedOrphanRows,
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

  const restoreProjectPackage = async (
    file: File,
    alreadyRead?: Blob,
  ): Promise<{ message: string; projectId: string }> => {
    const { bytes, packages } = await readProjectPackageBytes(file, alreadyRead);
    const restored = await withArchivePasswordRetry(file, (password) =>
      packages.restoreProjectPackageAsNew(bytes, password ? { password } : undefined),
    );
    const written = Object.values(restored.importResult.collections).reduce(
      (sum, c) => sum + (c?.written ?? 0),
      0,
    );
    return {
      message: tf(locale, 'transcription.importExport.importDone.restoredAsNew', {
        title: pickProjectTitle(restored.title, restored.projectId),
        written,
      }),
      projectId: restored.projectId,
    };
  };

  const overwriteWithProjectPackage = async (
    file: File,
    targetProjectId: string,
    alreadyRead?: Blob,
  ): Promise<string> => {
    const { bytes, packages } = await readProjectPackageBytes(file, alreadyRead);
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

  /** JYB 导入；返回提示与之后要打开的项目 | JYB import; returns the message and the project to open */
  const importLibraryBackup = async (
    file: File,
    bytes: Blob,
    jyb: Awaited<ReturnType<typeof loadJybModule>>,
    restoreMode: ProjectArchiveRestoreMode,
    selection: ProjectArchiveImportSelection | undefined,
  ): Promise<{ message: string; openTextId: string | null }> => {
    const countWritten = (result: {
      collections: Record<string, { written?: number } | undefined>;
    }) => Object.values(result.collections).reduce((sum, c) => sum + (c?.written ?? 0), 0);
    if (restoreMode === 'disaster-restore') {
      // D7：界面已经做了二次确认 | D7: the UI did the double confirm
      const result = await withArchivePasswordRetry(file, (password) =>
        jyb.disasterRestoreFromJyb(bytes, {
          ...(password ? { password } : {}),
          restorePreferences: selection?.restorePreferences === true,
        }),
      );
      const keepCurrent = activeTextId !== null && result.projectIds.includes(activeTextId);
      const doneMessage = tf(locale, 'transcription.importExport.importDone.jybDisaster', {
        count: result.projectIds.length,
        written: countWritten(result.importResult),
      });
      return {
        message:
          result.restoredPreferenceKeys.length > 0
            ? `${doneMessage} ${tf(locale, 'transcription.importExport.importDone.jybPreferences', {
                count: result.restoredPreferenceKeys.length,
              })}`
            : doneMessage,
        openTextId: keepCurrent ? activeTextId : (result.projectIds[0] ?? null),
      };
    }
    if (selection?.projectIds !== undefined && selection.projectIds.length === 0) {
      throw new Error(t(locale, 'transcription.importExport.jybNoProjectSelected'));
    }
    const result = await withArchivePasswordRetry(file, (password) =>
      jyb.importJybProjectsAsNew(bytes, {
        ...(password ? { password } : {}),
        ...(selection?.projectIds !== undefined ? { projectIds: selection.projectIds } : {}),
        includeProjectAi: selection?.includeProjectAi !== false,
      }),
    );
    return {
      message: tf(locale, 'transcription.importExport.importDone.jybProjects', {
        count: result.projects.length,
        written: countWritten(result.importResult),
      }),
      // 仍停留在当前项目（JY-02）；没有当前项目时打开第一个导入的（RD-3）
      // Stay on the current project (JY-02); with none, open the first imported one (RD-3).
      openTextId:
        resolveCurrentProjectTextId(activeTextId) || (result.projects[0]?.projectId ?? null),
    };
  };

  const importProjectArchive = async (
    file: File,
    strategy: ImportConflictStrategy,
    restoreMode: ProjectArchiveRestoreMode = 'restore-as-new',
    selection?: ProjectArchiveImportSelection,
  ): Promise<boolean> => {
    let resolvedTextId: string | null = activeTextId;

    try {
      const read = await readArchiveFile(file, convertedRawSnapshots);
      if (read.jyb) {
        const { message, openTextId } = await importLibraryBackup(
          file,
          read.bytes,
          read.jyb,
          restoreMode,
          selection,
        );
        resolvedTextId = openTextId;
        if (openTextId && openTextId !== activeTextId) publishActiveProjectTextId(openTextId);
        await loadSnapshot(resolveCurrentProjectTextId(openTextId));
        setSaveState({ kind: 'done', message });
        return true;
      }
      if (restoreMode === 'disaster-restore') {
        throw new Error(t(locale, 'transcription.importExport.overwriteNotAllowed'));
      }
      if (restoreMode === 'overwrite-current') {
        // D5：覆盖只针对当前项目；界面已经做了二次确认 | D5: overwrite targets the current project only
        if (!resolvedTextId) {
          throw new Error(t(locale, 'transcription.importExport.overwriteNotAllowed'));
        }
        const message = await overwriteWithProjectPackage(file, resolvedTextId, read.bytes);
        await loadSnapshot(resolveCurrentProjectTextId(resolvedTextId));
        setSaveState({ kind: 'done', message });
        return true;
      }
      const restored = await restoreProjectPackage(file, read.bytes);
      // 仍停留在当前项目（JY-02）；没有当前项目时切到刚恢复的那一个（RD-3）
      // Stay on the current project (JY-02); with none, switch to the restored one (RD-3).
      let targetTextId = resolveCurrentProjectTextId(resolvedTextId);
      if (targetTextId.length === 0 && restored.projectId) {
        targetTextId = restored.projectId;
        resolvedTextId = targetTextId;
        publishActiveProjectTextId(targetTextId);
      }
      await loadSnapshot(targetTextId);
      setSaveState({ kind: 'done', message: restored.message });
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
