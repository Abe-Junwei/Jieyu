import { t, tf, useLocale } from '../../../i18n';

type TrackFocusToolbarControlsProps = {
  trackModeLabel?: string;
  laneLockCount?: number;
  lockConflictCount?: number;
  lockConflictSpeakerNames?: string[];
  trackConflictLabel?: string;
  onOpenLockConflictDetails?: () => void;
  speakerFocusMode?: 'all' | 'focus-soft' | 'focus-hard';
  speakerFocusTargetName?: string;
  speakerFocusOptions?: Array<{ key: string; name: string }>;
  speakerFocusTargetKey?: string;
  onSpeakerFocusTargetKeyChange?: (speakerKey: string) => void;
  onCycleSpeakerFocusMode?: () => void;
};

export function TrackFocusToolbarControls({
  trackModeLabel,
  laneLockCount,
  lockConflictCount,
  lockConflictSpeakerNames,
  trackConflictLabel,
  onOpenLockConflictDetails,
  speakerFocusMode,
  speakerFocusTargetName,
  speakerFocusOptions,
  speakerFocusTargetKey,
  onSpeakerFocusTargetKeyChange,
  onCycleSpeakerFocusMode,
}: TrackFocusToolbarControlsProps) {
  const locale = useLocale();
  const speakerFocusLabel = speakerFocusMode === 'focus-hard'
    ? tf(locale, 'transcription.trackFocus.mode.hard', { target: speakerFocusTargetName ?? t(locale, 'transcription.trackFocus.targetDefault') })
    : speakerFocusMode === 'focus-soft'
      ? tf(locale, 'transcription.trackFocus.mode.soft', { suffix: speakerFocusTargetName ? `·${speakerFocusTargetName}` : '' })
      : t(locale, 'transcription.trackFocus.mode.all');

  if (!trackModeLabel && !onCycleSpeakerFocusMode && !(lockConflictCount != null && lockConflictCount > 0)) {
    return null;
  }

  return (
    <div className="track-focus-toolbar-controls">
      {trackModeLabel && (
        <span
          className="toolbar-track-mode-badge"
          title={tf(locale, 'transcription.trackFocus.trackModeTitle', { mode: trackModeLabel })}
        >
          {tf(locale, 'transcription.trackFocus.trackModeBadge', { mode: trackModeLabel, count: laneLockCount ?? 0 })}
        </span>
      )}
      {lockConflictCount != null && lockConflictCount > 0 && (
        <button
          type="button"
          className="toolbar-lock-conflict-badge"
          onClick={onOpenLockConflictDetails}
          title={tf(locale, 'transcription.trackFocus.conflictTitle', {
            label: trackConflictLabel ?? t(locale, 'transcription.trackFocus.conflictDefaultLabel'),
            count: lockConflictCount,
            speakers: (lockConflictSpeakerNames ?? []).join('、') || t(locale, 'transcription.trackFocus.unknownSpeaker'),
          })}
        >
          {tf(locale, 'transcription.trackFocus.conflictBadge', { count: lockConflictCount })}
        </button>
      )}
      {onCycleSpeakerFocusMode && (
        <>
          <button
            type="button"
            className={`toolbar-focus-mode-badge${speakerFocusMode && speakerFocusMode !== 'all' ? ' toolbar-focus-mode-badge-active' : ''}`}
            title={tf(locale, 'transcription.trackFocus.focusTitle', { label: speakerFocusLabel })}
            onClick={onCycleSpeakerFocusMode}
          >
            {tf(locale, 'transcription.trackFocus.focusBadge', { label: speakerFocusLabel })}
          </button>
          {onSpeakerFocusTargetKeyChange && (
            <select
              className="toolbar-focus-target-select"
              title={t(locale, 'transcription.trackFocus.selectTitle')}
              value={speakerFocusTargetKey ?? ''}
              onChange={(event) => onSpeakerFocusTargetKeyChange(event.target.value)}
            >
              <option value="">{t(locale, 'transcription.trackFocus.followSelected')}</option>
              {(speakerFocusOptions ?? []).map((option) => (
                <option key={option.key} value={option.key}>{option.name}</option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}