import { t, useLocale } from '../i18n';

/** Shown when leaving would drop an unsaved text draft: retry, discard, or stay. */
export function DesktopDraftLeaveDialog(props: {
  failed: boolean;
  saving: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const locale = useLocale();
  return (
    <div role="dialog" aria-labelledby="desktop-draft-leave-title">
      <h2 id="desktop-draft-leave-title">{t(locale, 'app.desktopRead.leaveTitle')}</h2>
      {props.failed ? <p>{t(locale, 'app.desktopRead.saveTextFailed')}</p> : null}
      <button type="button" disabled={!props.canRetry || props.saving} onClick={props.onRetry}>
        {t(locale, 'app.desktopRead.leaveRetry')}
      </button>
      <button type="button" disabled={props.saving} onClick={props.onDiscard}>
        {t(locale, 'app.desktopRead.leaveDiscard')}
      </button>
      <button type="button" disabled={props.saving} onClick={props.onStay}>
        {t(locale, 'app.desktopRead.leaveStay')}
      </button>
    </div>
  );
}
