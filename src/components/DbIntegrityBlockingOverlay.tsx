import { useRef } from 'react';
import type { ReactElement } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';
import type { DbResilienceFailureKind } from '../hooks/resolveDbResilienceGate';
import { useFocusTrap } from '../hooks/ui/useFocusTrap';

export type DbIntegrityBlockingOverlayProps = {
  locale: Locale;
  failureKind: DbResilienceFailureKind;
  reason: string;
  onReload: () => void;
  onRetry: () => void;
  onContinueSession: () => void;
  onRestoreFromBackup?: (() => Promise<void>) | undefined;
};

/**
 * F-2：数据库轻量自检失败时的可恢复遮罩（不卸载路由，仅阻断交互）。
 * Recoverable full-screen prompt when boot-time DB integrity probe fails (F-2).
 */
export function DbIntegrityBlockingOverlay(props: DbIntegrityBlockingOverlayProps): ReactElement {
  const msg = getAppDataResilienceMessages(props.locale);
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, true);
  const isOpenFailure = props.failureKind === 'open';
  const title = isOpenFailure ? msg.dbOpenTitle : msg.dbIntegrityTitle;
  const intro = isOpenFailure ? msg.dbOpenIntro : msg.dbIntegrityIntro;
  return (
    <div
      ref={overlayRef}
      className="db-integrity-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="db-integrity-overlay-title"
      tabIndex={-1}
    >
      <div className="db-integrity-overlay-panel">
        <h2 id="db-integrity-overlay-title" className="db-integrity-overlay-title">
          {title}
        </h2>
        <p className="db-integrity-overlay-intro">{intro}</p>
        {isOpenFailure ? <p className="db-integrity-overlay-intro">{msg.dbOpenRecovery}</p> : null}
        <p className="db-integrity-overlay-reason">
          <strong>{msg.dbIntegrityReason}</strong> <code>{props.reason}</code>
        </p>
        <div className="db-integrity-overlay-actions">
          {isOpenFailure && props.onRestoreFromBackup ? (
            <button
              type="button"
              className="settings-primary-btn"
              onClick={() => {
                void props.onRestoreFromBackup!();
              }}
            >
              {msg.dbOpenRestoreFromBackup}
            </button>
          ) : null}
          <button type="button" className="settings-danger-btn" onClick={props.onReload}>
            {msg.dbIntegrityReload}
          </button>
          <button type="button" className="settings-link-btn" onClick={props.onRetry}>
            {msg.dbIntegrityRetry}
          </button>
          {isOpenFailure ? null : (
            <button type="button" className="settings-link-btn" onClick={props.onContinueSession}>
              {msg.dbIntegrityContinue}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
