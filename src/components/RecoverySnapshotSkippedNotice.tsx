import { useSyncExternalStore } from 'react';
import { t, tf } from '../i18n';
import type { Locale } from '../i18n';
import {
  dismissRecoverySnapshotSkip,
  getRecoverySnapshotSkip,
  subscribeRecoverySnapshotSkip,
} from '../services/SnapshotService';

const MIB = 1024 * 1024;

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

/**
 * 恢复快照因超过上限被跳过时的提示（方案 8.3 / T43）。
 * Notice shown when the recovery snapshot was skipped for exceeding the cap (plan 8.3 / T43).
 */
export function RecoverySnapshotSkippedNotice({ locale }: { locale: Locale }) {
  const skip = useSyncExternalStore(subscribeRecoverySnapshotSkip, getRecoverySnapshotSkip);
  if (!skip) return null;
  return (
    <div className="app-recovery-banner" role="status" data-testid="recovery-snapshot-skipped">
      <span className="app-recovery-banner__text">
        {tf(locale, 'transcription.recovery.skipped', {
          size: formatMib(skip.bytes),
          limit: formatMib(skip.maxBytes).replace(/\.0$/, ''),
        })}
        {skip.staleCleared ? <> {t(locale, 'transcription.recovery.skippedStaleCleared')}</> : null}
      </span>
      <button
        type="button"
        className="app-recovery-banner__button app-recovery-banner__button--dismiss"
        onClick={dismissRecoverySnapshotSkip}
      >
        {t(locale, 'transcription.recovery.skippedDismiss')}
      </button>
    </div>
  );
}
