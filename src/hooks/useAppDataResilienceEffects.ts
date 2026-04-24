import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/appDataResilienceMessages';
import { getDb } from '../db/engine';
import { probeJieyuDatabaseIntegrity } from '../db/dbIntegrityProbe';
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

export type DbIntegrityGateState =
  | { kind: 'idle' }
  | { kind: 'failed'; reason: string };

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
  dbOverlayHandlers: DbIntegrityOverlayHandlers;
} {
  const [dbGate, setDbGate] = useState<DbIntegrityGateState>({ kind: 'idle' });

  const runIntegrityProbe = useCallback(async () => {
    if (import.meta.env.MODE === 'test') return;
    if (!readDbIntegrityProbeEnabled()) return;
    if (readDbIntegritySessionSkip()) return;
    try {
      const db = await getDb();
      const result = await probeJieyuDatabaseIntegrity(db);
      setDbGate(result.ok ? { kind: 'idle' } : { kind: 'failed', reason: result.reason });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setDbGate({ kind: 'failed', reason });
    }
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
    dbOverlayHandlers: { onReload, onRetry, onContinueSession },
  };
}
