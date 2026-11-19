import { ModalPanel } from '../components/ui/ModalPanel';
import { t, useLocale } from '../i18n';

/** Shown when leaving would drop an unsaved text draft: retry, discard, or stay. */
export function DesktopDraftLeaveDialog(props: {
  failed: boolean;
  unknown?: boolean;
  saving: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const locale = useLocale();
  const message = props.unknown
    ? t(locale, 'app.desktopRead.saveTextUnknown')
    : props.failed
      ? t(locale, 'app.desktopRead.saveTextFailed')
      : null;
  return (
    <ModalPanel
      isOpen
      className="desktop-draft-leave"
      compact
      hideCloseButton
      closeDisabled={props.saving}
      onClose={() => {
        if (!props.saving) props.onStay();
      }}
      title={t(locale, 'app.desktopRead.leaveTitle')}
      footer={
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!props.canRetry || props.saving}
            onClick={props.onRetry}
          >
            {t(locale, 'app.desktopRead.leaveRetry')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={props.saving || props.unknown}
            onClick={props.onDiscard}
          >
            {t(locale, 'app.desktopRead.leaveDiscard')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={props.saving}
            onClick={props.onStay}
          >
            {t(locale, 'app.desktopRead.leaveStay')}
          </button>
        </>
      }
    >
      {message === null ? null : <p>{message}</p>}
    </ModalPanel>
  );
}
