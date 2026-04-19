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
  /** 无声学可播时：触发隐藏 file input（与工具栏导入同一入口） */
  importAcoustic?: { onPress: () => void };
};

export function TimelineAxisStatusStrip({
  locale,
  hint,
  logicalDurationSec,
  timelineMode,
  expandLogical,
  importAcoustic,
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
                name={hint.sub === 'placeholder' ? 'schedule' : 'link_off'}
                className={`timeline-axis-status-strip__icon ${JIEYU_MATERIAL_PANEL}`}
              />
              {hint.sub === 'placeholder'
                ? t(locale, 'transcription.timelineAxisStatus.placeholderAxis')
                : t(locale, 'transcription.timelineAxisStatus.noAcousticBlob')}
            </span>
            {importAcoustic ? (
              <>
                <span className="timeline-axis-status-strip__timing-kept">
                  {t(locale, 'transcription.timelineAxisStatus.noPlayableMediaTimingKept')}
                </span>
                <PanelButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="timeline-axis-status-strip__action"
                  onClick={() => { importAcoustic.onPress(); }}
                >
                  {t(locale, 'transcription.timelineAxisStatus.chooseAcousticFileButton')}
                </PanelButton>
              </>
            ) : null}
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
