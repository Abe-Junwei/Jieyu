import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';
import { getDb } from '../db/engine';
import { probeJieyuDatabaseIntegrity } from '../db/dbIntegrityProbe';
import { resolveDbResilienceProbe, type DbResilienceProbeOutcome } from './resolveDbResilienceGate';
import {
  readBackupReminderEnabled,
  recordBackupReminderToastShown,
  shouldFireBackupReminder,
} from '../utils/backupExportReminderState';
import {
  readDbIntegrityProbeEnabled,
  readDbIntegritySessionSkip,
  writeDbIntegritySessionSkip,
} from '../utils/dbIntegrityPreference';
import { dispatchAppGlobalToast } from '../utils/appGlobalToast';
import { JIEYU_DEXIE_DB_NAME } from '../db/engine';
import { shouldAutoRestoreAfterMigrationOpenFailure } from '../db/preMigrationBackup';

const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const E2E_DB_OPEN_FAILED_EVENT = 'jieyu:e2e-db-open-failed';

export type DbIntegrityGateState = DbResilienceProbeOutcome;

export type DbMigrationState = { kind: 'idle' } | { kind: 'migrating'; from: number; to: number };

type PreMigrationRestoreTarget = { from: number; to: number };
type E2eDbOpenFailedDetail = { reason?: string; from?: number; to?: number };
type DbOpenFailedDetail = {
  cause?: unknown;
  recoveryHint?: 'corrupted' | 'blocked' | 'unknown';
};

export type DbIntegrityOverlayHandlers = {
  onReload: () => void;
  onRetry: () => void;
  onContinueSession: () => void;
  onRestoreFromBackup?: (() => Promise<void>) | undefined;
};

function isBrowserAutomationRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

/**
 * Phase F：启动后备份提醒轮询 + 可选数据库自检（F-1 / F-2）。
 */
