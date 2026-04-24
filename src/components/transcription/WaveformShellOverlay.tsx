import React from 'react';

import { WaveformReadoutCard } from './WaveformReadoutCard';

interface ActiveReadout {
  source: 'spectrogram' | 'waveform';
  timeSec: number;
  frequencyHz?: number;
  f0Hz: number | null;
  intensityDb: number | null;
}

interface WaveformShellOverlayProps {
  waveformGuideOverlayWidth: number;
  waveformOverlayTranslateX: number;
  waveformAnalysisBandNodes: React.ReactNode;
  activeReadout: ActiveReadout | null;
  formatTime: (timeSec: number) => string;
}

export const WaveformShellOverlay = React.memo(function WaveformShellOverlay(props: WaveformShellOverlayProps) {
  const {
    waveformGuideOverlayWidth,
    waveformOverlayTranslateX,
    waveformAnalysisBandNodes,
    activeReadout,
    formatTime,
  } = props;

  return (
    <div className="waveform-analysis-overlay" aria-hidden="true">
      <svg
        className="waveform-analysis-band-overlay"
        viewBox={`0 0 ${waveformGuideOverlayWidth} 100`}
        preserveAspectRatio="none"
      >
        <g transform={`translate(${waveformOverlayTranslateX} 0)`}>
          {waveformAnalysisBandNodes}
        </g>
      </svg>
      {activeReadout ? (
        <WaveformReadoutCard readout={activeReadout} formatTime={formatTime} />
      ) : null}
    </div>
  );
});
