import React from 'react';

import { t, tf, type Locale } from '../../i18n';
import type { AcousticOverlayMode } from '../../utils/acousticOverlayTypes';
import { NoteDocumentIcon } from '../NoteDocumentIcon';

interface AcousticOverlayVisibleSummary {
  f0MeanHz: number | null;
  intensityPeakDb: number | null;
}

type WaveLassoOverlay = {
  mode: 'create' | 'select';
  x: number;
  y: number;
  w: number;
  h: number;
  hintCount: number;
} | null;

interface WaveformNoteIndicator {
  uttId: string;
  leftPx: number;
  widthPx: number;
  count: number;
  layerId?: string;
}

interface WaveformOverlayDecorationsProps {
  locale: Locale;

  waveformGuideOverlayWidth: number;
  waveformGuideOverlayHeight: number;
  waveformGuideLabelY: number;
  waveformGuideHotspotTopY: number;
  waveformGuideHotspotBottomY: number;

  shouldRenderSelectedHotspot: boolean;
  selectedHotspotLeftPx: number | null;

  snapGuideLeftPx: number | null;
  snapGuideRightPx: number | null;
  snapGuideNearSideValue: string | null | undefined;

  acousticOverlayMode: AcousticOverlayMode;
  acousticOverlayViewportWidth: number;
  acousticOverlayF0Path: string | null;
  acousticOverlayIntensityPath: string | null;
  acousticOverlayVisibleSummary: AcousticOverlayVisibleSummary | null;
  acousticOverlayLoading: boolean;

  hasActiveReadout: boolean;
  waveLassoOverlay: WaveLassoOverlay;
  waveformOverlayTranslateX: number;

  waveformNoteIndicators: WaveformNoteIndicator[];
  onOpenWaveformNotePopover: (input: { x: number; y: number; uttId: string; layerId?: string }) => void;
}

