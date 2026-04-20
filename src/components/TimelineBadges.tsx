import type { MouseEventHandler, ReactNode } from 'react';
import { tf, type Locale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { buildTimelineSelfCertaintyAmbiguousTitle } from '../utils/timelineSelfCertainty';
import { NoteDocumentIcon } from './NoteDocumentIcon';
import { SelfCertaintyIcon } from './SelfCertaintyIcon';

interface TimelineBadgesProps {
  locale: Locale;
  selfCertainty?: UnitSelfCertainty;
  selfCertaintyTitle?: string;
  selfCertaintyAmbiguous?: boolean;
  selfCertaintyAmbiguousTitle?: string;
  noteCount?: number;
  onNoteClick?: MouseEventHandler<SVGSVGElement>;
  noteClassName?: string;
  wrapperClassName?: string;
}

export function TimelineBadges({
  locale,
  selfCertainty,
  selfCertaintyTitle,
  selfCertaintyAmbiguous = false,
  selfCertaintyAmbiguousTitle,
  noteCount = 0,
  onNoteClick,
  noteClassName = 'timeline-annotation-note-icon timeline-annotation-note-icon-active',
  wrapperClassName,
}: TimelineBadgesProps): ReactNode {
  const showNote = noteCount > 0 && typeof onNoteClick === 'function';
  if (!selfCertainty && !selfCertaintyAmbiguous && !showNote) return null;

  const ambiguousTitle = selfCertaintyAmbiguousTitle ?? buildTimelineSelfCertaintyAmbiguousTitle(locale);
  const noteTitle = tf(locale, 'transcription.notes.count', { count: noteCount });

  const badges = (
    <>
      {selfCertainty ? (
        <SelfCertaintyIcon
          certainty={selfCertainty}
          className="timeline-annotation-self-certainty"
          {...(selfCertaintyTitle ? { title: selfCertaintyTitle, ariaLabel: selfCertaintyTitle } : {})}
        />
      ) : null}
      {!selfCertainty && selfCertaintyAmbiguous ? (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty-ambiguous"
          role="img"
          aria-label={ambiguousTitle}
          title={ambiguousTitle}
        >
          <span className="timeline-annotation-self-certainty-icon" aria-hidden>
            !
          </span>
        </span>
      ) : null}
      {showNote ? (
        <NoteDocumentIcon
          className={noteClassName}
          onClick={(event) => {
            event.stopPropagation();
            onNoteClick?.(event);
          }}
          ariaLabel={noteTitle}
          title={noteTitle}
        />
      ) : null}
    </>
  );

  if (!wrapperClassName) return badges;
  return <div className={wrapperClassName}>{badges}</div>;
}