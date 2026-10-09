/**
 * 整库备份 JYB 的导出入口（rev5 D1、7.5；第 3 批第三个切片）。导出前确认、可选加密，必须写明
 * 带不带音频；结果用提示条告诉用户。
 * Export entry for the whole-library JYB backup (rev5 D1, 7.5; batch 3, third slice): confirm,
 * optional encryption, with or without audio stated explicitly; the result is shown as a toast.
 */
import { requestPersistOnGesture } from '../../utils/storageDurability';
import { useCallback } from 'react';
import { t, tf, type Locale } from '../../i18n';
import { createLogger } from '../../observability/logger';
import { recordFullProjectArchiveExportCompleted } from '../../utils/backupExportReminderState';

const log = createLogger('useLibraryBackupExport');

type Notify = (message: string, variant: 'success' | 'error') => void;

/** 确认导出与可选加密；取消时为 null | Confirm and optional encryption; null when cancelled */
function promptJybExportOptions(
  locale: Locale,
  notify: Notify,
): { encryption?: { password: string; passwordHint?: string } } | null {
  if (typeof window === 'undefined') return {};
  if (
    !window.confirm(tf(locale, 'transcription.importExport.archiveExportConfirm', { kind: 'JYB' }))
  ) {
    return null;
  }
  if (!window.confirm(t(locale, 'transcription.importExport.archiveExportEncryptPrompt')))
    return {};
  const passwordInput = window.prompt(
    t(locale, 'transcription.importExport.archivePasswordPrompt'),
  );
  if (passwordInput == null) return null;
  const password = passwordInput.trim();
  if (!password) {
    notify(t(locale, 'transcription.importExport.archivePasswordRequired'), 'error');
    return null;
  }
  const hint = window
    .prompt(t(locale, 'transcription.importExport.archivePasswordHintPrompt'))
    ?.trim();
  return { encryption: { password, ...(hint ? { passwordHint: hint } : {}) } };
}

export function useLibraryBackupExport(input: { locale: Locale; notify: Notify }) {
  const { locale, notify } = input;
  return useCallback(
    async (includeMedia: boolean): Promise<void> => {
      void requestPersistOnGesture('save');
      const options = promptJybExportOptions(locale, notify);
      if (options === null) return;
      const jyb = await import('../../services/JybService');
      try {
        const stamp = new Date().toISOString().slice(0, 10);
        await jyb.downloadDatabaseJyb(`jieyu-library-${stamp}`, { includeMedia, ...options });
        recordFullProjectArchiveExportCompleted();
        notify(
          options.encryption
            ? tf(locale, 'transcription.importExport.exportDone.archiveEncrypted', { kind: 'JYB' })
            : t(
                locale,
                includeMedia
                  ? 'transcription.importExport.exportDone.jybWithMedia'
                  : 'transcription.importExport.exportDone.jybWithoutMedia',
              ),
          'success',
        );
      } catch (error) {
        log.error('JYB export failed', { error });
        const { ProjectPackageTooLargeError } =
          await import('../../services/projectPackageService');
        notify(
          error instanceof ProjectPackageTooLargeError
            ? tf(locale, 'transcription.importExport.jybTooLarge', {
                sizeMb: Math.ceil(error.totalBytes / (1024 * 1024)),
                limitMb: Math.floor(error.limitBytes / (1024 * 1024)),
              })
            : tf(locale, 'transcription.importExport.exportFailed', {
                message: error instanceof Error ? error.message : String(error),
              }),
          'error',
        );
      }
    },
    [locale, notify],
  );
}
