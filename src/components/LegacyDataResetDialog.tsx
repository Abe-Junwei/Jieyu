import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Locale } from '../i18n';
import { getAppDataResilienceMessages } from '../i18n/messages';
import { useFocusTrap } from '../hooks/ui/useFocusTrap';
import {
  detectLegacyLocalData,
  wipeLegacyLocalData,
  type LegacyDataDetection,
  type LegacyDataWipeResult,
} from '../db/legacyDataReset';

export type LegacyDataResetDialogProps = {
  locale: Locale;
  detect?: () => Promise<LegacyDataDetection>;
  wipe?: () => Promise<LegacyDataWipeResult>;
  onWiped?: (result: LegacyDataWipeResult) => void;
};

type DialogState =
  | { kind: 'hidden' }
  | { kind: 'prompt'; detection: LegacyDataDetection }
  | { kind: 'wiping'; detection: LegacyDataDetection }
  | { kind: 'failed'; detection: LegacyDataDetection; failed: string[] };

function reloadPage(): void {
  window.location.reload();
}

/**
 * D10：检测到 2A 之前的本地数据时提示，确认后只删除 8.1 列出的库与键。
 * D10: prompt when pre-2A local data exists; on confirm delete only the 8.1-listed DBs and keys.
 */
export function LegacyDataResetDialog(props: LegacyDataResetDialogProps): ReactElement | null {
  const {
    detect = detectLegacyLocalData,
    wipe = wipeLegacyLocalData,
    onWiped = reloadPage,
  } = props;
  const msg = getAppDataResilienceMessages(props.locale);
  const [state, setState] = useState<DialogState>({ kind: 'hidden' });
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, state.kind !== 'hidden');

  useEffect(() => {
    let cancelled = false;
    void detect()
      .then((detection) => {
        if (!cancelled && detection.detected) setState({ kind: 'prompt', detection });
      })
      .catch(() => {
        // 检测失败时不打扰用户 | stay silent when detection fails
      });
    return () => {
      cancelled = true;
    };
  }, [detect]);

  const onConfirm = useCallback(async () => {
    if (state.kind !== 'prompt' && state.kind !== 'failed') return;
    const detection = state.detection;
    setState({ kind: 'wiping', detection });
    const result = await wipe();
    if (result.failedDatabases.length > 0) {
      setState({ kind: 'failed', detection, failed: result.failedDatabases });
      return;
    }
    setState({ kind: 'hidden' });
    onWiped(result);
  }, [onWiped, state, wipe]);

  const onDecline = useCallback(() => {
    // 拒绝：本次会话不再提示；旧库原样保留，下次启动再提示 | decline: hide for this session only
    setState({ kind: 'hidden' });
  }, []);

  if (state.kind === 'hidden') return null;
  const { detection } = state;
  const busy = state.kind === 'wiping';

  return (
    <div
      ref={panelRef}
      className="legacy-data-reset-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="legacy-data-reset-title"
      aria-describedby="legacy-data-reset-intro"
      data-testid="legacy-data-reset-dialog"
      tabIndex={-1}
    >
      <div className="legacy-data-reset-dialog-panel">
        <h2 id="legacy-data-reset-title" className="legacy-data-reset-dialog-title">
          {msg.legacyResetTitle}
        </h2>
        <p id="legacy-data-reset-intro" className="legacy-data-reset-dialog-text">
          {msg.legacyResetIntro}
        </p>
        <p className="legacy-data-reset-dialog-text">{msg.legacyResetDatabasesLabel}</p>
        <ul className="legacy-data-reset-dialog-list" data-testid="legacy-data-reset-db-list">
          {detection.databases.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="legacy-data-reset-dialog-text">{msg.legacyResetKeepNote}</p>
        {state.kind === 'failed' ? (
          <p className="legacy-data-reset-dialog-error" role="status">
            {msg.legacyResetFailed} <code>{state.failed.join(', ')}</code>
          </p>
        ) : null}
        <div className="legacy-data-reset-dialog-actions">
          <button
            type="button"
            className="settings-danger-btn"
            disabled={busy}
            onClick={() => {
              void onConfirm();
            }}
          >
            {busy ? msg.legacyResetWorking : msg.legacyResetConfirm}
          </button>
          <button type="button" className="settings-link-btn" disabled={busy} onClick={onDecline}>
            {msg.legacyResetDecline}
          </button>
        </div>
      </div>
    </div>
  );
}
