import { t, tf } from '../i18n';
import type { Locale } from '../i18n';

type Props = {
  locale: Locale;
  recoveryAvailable: boolean;
  recoveryDiffSummary: { utterances: number; translations: number; layers: number } | null;
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
    <div style={{ background: '#fef3c7', borderBottom: '1px solid #f59e0b', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
      <span>
        {t(locale, 'transcription.recovery.prompt')}
        {recoveryDiffSummary && (
          <>
            {' '}
            {tf(locale, 'transcription.recovery.summary', {
              utterances: recoveryDiffSummary.utterances,
              translations: recoveryDiffSummary.translations,
              layers: recoveryDiffSummary.layers,
            })}
          </>
        )}
      </span>
      <button type="button" style={{ padding: '2px 10px', borderRadius: 4, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }} onClick={onApply}>
        {t(locale, 'transcription.recovery.apply')}
      </button>
      <button type="button" style={{ padding: '2px 10px', borderRadius: 4, background: '#e5e7eb', border: 'none', cursor: 'pointer' }} onClick={onDismiss}>
        {t(locale, 'transcription.recovery.dismiss')}
      </button>
    </div>
  );
}
