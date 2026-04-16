import { t, tf } from '../i18n';
import type { Locale } from '../i18n';

type Props = {
  locale: Locale;
  recoveryAvailable: boolean;
  recoveryDiffSummary: { units: number; translations: number; layers: number } | null;
  onApply: () => void;
  onDismiss: () => void;
};

export function RecoveryBanner({
  locale,
  recoveryAvailable,
  recoveryDiffSummary,
  onApply,
  onDismiss,
}: Props) {
  if (!recoveryAvailable) {
    return null;
  }

  return (
    <div className="app-recovery-banner">
      <span className="app-recovery-banner__text">
        {t(locale, 'transcription.recovery.prompt')}
        {recoveryDiffSummary && (
          <>
            {' '}
            {tf(locale, 'transcription.recovery.summary', {
              units: recoveryDiffSummary.units,
              translations: recoveryDiffSummary.translations,
              layers: recoveryDiffSummary.layers,
            })}
          </>
        )}
      </span>
      <button type="button" className="app-recovery-banner__button app-recovery-banner__button--apply" onClick={onApply}>
        {t(locale, 'transcription.recovery.apply')}
      </button>
      <button type="button" className="app-recovery-banner__button app-recovery-banner__button--dismiss" onClick={onDismiss}>
        {t(locale, 'transcription.recovery.dismiss')}
      </button>
    </div>
  );
}
