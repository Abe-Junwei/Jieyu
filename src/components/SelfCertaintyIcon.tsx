import type { CSSProperties } from 'react';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

interface SelfCertaintyIconProps {
  certainty: UnitSelfCertainty;
  className?: string;
  title?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

const GLYPH: Record<NonNullable<UnitSelfCertainty>, string> = {
  certain: '✓',
  not_understood: '?',
  uncertain: '≈',
};

const COLOR_CLASS: Record<NonNullable<UnitSelfCertainty>, string> = {
  certain: 'timeline-annotation-self-certainty--certain',
  not_understood: 'timeline-annotation-self-certainty--not-understood',
  uncertain: 'timeline-annotation-self-certainty--uncertain',
};

export function SelfCertaintyIcon({
  certainty,
  className,
  title,
  ariaLabel,
  style,
}: SelfCertaintyIconProps) {
  if (!certainty) return null;
  return (
    <span
      className={[className, COLOR_CLASS[certainty]].filter(Boolean).join(' ')}
      role="img"
      aria-label={ariaLabel}
      title={title}
      style={style}
    >
      {certainty === 'uncertain' ? (
        <span className="timeline-annotation-self-certainty-wavy" aria-hidden>
          {GLYPH[certainty]}
        </span>
      ) : (
        <span className="timeline-annotation-self-certainty-icon" aria-hidden>
          {GLYPH[certainty]}
        </span>
      )}
    </span>
  );
}
