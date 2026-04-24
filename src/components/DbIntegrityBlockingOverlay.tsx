import type { ReactElement } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/appDataResilienceMessages';

export type DbIntegrityBlockingOverlayProps = {
  locale: Locale;
  reason: string;
  onReload: () => void;
  onRetry: () => void;
  onContinueSession: () => void;
};

/**
 * F-2：数据库轻量自检失败时的可恢复遮罩（不卸载路由，仅阻断交互）。
 * Recoverable full-screen prompt when boot-time DB integrity probe fails (F-2).
 */
export function DbIntegrityBlockingOverlay(props: DbIntegrityBlockingOverlayProps): ReactElement {
  const msg = getAppDataResilienceMessages(props.locale);
  return (
    <div
      className="db-integrity-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="db-integrity-overlay-title"
    >
      <div className="db-integrity-overlay-panel">
        <h2 id="db-integrity-overlay-title" className="db-integrity-overlay-title">
          {msg.dbIntegrityTitle}
        </h2>
        <p className="db-integrity-overlay-intro">{msg.dbIntegrityIntro}</p>
        <p className="db-integrity-overlay-reason">
          <strong>{msg.dbIntegrityReason}</strong>
          {' '}
          <code>{props.reason}</code>
        </p>
        <div className="db-integrity-overlay-actions">
          <button type="button" className="settings-danger-btn" onClick={props.onReload}>
            {msg.dbIntegrityReload}
          </button>
          <button type="button" className="settings-link-btn" onClick={props.onRetry}>
            {msg.dbIntegrityRetry}
          </button>
          <button type="button" className="settings-link-btn" onClick={props.onContinueSession}>
            {msg.dbIntegrityContinue}
          </button>
        </div>
      </div>
    </div>
  );
}
