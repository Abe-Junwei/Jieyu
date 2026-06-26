import { t, tf, type Locale } from '../i18n';
import { PanelFeedback } from './ui';
import { formatTime } from '../utils/transcriptionFormatters';
import type { TimelineImportMismatchNotice } from '../utils/timelineImportMismatch';

type ImportTimelineMismatchAckFieldsProps = {
  locale: Locale;
  notices: ReadonlyArray<TimelineImportMismatchNotice>;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
};

export function ImportTimelineMismatchAckFields({
  locale,
  notices,
  acknowledged,
  onAcknowledgedChange,
}: ImportTimelineMismatchAckFieldsProps) {
  if (notices.length === 0) return null;

  return (
    <>
      {notices.map((notice) => (
        <PanelFeedback
          key={notice.kind}
          level={
            notice.kind === 'acoustic_shorter_than_segments' ||
            notice.kind === 'first_acoustic_bind_will_remap_segments'
              ? 'warn'
              : 'info'
          }
        >
          {notice.kind === 'acoustic_shorter_than_segments'
            ? tf(locale, 'transcription.importDialog.mismatchAcousticShorterThanSegments', {
                acoustic: formatTime(notice.incomingSec),
                maxEnd: formatTime(notice.maxUnitEndSec),
              })
            : notice.kind === 'first_acoustic_bind_will_remap_segments'
              ? tf(locale, 'transcription.importDialog.mismatchFirstAcousticBindWillRemap', {
                  acoustic: formatTime(notice.incomingSec),
                  maxEnd: formatTime(notice.maxUnitEndSec),
                })
              : notice.kind === 'document_span_longer_than_established'
                ? tf(locale, 'transcription.importDialog.mismatchDocumentLongerThanEstablished', {
                    incoming: formatTime(notice.incomingSec),
                    established: formatTime(notice.establishedSpanSec),
                  })
                : tf(locale, 'transcription.importDialog.mismatchAcousticLongerThanLogical', {
                    acoustic: formatTime(notice.incomingSec),
                    logicalSpan: formatTime(notice.establishedSpanSec),
                  })}
        </PanelFeedback>
      ))}
      <label className="import-timeline-mismatch-ack">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
        />
        <span>{t(locale, 'transcription.importDialog.mismatchAcknowledge')}</span>
      </label>
    </>
  );
}
