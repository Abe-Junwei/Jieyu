const svgProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

export function WorkbenchGlyph(props: {
  name: 'overview' | 'wave' | 'play' | 'clock' | 'upload' | 'download' | 'pencil' | 'rules';
}) {
  switch (props.name) {
    case 'play':
      return (
        <svg {...svgProps} fill="currentColor" stroke="none">
          <path d="M6.2 4.2v7.6L12 8 6.2 4.2z" />
        </svg>
      );
    case 'wave':
      return (
        <svg {...svgProps}>
          <path d="M2 10.5V6.5M5.5 12.5V3.5M9 11V5M12.5 12.5V4.5M15 9.5V6.5" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 5.2V8l2.2 1.4" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...svgProps}>
          <path d="M8 11.5V4.5M5.2 7.2 8 4.4l2.8 2.8M3.5 13h9" />
        </svg>
      );
    case 'download':
      return (
        <svg {...svgProps}>
          <path d="M8 4.5v7M5.2 8.8 8 11.6l2.8-2.8M3.5 13h9" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...svgProps}>
          <path d="M9.2 3.4 12.6 6.8 6.2 13.2H2.8V9.8z" />
        </svg>
      );
    case 'rules':
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="5.25" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path d="M5 7h6M5 10h4" />
        </svg>
      );
  }
}
