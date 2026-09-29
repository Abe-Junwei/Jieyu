import { useEffect, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { t, useLocale } from '../../i18n';
import type { SentenceAcousticFigure } from './sentenceAcousticFigure';

const PITCH_HEIGHT = 48;

function pitchPoints(pitch: readonly (number | null)[]): string {
  return pitch
    .map((value, index) => {
      if (value == null) return '';
      const x = (index / Math.max(pitch.length - 1, 1)) * 100;
      const y = PITCH_HEIGHT - value * (PITCH_HEIGHT - 4) - 2;
      return `${x},${y}`;
    })
    .filter((point) => point.length > 0)
    .join(' ');
}

export function AnnotationSentenceAcousticFigure({
  figure,
  audioUrl,
  status,
  contentWidth,
  showWave,
  showSpectrum,
  showPitch,
}: {
  figure: SentenceAcousticFigure | null;
  audioUrl: string | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  contentWidth: number;
  showWave: boolean;
  showSpectrum: boolean;
  showPitch: boolean;
}) {
  const locale = useLocale();
  const waveRef = useRef<HTMLDivElement>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wave = waveRef.current;
    if (status !== 'ready' || !audioUrl || !wave || contentWidth <= 0) return undefined;
    if (!showWave && !showSpectrum) return undefined;
    let disposed = false;
    let ws: WaveSurfer | null = null;
    void (async () => {
      const [{ default: WaveSurferCtor }, spectrogramModule] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/dist/plugins/spectrogram.esm.js'),
      ]);
      if (disposed || !waveRef.current) return;
      const spectrumContainer = spectrumRef.current;
      const spectrogram = showSpectrum
        ? spectrogramModule.default.create({
            ...(spectrumContainer ? { container: spectrumContainer } : {}),
            height: 72,
            labels: false,
            scale: 'mel',
            fftSamples: 512,
            gainDB: 22,
            rangeDB: 78,
            colorMap: 'roseus',
            useWebWorker: false,
          })
        : null;
      ws = WaveSurferCtor.create({
        container: waveRef.current,
        height: showWave ? PITCH_HEIGHT : 0,
        normalize: true,
        interact: false,
        cursorWidth: 0,
        hideScrollbar: true,
        autoScroll: false,
        autoCenter: false,
        plugins: spectrogram ? [spectrogram] : [],
      });
      const wrapper = (spectrogram as unknown as { wrapper?: HTMLElement } | null)?.wrapper;
      if (wrapper instanceof HTMLElement && spectrumRef.current) {
        spectrumRef.current.appendChild(wrapper);
        wrapper.style.overflow = 'hidden';
        wrapper.style.maxWidth = '100%';
      }
      await ws.load(audioUrl);
    })();
    return () => {
      disposed = true;
      ws?.destroy();
    };
  }, [audioUrl, contentWidth, showSpectrum, showWave, status]);

  if (status === 'idle') return null;
  if (status === 'loading') {
    return (
      <p className="annotation-sentence-acoustic-status" data-testid="annotation-sentence-acoustic">
        {t(locale, 'workspace.annotation.acousticLoading')}
      </p>
    );
  }
  if (status === 'unavailable' || !audioUrl) {
    return (
      <p className="annotation-sentence-acoustic-status" data-testid="annotation-sentence-acoustic">
        {t(locale, 'workspace.annotation.acousticUnavailable')}
      </p>
    );
  }
  if (!showWave && !showSpectrum && !showPitch) return null;
  const width = contentWidth > 0 ? contentWidth : undefined;
  return (
    <div
      className="annotation-sentence-acoustic"
      data-testid="annotation-sentence-acoustic"
      style={width ? { width, maxWidth: '100%' } : { maxWidth: '100%' }}
    >
      <div className="annotation-sentence-acoustic-wave" hidden={!showWave && !showPitch}>
        <div ref={waveRef} hidden={!showWave} data-testid="annotation-sentence-wave" />
        {showPitch ? (
          <svg
            className="annotation-sentence-acoustic-pitch"
            viewBox={`0 0 100 ${PITCH_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t(locale, 'workspace.annotation.acousticPitch')}
          >
            <polyline points={pitchPoints(figure?.pitch ?? [])} />
          </svg>
        ) : null}
      </div>
      <div className="annotation-sentence-acoustic-spectrum" hidden={!showSpectrum}>
        <div ref={spectrumRef} data-testid="annotation-sentence-spectrum" />
      </div>
    </div>
  );
}
