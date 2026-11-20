import type { CSSProperties } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Marching-ants frame for a range that is still a drag preview, not a unit yet. */
export function DesktopTranscriptionCreatePreview(props: {
  className?: string;
  style: CSSProperties;
  radius?: number;
}) {
  const radius = props.radius ?? 0;
  return (
    <svg
      className={['desktop-tx-create-preview', props.className].filter(Boolean).join(' ')}
      style={props.style}
      aria-hidden="true"
      data-testid="desktop-tx-create-preview"
    >
      {/* Centered 3px stroke clipped by the svg box leaves a 1.5px inside edge. */}
      <rect
        className="desktop-tx-create-preview__stroke"
        x={0}
        y={0}
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        strokeWidth={3}
        strokeDasharray="4 4"
      >
        {reducedMotion() ? null : (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-8"
            dur="0.4s"
            repeatCount="indefinite"
          />
        )}
      </rect>
    </svg>
  );
}
