import { useCallback, useEffect, useState } from 'react';
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

const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type DbIntegrityGateState = DbResilienceProbeOutcome;

export type DbMigrationState =
  | { kind: 'idle' }
  | { kind: 'migrating'; from: number; to: number };

export type DbIntegrityOverlayHandlers = {
  onReload: () => void;
  onRetry: () => void;
  onContinueSession: () => void;
};

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

  const runIntegrityProbe = useCallback(async () => {
    if (import.meta.env.MODE === 'test') return;
    if (!readDbIntegrityProbeEnabled()) return;
    if (readDbIntegritySessionSkip()) return;
    const next = await resolveDbResilienceProbe(getDb, probeJieyuDatabaseIntegrity);
    setDbGate(next);
  }, []);

  // ARCH-5: 监听迁移进度事件 | Listen for migration progress events (ARCH-5)
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;

    const onMigrating = (ev: Event) => {
      const detail = (ev as CustomEvent<{ from: number; to: number }>).detail;
      setDbMigration({ kind: 'migrating', from: detail.from, to: detail.to });
    };
    const onDone = () => {
      setDbMigration({ kind: 'idle' });
    };

    window.addEventListener('jieyu:db-migrating', onMigrating);
    window.addEventListener('jieyu:db-migration-done', onDone);
    return () => {
      window.removeEventListener('jieyu:db-migrating', onMigrating);
      window.removeEventListener('jieyu:db-migration-done', onDone);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    void runIntegrityProbe();
  }, [runIntegrityProbe]);

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

  return {
    dbGate,
    dbMigration,
    dbOverlayHandlers: { onReload, onRetry, onContinueSession },
  };
}
