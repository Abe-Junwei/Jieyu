import type { Locale } from '../../i18n';
import { t, tf } from '../../i18n';
import { formatTime } from '../../utils/transcriptionFormatters';
import { shouldShowLogicalAxisLengthOnAxisStrip, type TimelineAxisMediaHint } from '../../utils/timelineAxisStatus';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PanelButton } from '../ui/PanelButton';
import { JIEYU_MATERIAL_PANEL } from '../../utils/jieyuMaterialIcon';
export type TimelineAxisStatusStripProps = {
  locale: Locale;
  hint: TimelineAxisMediaHint;
  logicalDurationSec?: number;
  timelineMode?: string | null;
  /** 语段超出声学可播时：显式扩展逻辑轴（仅 metadata，不改句段时间） */
  expandLogical?: { busy: boolean; onPress: () => void };
};

export function TimelineAxisStatusStrip({
  locale,
  hint,
  logicalDurationSec,
  timelineMode,
  expandLogical,
}: TimelineAxisStatusStripProps) {
  if (hint.kind === 'hidden') return null;

  const showLogical = shouldShowLogicalAxisLengthOnAxisStrip({
    ...(typeof logicalDurationSec === 'number' ? { logicalDurationSec } : {}),
    ...(timelineMode !== undefined ? { timelineMode } : {}),
    hintKind: hint.kind,
  });

  const mediaLine = (() => {
    switch (hint.kind) {
      case 'acoustic_decoding':
        return (
          <span className="timeline-axis-status-strip__item timeline-axis-status-strip--info">
            <MaterialSymbol name="hourglass_empty" className={`timeline-axis-status-strip__icon ${JIEYU_MATERIAL_PANEL}`} />
            {t(locale, 'transcription.timelineAxisStatus.acousticDecoding')}
          </span>
        );
      case 'no_playable_media':
        return (
          <span className="timeline-axis-status-strip__item timeline-axis-status-strip__no-playable-media">
            <span className="timeline-axis-status-strip__no-playable-media-main">
              <MaterialSymbol
                name="link_off"
                className={`timeline-axis-status-strip__icon ${JIEYU_MATERIAL_PANEL}`}
              />
              {t(locale, 'transcription.timelineAxisStatus.noAcousticBlob')}
            </span>
          </span>
        );
      case 'duration_short':
        return (
          <span className="timeline-axis-status-strip__item timeline-axis-status-strip--warn timeline-axis-status-strip__duration-short">
            <MaterialSymbol name="warning" className={`timeline-axis-status-strip__icon ${JIEYU_MATERIAL_PANEL}`} />
            {tf(locale, 'transcription.timelineAxisStatus.segmentsBeyondAcoustic', {
              acoustic: formatTime(hint.acousticSec),
              maxEnd: formatTime(hint.maxUnitEndSec),
            })}
            {expandLogical ? (
              <PanelButton
                variant="ghost"
                size="sm"
                className="timeline-axis-status-strip__action"
                disabled={expandLogical.busy}
                onClick={() => { expandLogical.onPress(); }}
              >
                {expandLogical.busy
                  ? t(locale, 'transcription.timelineAxisStatus.expandLogicalBusy')
                  : t(locale, 'transcription.timelineAxisStatus.expandLogicalButton')}
              </PanelButton>
            ) : null}
          </span>
        );
      case 'acoustic_ok':
        return null;
      default:
        return null;
    }
  })();

  const logicalLine = showLogical ? (
    <span className="timeline-axis-status-strip__item">
      <MaterialSymbol name="straighten" className={`timeline-axis-status-strip__icon ${JIEYU_MATERIAL_PANEL}`} />
      {tf(locale, 'transcription.timelineAxisStatus.logicalAxisLength', {
        duration: formatTime(logicalDurationSec as number),
      })}
    </span>
  ) : null;

  if (!mediaLine && !logicalLine) return null;

  return (
    <div className="timeline-axis-status-strip" role="status" aria-live="polite">
      {mediaLine}
      {logicalLine}
    </div>
  );
}