export function useAppDataResilienceEffects(locale: Locale): {
  dbGate: DbIntegrityGateState;
  dbMigration: DbMigrationState;
  dbOverlayHandlers: DbIntegrityOverlayHandlers;
} {
  const [dbGate, setDbGate] = useState<DbIntegrityGateState>({ kind: 'idle' });
  const [dbMigration, setDbMigration] = useState<DbMigrationState>({ kind: 'idle' });
  const [preMigrationRestoreTarget, setPreMigrationRestoreTarget] =
    useState<PreMigrationRestoreTarget | null>(null);
  const activeMigrationRef = useRef<PreMigrationRestoreTarget | null>(null);

  const runIntegrityProbe = useCallback(async () => {
    if (import.meta.env.MODE === 'test') return;
    if (!readDbIntegrityProbeEnabled()) return;
    if (readDbIntegritySessionSkip()) return;
    const next = await resolveDbResilienceProbe(getDb, probeJieyuDatabaseIntegrity);
    setDbGate(next);
  }, []);

  // ARCH-5: 监听迁移进度事件 | Listen for migration progress events (ARCH-5)
  useEffect(() => {
    const onMigrating = (ev: Event) => {
      const detail = (ev as CustomEvent<{ from: number; to: number }>).detail;
      const next = { from: detail.from, to: detail.to };
      activeMigrationRef.current = next;
      setPreMigrationRestoreTarget(null);
      setDbMigration({ kind: 'migrating', ...next });
    };
    const onDone = () => {
      activeMigrationRef.current = null;
      setDbMigration({ kind: 'idle' });
    };
    const onOpenFailed = (ev: Event) => {
      const activeMigration = activeMigrationRef.current;
      if (!activeMigration) return;
      const detail = (ev as CustomEvent<DbOpenFailedDetail>).detail;
      if (detail?.recoveryHint === 'blocked') return;
      const cause =
        detail && typeof detail === 'object' && 'cause' in detail ? detail.cause : detail;
      if (!shouldAutoRestoreAfterMigrationOpenFailure(cause)) return;
      setPreMigrationRestoreTarget(activeMigration);
    };

    window.addEventListener('jieyu:db-migrating', onMigrating);
    window.addEventListener('jieyu:db-migration-done', onDone);
    window.addEventListener('jieyu:db-open-failed', onOpenFailed);
    return () => {
      window.removeEventListener('jieyu:db-migrating', onMigrating);
      window.removeEventListener('jieyu:db-migration-done', onDone);
      window.removeEventListener('jieyu:db-open-failed', onOpenFailed);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    void runIntegrityProbe();
  }, [runIntegrityProbe]);

  useEffect(() => {
    if (!isBrowserAutomationRuntime()) return;

    const onE2eOpenFailed = (ev: Event) => {
      const detail = (ev as CustomEvent<E2eDbOpenFailedDetail>).detail ?? {};
      if (typeof detail.from === 'number' && typeof detail.to === 'number') {
        setPreMigrationRestoreTarget({ from: detail.from, to: detail.to });
      }
      setDbMigration({ kind: 'idle' });
      setDbGate({
        kind: 'failed',
        failureKind: 'open',
        reason: detail.reason?.trim() || 'E2E simulated IndexedDB open failure',
      });
    };

    window.addEventListener(E2E_DB_OPEN_FAILED_EVENT, onE2eOpenFailed);
    document.documentElement.dataset.jieyuE2eDbOpenHook = '1';
    return () => {
      window.removeEventListener(E2E_DB_OPEN_FAILED_EVENT, onE2eOpenFailed);
      delete document.documentElement.dataset.jieyuE2eDbOpenHook;
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    if (!readBackupReminderEnabled()) return;

    const tick = () => {
      if (!shouldFireBackupReminder()) return;
      const msg = getAppDataResilienceMessages(locale);
      dispatchAppGlobalToast({
        message: msg.backupReminderToast,
        variant: 'info',
        autoDismissMs: 14_000,
      });
      recordBackupReminderToastShown();
    };

    tick();
    const id = window.setInterval(tick, BACKUP_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [locale]);

  const onReload = useCallback(() => {
    window.location.reload();
  }, []);

  const onRetry = useCallback(() => {
    setDbGate({ kind: 'idle' });
    void runIntegrityProbe();
  }, [runIntegrityProbe]);

  const onContinueSession = useCallback(() => {
    writeDbIntegritySessionSkip();
    setDbGate({ kind: 'idle' });
  }, []);

  const onRestoreFromBackup = useCallback(async () => {
    if (!preMigrationRestoreTarget) {
      dispatchAppGlobalToast({
        message: getAppDataResilienceMessages(locale).dbOpenRestoreNotFound,
        variant: 'error',
      });
      return;
    }
    try {
      const { getPreMigrationBackupForMigration, restorePreMigrationBackup } =
        await import('../db/preMigrationBackup');
      const backup = await getPreMigrationBackupForMigration(
        JIEYU_DEXIE_DB_NAME,
        preMigrationRestoreTarget.from,
        preMigrationRestoreTarget.to,
      );
      if (!backup) {
        dispatchAppGlobalToast({
          message: getAppDataResilienceMessages(locale).dbOpenRestoreNotFound,
          variant: 'error',
        });
        return;
      }
      const result = await restorePreMigrationBackup(backup.id);
      if (result === 'restored') {
        dispatchAppGlobalToast({
          message: getAppDataResilienceMessages(locale).dbOpenRestoreSuccess,
          variant: 'success',
        });
        window.location.reload();
      } else {
        dispatchAppGlobalToast({
          message: getAppDataResilienceMessages(locale).dbOpenRestoreNotFound,
          variant: 'error',
        });
      }
    } catch {
      dispatchAppGlobalToast({
        message: getAppDataResilienceMessages(locale).dbOpenRestoreFailed,
        variant: 'error',
      });
    }
  }, [locale, preMigrationRestoreTarget]);

  return {
    dbGate,
    dbMigration,
    dbOverlayHandlers: {
      onReload,
      onRetry,
      onContinueSession,
      ...(preMigrationRestoreTarget ? { onRestoreFromBackup } : {}),
    },
  };
}
