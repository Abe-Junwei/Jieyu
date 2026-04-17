import type { CSSProperties, MouseEventHandler } from 'react';

interface NoteDocumentIconProps {
  className?: string;
  title?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<SVGSVGElement>;
}

export function NoteDocumentIcon({
  className,
  title,
  ariaLabel,
  style,
  onClick,
}: NoteDocumentIconProps) {
  return (
    <svg
      className={className}
      onClick={onClick}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      style={style}
    >
      {title ? <title>{title}</title> : null}
      <path d="M3 1.5h5.8l3.2 3.2v7.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5.5 6.8h4M5.5 9.4h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}