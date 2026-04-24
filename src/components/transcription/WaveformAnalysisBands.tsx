import React from 'react';

import { t, tf, type Locale } from '../../i18n';

interface WaveformLowConfidenceOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  confidence: number;
}

interface WaveformOverlapOverlay {
  id: string;
  leftPx: number;
  widthPx: number;
  concurrentCount: number;
}

interface WaveformAnalysisBandsProps {
  locale: Locale;
  waveformLowConfidenceOverlays: WaveformLowConfidenceOverlay[];
  waveformOverlapOverlays: WaveformOverlapOverlay[];
}

export const WaveformAnalysisBands = React.memo(function WaveformAnalysisBands(props: WaveformAnalysisBandsProps) {
  const { locale, waveformLowConfidenceOverlays, waveformOverlapOverlays } = props;

  const renderWaveformAnalysisBand = (
    bandType: 'confidence' | 'overlap' | 'gap',
    clipKey: string,
    leftPx: number,
    widthPx: number,
    title: string,
    label: string | null,
  ) => {
    const bandWidth = Math.max(2, widthPx);
    const clipPathId = `waveform-analysis-band-clip-${clipKey}`;
    return (
      <g key={clipKey}>
        <title>{title}</title>
        <clipPath id={clipPathId}>
          <rect x={leftPx} y={4} width={bandWidth} height={92} rx={8} ry={8} />
        </clipPath>
        <rect
          className={`waveform-analysis-band-shape waveform-analysis-band-${bandType}`}
          x={leftPx}
          y={4}
          width={bandWidth}
          height={92}
          rx={8}
          ry={8}
        />
        {label ? (
          <text
            className={`waveform-analysis-band-label waveform-analysis-band-label-${bandType}`}
            x={leftPx + 8}
            y={11}
            clipPath={`url(#${clipPathId})`}
          >
            {label}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <>
      {waveformLowConfidenceOverlays.map(({ id, leftPx, widthPx, confidence }, index) => renderWaveformAnalysisBand(
        'confidence',
        `confidence-${index}-${id}`,
        leftPx,
        widthPx,
        tf(locale, 'transcription.wave.analysis.lowConfidenceTitle', { confidence: Math.round(confidence * 100) }),
        widthPx >= 46 ? t(locale, 'transcription.wave.analysis.lowConfidence') : null,
      ))}
      {waveformOverlapOverlays.map(({ id, leftPx, widthPx, concurrentCount }, index) => renderWaveformAnalysisBand(
        'overlap',
        `overlap-${index}-${id}`,
        leftPx,
        widthPx,
        tf(locale, 'transcription.wave.analysis.overlapTitle', { count: concurrentCount }),
        widthPx >= 120 ? tf(locale, 'transcription.wave.analysis.overlap', { count: concurrentCount }) : null,
      ))}
    </>
  );
});
