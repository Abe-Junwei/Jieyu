import { tf, t, useLocale } from '../i18n';
import { canConfirmManuscriptDelete } from './desktopManuscriptDelete';

export function DesktopManuscriptDeleteDialog(props: {
  preview: {
    title: Record<string, string>;
    mediaRelpath: string;
    running: boolean;
    alreadyDeleted: boolean;
  };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const locale = useLocale();
  const title = props.preview.title.zh ?? props.preview.title.default ?? '';
  const allowed = canConfirmManuscriptDelete(props.preview);
  return (
    <div role="dialog" aria-labelledby="desktop-manuscript-delete-title">
      <h2 id="desktop-manuscript-delete-title">{t(locale, 'app.desktopRead.deleteTitle')}</h2>
      <p>{title}</p>
      <p>{tf(locale, 'app.desktopRead.deleteRecording', { path: props.preview.mediaRelpath })}</p>
      {props.preview.running ? <p>{t(locale, 'app.desktopRead.deleteRunning')}</p> : null}
      {props.preview.alreadyDeleted ? <p>{t(locale, 'app.desktopRead.deleteAlready')}</p> : null}
      <button type="button" onClick={props.onCancel}>
        {t(locale, 'app.desktopRead.deleteCancel')}
      </button>
      <button type="button" disabled={!allowed} onClick={props.onConfirm}>
        {t(locale, 'app.desktopRead.deleteConfirm')}
      </button>
    </div>
  );
}