export const WaveformOverlayDecorations = React.memo(function WaveformOverlayDecorations(props: WaveformOverlayDecorationsProps) {
  const {
    locale,
    waveformGuideOverlayWidth,
    waveformGuideOverlayHeight,
    waveformGuideLabelY,
    waveformGuideHotspotTopY,
    waveformGuideHotspotBottomY,
    shouldRenderSelectedHotspot,
    selectedHotspotLeftPx,
    snapGuideLeftPx,
    snapGuideRightPx,
    snapGuideNearSideValue,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    hasActiveReadout,
    waveLassoOverlay,
    waveformOverlayTranslateX,
    waveformNoteIndicators,
    onOpenWaveformNotePopover,
  } = props;

  const waveformNoteIndicatorNodes = React.useMemo(() => waveformNoteIndicators.map(({ uttId, leftPx, widthPx, count, layerId }) => (
    <div
      key={`note-${uttId}`}
      className="waveform-note-indicator-trigger"
      style={{ left: leftPx + widthPx - 22 }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onClick={(e) => {
        e.stopPropagation();
        onOpenWaveformNotePopover({ x: e.clientX, y: e.clientY, uttId, ...(layerId ? { layerId } : {}) });
      }}
    >
      <NoteDocumentIcon
        className="waveform-note-indicator-icon"
        ariaLabel={tf(locale, 'transcription.notes.count', { count })}
        title={tf(locale, 'transcription.notes.count', { count })}
      />
    </div>
  )), [locale, onOpenWaveformNotePopover, waveformNoteIndicators]);

  return (
    <>
      {(shouldRenderSelectedHotspot || snapGuideLeftPx != null || snapGuideRightPx != null) ? (
        <svg
          className="waveform-guide-overlay"
          viewBox={`0 0 ${waveformGuideOverlayWidth} ${waveformGuideOverlayHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {shouldRenderSelectedHotspot ? (
            <line
              className="waveform-analysis-hotspot-line"
              x1={selectedHotspotLeftPx as number}
              x2={selectedHotspotLeftPx as number}
              y1={waveformGuideHotspotTopY}
              y2={waveformGuideHotspotBottomY}
            />
          ) : null}
          {snapGuideLeftPx != null ? (
            <g>
              <line
                className={`waveform-snap-guide-line waveform-snap-guide-line-left ${snapGuideNearSideValue === 'left' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-line-near' : ''}`}
                x1={snapGuideLeftPx}
                x2={snapGuideLeftPx}
                y1={0}
                y2={waveformGuideOverlayHeight}
              />
              <text
                className={`waveform-snap-guide-label waveform-snap-guide-label-left ${snapGuideNearSideValue === 'left' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-label-near' : ''}`}
                x={snapGuideLeftPx}
                y={waveformGuideLabelY}
                textAnchor="middle"
              >
                L
              </text>
            </g>
          ) : null}
          {snapGuideRightPx != null ? (
            <g>
              <line
                className={`waveform-snap-guide-line waveform-snap-guide-line-right ${snapGuideNearSideValue === 'right' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-line-near' : ''}`}
                x1={snapGuideRightPx}
                x2={snapGuideRightPx}
                y1={0}
                y2={waveformGuideOverlayHeight}
              />
              <text
                className={`waveform-snap-guide-label waveform-snap-guide-label-right ${snapGuideNearSideValue === 'right' || snapGuideNearSideValue === 'both' ? 'waveform-snap-guide-label-near' : ''}`}
                x={snapGuideRightPx}
                y={waveformGuideLabelY}
                textAnchor="middle"
              >
                R
              </text>
            </g>
          ) : null}
        </svg>
      ) : null}

      {acousticOverlayMode !== 'none' ? (
        <div className="waveform-acoustic-overlay" aria-hidden="true">
          <svg
            viewBox={`0 0 ${Math.max(1, acousticOverlayViewportWidth)} 100`}
            preserveAspectRatio="none"
          >
            {acousticOverlayIntensityPath ? (
              <path className="waveform-acoustic-path waveform-acoustic-path-intensity" d={acousticOverlayIntensityPath} />
            ) : null}
            {acousticOverlayF0Path ? (
              <path className="waveform-acoustic-path waveform-acoustic-path-f0" d={acousticOverlayF0Path} />
            ) : null}
          </svg>
          <div className="waveform-acoustic-legend">
            {acousticOverlayLoading ? (
              <span className="waveform-acoustic-chip waveform-acoustic-chip-neutral">
                {t(locale, 'transcription.wave.acoustic.loading')}
              </span>
            ) : null}
            {!hasActiveReadout && acousticOverlayMode !== 'intensity' ? (
              <span className="waveform-acoustic-chip waveform-acoustic-chip-f0">
                {t(locale, 'transcription.wave.acoustic.f0')}
                {' '}
                {acousticOverlayVisibleSummary?.f0MeanHz != null ? `${Math.round(acousticOverlayVisibleSummary.f0MeanHz)} Hz` : '—'}
              </span>
            ) : null}
            {!hasActiveReadout && acousticOverlayMode !== 'f0' ? (
              <span className="waveform-acoustic-chip waveform-acoustic-chip-intensity">
                {t(locale, 'transcription.wave.acoustic.intensity')}
                {' '}
                {acousticOverlayVisibleSummary?.intensityPeakDb != null ? `${acousticOverlayVisibleSummary.intensityPeakDb.toFixed(1)} dB` : '—'}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {waveLassoOverlay ? (
        <svg className="wave-lasso-overlay" aria-hidden="true">
          <rect
            className={`wave-lasso-rect ${waveLassoOverlay.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
            x={waveLassoOverlay.x}
            y={waveLassoOverlay.y}
            width={Math.max(2, waveLassoOverlay.w)}
            height={Math.max(2, waveLassoOverlay.h)}
            rx={waveLassoOverlay.mode === 'create' ? 0 : 2}
            ry={waveLassoOverlay.mode === 'create' ? 0 : 2}
          />
          {waveLassoOverlay.mode === 'select' ? (
            <foreignObject
              x={waveLassoOverlay.x + 8}
              y={waveLassoOverlay.y + 8}
              width={172}
              height={28}
            >
              <div className="wave-lasso-hint">
                {tf(locale, 'transcription.wave.selectionHint', { count: waveLassoOverlay.hintCount })}
              </div>
            </foreignObject>
          ) : null}
        </svg>
      ) : null}

      <div className="waveform-note-indicator-layer" style={{ transform: `translateX(${waveformOverlayTranslateX}px)` }}>
        {waveformNoteIndicatorNodes}
      </div>
    </>
  );
});
