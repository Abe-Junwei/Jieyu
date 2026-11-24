import { useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, type Locale } from '../i18n';

export function DesktopTranscriptionDraftConflictDialog(props: {
  locale: Locale;
  conflict: { unitId: string; currentBody: string; rawInput: string } | null;
  onDiscard: () => Promise<boolean>;
  onResolve: () => Promise<boolean>;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conflict = props.conflict;
  if (conflict === null) return null;
  if (held === conflict.unitId)
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setHeld(null)}>
        {t(props.locale, 'app.desktopTranscription.unsavedDraft')}
      </button>
    );
  const keep = () => setHeld(conflict.unitId);
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalPanel
      isOpen
      compact
      className="desktop-tx-orthography-dialog"
      bodyClassName="desktop-tx-orthography-form"
      title={t(props.locale, 'app.desktopTranscription.unsavedDraft')}
      closeLabel={t(props.locale, 'app.desktopTranscription.draftKeep')}
      onClose={keep}
      footer={
        <>
          <button
            autoFocus
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={keep}
          >
            {t(props.locale, 'app.desktopTranscription.draftKeep')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void run(props.onDiscard)}
          >
            {t(props.locale, 'app.desktopTranscription.draftDiscard')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(props.onResolve)}
          >
            {t(props.locale, 'app.desktopTranscription.draftOverwrite')}
          </button>
        </>
      }
    >
      <p>{t(props.locale, 'app.desktopTranscription.draftConflict')}</p>
      <label>
        {t(props.locale, 'app.desktopTranscription.officialText')}
        <input readOnly value={conflict.currentBody} />
      </label>
      <label>
        {t(props.locale, 'app.desktopTranscription.unsavedDraft')}
        <input readOnly value={conflict.rawInput} />
      </label>
    </ModalPanel>
  );
}
