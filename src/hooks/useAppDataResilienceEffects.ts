import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';
import { getDb } from '../db/engine';
import { probeJieyuDatabaseIntegrity } from '../db/dbIntegrityProbe';
import {
  mergeIntegrityProbeGate,
  resolveDbResilienceProbe,
  type DbResilienceProbeOutcome,
} from './resolveDbResilienceGate';
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
const E2E_DB_OPEN_FAILED_EVENT = 'jieyu:e2e-db-open-failed';

export type DbIntegrityGateState = DbResilienceProbeOutcome;

type E2eDbOpenFailedDetail = { reason?: string };

export type DbIntegrityOverlayHandlers = {
  onReload: () => void;
  onRetry: () => void;
  onContinueSession: () => void;
};

function isBrowserAutomationRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

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
    const next = await resolveDbResilienceProbe(getDb, probeJieyuDatabaseIntegrity);
    setDbGate((current) => mergeIntegrityProbeGate(current, next));
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    if (isBrowserAutomationRuntime()) return;
    void runIntegrityProbe();
  }, [runIntegrityProbe]);

  useEffect(() => {
    if (!isBrowserAutomationRuntime()) return;

    const onE2eOpenFailed = (ev: Event) => {
      const detail = (ev as CustomEvent<E2eDbOpenFailedDetail>).detail ?? {};
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

  return {
    dbGate,
    dbOverlayHandlers: {
      onReload,
      onRetry,
      onContinueSession,
    },
  };
}
