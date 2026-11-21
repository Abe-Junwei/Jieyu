import { ModalPanel } from '../components/ui/ModalPanel';
import { t, useLocale } from '../i18n';

/** Ask before a navigation or a fold would drop an open recording. */
export function DesktopOralLeaveDialog(props: {
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const locale = useLocale();
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
      title={t(locale, 'app.desktopTranscription.oralLeaveTitle')}
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={props.onSave}>
            {t(locale, 'app.desktopTranscription.oralLeaveSave')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={props.saving}
            onClick={props.onDiscard}
          >
            {t(locale, 'app.desktopTranscription.oralLeaveDiscard')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={props.onStay}>
            {t(locale, 'app.desktopTranscription.oralLeaveStay')}
          </button>
        </>
      }
    >
      {null}
    </ModalPanel>
  );
}
