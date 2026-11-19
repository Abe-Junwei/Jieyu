import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { TimeRuler } from '../components/TimeRuler';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import { RegionActionOverlay } from '../components/transcription/RegionActionOverlay';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { useDesktopDraftGuard } from '../desktop/useDesktopDraftGuard';
import { t, tf, useLocale } from '../i18n';
import { JIEYU_ICON_INLINE, JIEYU_ICON_WAVE, JIEYU_ICON_WAVE_PLAY } from '../utils/jieyuIcon';
import { getWaveformDisplayHeights, type WaveformDisplayMode } from '../utils/waveformDisplayMode';
import {
  timelineZoomPercentFromSlider,
  timelineZoomSliderPosition,
} from '../utils/timelineZoomPercent';
import { msToSec } from '../utils/timeMs';
import { DesktopTranscriptionContextColumn } from './DesktopTranscriptionContextColumn';
import { DesktopDraftLeaveDialog } from './DesktopDraftLeaveDialog';
import { readDesktopCorpusLocate } from './desktopCorpusLocate';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../hooks/transcription/transcriptionPlaybackClock';
import {
  formatPlaybackTime,
  useDesktopTranscriptionMediaController,
  type DesktopPlaybackUnit,
} from './useDesktopTranscriptionMediaController';
import '../styles/pages/desktop-transcription-workspace.css';
import '../styles/pages/transcription-waveform.css';

function PlaybackReadout({ duration, noAudio }: { duration: number; noAudio: boolean }) {
  const currentRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const currentEl = currentRef.current;
    const totalEl = totalRef.current;
    if (!currentEl || !totalEl) return undefined;
    const paint = () => {
      currentEl.textContent = noAudio
        ? '00:00:00.000'
        : formatPlaybackTime(getTranscriptionPlaybackClockSnapshot());
      totalEl.textContent = noAudio ? '/ —' : `/ ${formatPlaybackTime(duration)}`;
    };
    paint();
    if (noAudio) return undefined;
    return subscribeTranscriptionPlaybackClock(paint);
  }, [duration, noAudio]);
  return (
    <span className="desktop-tx-readout" data-testid="desktop-playback-readout">
      <span ref={currentRef} className="desktop-tx-readout__current" />
      <span ref={totalRef} className="desktop-tx-readout__total" />
    </span>
  );
}

export function DesktopTranscriptionWorkspacePage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const tierRef = useRef<HTMLDivElement | null>(null);
  const waveHostRef = useRef<HTMLDivElement | null>(null);
  const [searchParams] = useSearchParams();
  const locate = readDesktopCorpusLocate(searchParams);
  const read = useDesktopProjectReadController(
    host,
    true,
    locate === null ? null : { manuscriptId: locate.manuscriptId, layerId: locate.layerId },
  );
  const draft = useDesktopDraftGuard(
    (current, operationId) => read.saveText(current.unitId, current.text, operationId),
    {
      persist: (item) => read.persistTextDraft(item.unitId, item.rawInput, item.baseBody),
      discard: (unitId) => read.discardTextDraft(unitId),
      inspect: read.inspectTextSave,
    },
  );
  useEffect(() => {
    const stopFlush = host?.onTextClose?.(() => {
      void draft.flushForClose().then((result) => host.reportTextClose?.(result));
    });
    const stopDiscard = host?.onDiscardClose?.(() => {
      void draft.discard().then((ok) => host.reportTextClose?.(ok ? 'discarded' : 'unknown'));
    });
    return () => {
      stopFlush?.();
      stopDiscard?.();
    };
  }, [draft, host]);

  const sourceUnits = read.model?.units;
  const units = useMemo(
    (): readonly DesktopPlaybackUnit[] =>
      (sourceUnits ?? []).flatMap((unit) =>
        unit.startMs === null || unit.endMs === null
          ? []
          : [
              {
                id: unit.id,
                startTime: msToSec(unit.startMs),
                endTime: msToSec(unit.endMs),
                text: unit.text,
              },
            ],
      ),
    [sourceUnits],
  );
  const hasAudio = (read.model?.audioUrl ?? null) !== null;
  const selection = useDesktopTranscriptionSelectionController(locate?.unitId ?? null);
  const playback = useDesktopTranscriptionMediaController({
    mediaUrl: read.model?.audioUrl ?? null,
    units,
    selectedUnitId: selection.selectedUnitId,
    tierContainerRef: tierRef,
    waveformWheelCaptureRootRef: waveHostRef,
    onSelectUnit: (unitId) => {
      const unit = units.find((item) => item.id === unitId);
      if (unit) selection.selectUnit(unit);
    },
  });
  selection.seekToRef.current = playback.seekTo;
  const selectedUnit = units.find((unit) => unit.id === selection.selectedUnitId) ?? null;
  const waveHeights = getWaveformDisplayHeights(168, playback.waveformDisplayMode);

  const speakerCount = new Set(
    (sourceUnits ?? []).map((unit) => unit.speakerId).filter((id) => id !== null),
  ).size;
  const manuscriptList = useMemo(
    () => (
      <DesktopTranscriptionContextColumn
        locale={locale}
        manuscripts={read.model?.manuscripts ?? []}
        manuscriptId={read.model?.manuscriptId ?? null}
        layerId={read.model?.layerId ?? null}
        units={units}
        durationLabel={
          hasAudio && playback.duration > 0 ? formatManuscriptDuration(playback.duration) : null
        }
        speakerCount={speakerCount}
        selectedUnitId={selection.selectedUnitId}
        onSelectManuscript={(manuscriptId) =>
          draft.leave(() => {
            selection.clearSelection();
            read.selectManuscript(manuscriptId);
          })
        }
        onSelectUnit={(unitId) => {
          const unit = units.find((item) => item.id === unitId);
          if (unit) selection.selectUnit(unit);
        }}
      />
    ),
    [draft, hasAudio, locale, playback, read, selection, speakerCount, units],
  );
  useRegisterAppSidePane({ subtitle: '', content: manuscriptList });

  if (host === null) return <Navigate to="/" replace />;

  return (
    <section className="desktop-tx-workspace" data-testid="desktop-transcription-workspace">
      <div className="desktop-tx-workspace__body">
        <div className="desktop-tx-workspace__main">
          {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}
          {hasAudio ? (
            <div className="desktop-tx-bar" data-testid="desktop-playback-bar">
              <button
                type="button"
                className="desktop-tx-play"
                disabled={!playback.isReady}
                aria-label={t(
                  locale,
                  playback.isPlaying
                    ? 'transcription.wave.toolbar.pause'
                    : 'transcription.wave.toolbar.play',
                )}
                onClick={playback.togglePlayback}
              >
                <JieyuIcon
                  name={playback.isPlaying ? 'Pause' : 'Play'}
                  aria-hidden
                  className={JIEYU_ICON_WAVE_PLAY}
                />
              </button>
              <button
                type="button"
                className="desktop-tx-segment"
                disabled={!playback.isReady || selection.selectedUnitId === null}
                onClick={playback.playSegment}
              >
                {t(locale, 'app.desktopTranscription.playSegment')}
              </button>
              <button
                type="button"
                className="desktop-tx-icon"
                aria-label={t(locale, 'transcription.wave.toolbar.rewind10')}
                onClick={() => playback.seekBySeconds(-10)}
              >
                <JieyuIcon name="SkipBack" aria-hidden className={JIEYU_ICON_WAVE} />
              </button>
              <button
                type="button"
                className="desktop-tx-icon"
                aria-label={t(locale, 'transcription.wave.toolbar.forward10')}
                onClick={() => playback.seekBySeconds(10)}
              >
                <JieyuIcon name="SkipForward" aria-hidden className={JIEYU_ICON_WAVE} />
              </button>
              <DesktopRateControl
                locale={locale}
                rate={playback.playbackRate}
                onChange={playback.setPlaybackRate}
              />
              <button
                type="button"
                className="desktop-tx-icon"
                aria-pressed={playback.loop}
                aria-label={t(
                  locale,
                  playback.loop
                    ? 'transcription.wave.toolbar.globalLoopOff'
                    : 'transcription.wave.toolbar.globalLoopOn',
                )}
                onClick={() => playback.setLoop(!playback.loop)}
              >
                <JieyuIcon name="Repeat" aria-hidden className={JIEYU_ICON_WAVE} />
              </button>
              <label className="desktop-tx-volume">
                <JieyuIcon name="Volume2" aria-hidden className={JIEYU_ICON_WAVE} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={playback.volume}
                  style={{ '--volume-fill': `${playback.volume * 100}%` } as CSSProperties}
                  aria-label={tf(locale, 'transcription.voiceWidget.signal.volume', {
                    percent: Math.round(playback.volume * 100),
                  })}
                  onChange={(event) => playback.setVolume(Number(event.target.value))}
                />
              </label>
              <PlaybackReadout duration={playback.duration} noAudio={false} />
              <DesktopViewControls
                locale={locale}
                mode={playback.waveformDisplayMode}
                onChange={playback.setWaveformDisplayMode}
              />
            </div>
          ) : null}
          {hasAudio ? (
            <>
              <div className="desktop-tx-waveband">
                <div className="desktop-tx-band-label">
                  {t(locale, 'transcription.wave.toolbar.displayMode.waveform')}
                </div>
                <div
                  ref={waveHostRef}
                  className={`desktop-tx-wave-host desktop-tx-wave-host-${playback.waveformDisplayMode}`}
                  style={
                    {
                      '--desktop-wave-primary': `${waveHeights.waveformPrimaryHeight}px`,
                      '--desktop-wave-spec': `${waveHeights.spectrogramHeight}px`,
                    } as CSSProperties
                  }
                >
                  <div className="desktop-tx-wave-stage">
                    <div
                      ref={playback.waveformRef}
                      className="desktop-tx-wave"
                      data-testid="desktop-waveform"
                    />
                    {playback.waveformDisplayMode !== 'spectrogram' &&
                    selectedUnit &&
                    playback.isReady &&
                    playback.duration > 0 &&
                    playback.zoomPxPerSec > 0 ? (
                      <RegionActionOverlay
                        unitStartTime={selectedUnit.startTime}
                        unitEndTime={selectedUnit.endTime}
                        viewportFrame={{
                          pxPerDocSec: playback.zoomPxPerSec,
                          scrollLeftPx: playback.scrollLeftPx,
                        }}
                        waveAreaWidth={playback.waveWidth}
                        isPlaying={playback.isPlaying}
                        segmentPlaybackRate={playback.playbackRate}
                        segmentLoopPlayback={playback.loop}
                        skipProcessing={false}
                        onPlaybackRateChange={playback.setPlaybackRate}
                        onToggleLoop={() => playback.setLoop(!playback.loop)}
                        onTogglePlay={() =>
                          playback.isPlaying ? playback.togglePlayback() : playback.playSegment()
                        }
                      />
                    ) : null}
                    {playback.waveformDisplayMode !== 'spectrogram' && playback.fitPxPerSec > 0 ? (
                      <div className="desktop-tx-zoom-dock">
                        <DesktopZoomControls
                          locale={locale}
                          zoomPercent={playback.zoomPercent}
                          fitPxPerSec={playback.fitPxPerSec}
                          maxZoomPercent={playback.maxZoomPercent}
                          canFitSelection={selectedUnit !== null}
                          onFitAll={() => playback.zoomToPercent(100, 0.5, 'fit-all')}
                          onFitSelection={() => {
                            if (selectedUnit) {
                              playback.zoomToUnit(selectedUnit.startTime, selectedUnit.endTime);
                            }
                          }}
                          onZoomPercent={(percent) =>
                            playback.zoomToPercent(percent, 0.5, 'custom')
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <div ref={playback.spectrogramRef} className="desktop-tx-spectrogram" />
                </div>
              </div>
              {playback.duration > 0 ? (
                <div className="desktop-tx-ruler">
                  <TimeRuler
                    duration={playback.duration}
                    rulerView={
                      playback.rulerView && playback.rulerView.end > playback.rulerView.start
                        ? playback.rulerView
                        : { start: 0, end: playback.duration }
                    }
                    zoomPxPerSec={playback.zoomPxPerSec}
                    documentSpanSec={playback.duration}
                    isLaneHeaderCollapsed={false}
                    onToggleLaneHeader={() => undefined}
                    seekTo={playback.seekTo}
                    instanceRef={playback.instanceRef}
                    waveCanvasRef={playback.waveformRef}
                    tierContainerRef={tierRef}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="desktop-tx-no-audio" data-testid="desktop-no-audio">
              <h2>{t(locale, 'app.desktopTranscription.noAudioTitle')}</h2>
              <p>{t(locale, 'app.desktopTranscription.noAudioMessage')}</p>
              <button type="button" className="btn btn-primary" onClick={read.importRecording}>
                {t(locale, 'app.desktopTranscription.importAudio')}
              </button>
            </div>
          )}
          {hasAudio ? (
            <div className="desktop-tx-lane" data-testid="desktop-readonly-timeline">
              <div className="desktop-tx-band-label">
                {t(locale, 'app.desktopTranscription.contextLayerTranscription')}
              </div>
              <div ref={tierRef} className="desktop-tx-lane__body">
                <div
                  className="desktop-tx-lane__track"
                  style={
                    playback.zoomPxPerSec > 0
                      ? { width: playback.duration * playback.zoomPxPerSec }
                      : undefined
                  }
                >
                  {units.map((unit, index) => {
                    const frame = desktopSegmentFrame(
                      unit,
                      playback.duration,
                      index,
                      units.length,
                      playback.zoomPxPerSec,
                    );
                    return (
                      <TimelineAnnotationItem
                        key={unit.id}
                        left={frame.left ?? 0}
                        width={frame.width ?? 0}
                        isSelected={unit.id === selection.selectedUnitId}
                        isActive={false}
                        isCompact={false}
                        title={unit.text}
                        draft={unit.text}
                        onClick={() => selection.selectUnit(unit)}
                        onContextMenu={readOnlyAnnotationEvent}
                        onDoubleClick={readOnlyAnnotationEvent}
                        onResizeStartPointerDown={readOnlyAnnotationEvent}
                        onResizeEndPointerDown={readOnlyAnnotationEvent}
                        onChange={readOnlyAnnotationEvent}
                        onBlur={readOnlyAnnotationEvent}
                        onKeyDown={readOnlyAnnotationEvent}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {draft.prompt === null ? null : (
        <DesktopDraftLeaveDialog
          failed={draft.prompt.failed}
          unknown={draft.unknown}
          saving={draft.saving}
          canRetry={draft.canRetry}
          onRetry={draft.retry}
          onDiscard={draft.discard}
          onStay={draft.stay}
        />
      )}
    </section>
  );
}

function readOnlyAnnotationEvent() {
  return undefined;
}

export function desktopSegmentFrame(
  unit: DesktopPlaybackUnit,
  duration: number,
  index: number,
  count: number,
  zoomPxPerSec: number,
): CSSProperties {
  if (zoomPxPerSec > 0 && unit.endTime > unit.startTime) {
    return {
      left: unit.startTime * zoomPxPerSec,
      width: Math.max(1, (unit.endTime - unit.startTime) * zoomPxPerSec),
    };
  }
  if (duration > 0 && unit.endTime > unit.startTime) {
    return {
      left: `${(unit.startTime / duration) * 100}%`,
      width: `${((unit.endTime - unit.startTime) / duration) * 100}%`,
    };
  }
  const share = 100 / Math.max(count, 1);
  return { left: `${index * share}%`, width: `${share}%` };
}

const DESKTOP_VIEW_MODES = [
  {
    mode: 'waveform',
    icon: 'AudioLines',
    label: 'transcription.wave.toolbar.displayMode.waveform',
  },
  {
    mode: 'spectrogram',
    icon: 'ChartNoAxesGantt',
    label: 'transcription.wave.toolbar.displayMode.spectrogram',
  },
  {
    mode: 'split',
    icon: 'SquareSplitVertical',
    label: 'transcription.wave.toolbar.displayMode.split',
  },
] as const;

const DESKTOP_RATES = [
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1.0×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2.0×' },
] as const;

function useDismissDetails(rootRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.open || !(event.target instanceof Node) || root.contains(event.target)) return;
      root.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') root.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [rootRef]);
}

function DesktopRateControl(props: {
  locale: ReturnType<typeof useLocale>;
  rate: number;
  onChange: (rate: number) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  useDismissDetails(rootRef);
  const known = DESKTOP_RATES.find((item) => item.value === props.rate);
  const currentLabel = known?.label ?? `${props.rate}×`;
  const label = tf(props.locale, 'transcription.wave.segmentSpeed', { rate: props.rate });
  return (
    <details ref={rootRef} className="desktop-tx-rate" data-testid="desktop-rate">
      <summary className="desktop-tx-rate-trigger" aria-label={label}>
        <span>{currentLabel}</span>
        <JieyuIcon name="ChevronDown" aria-hidden className={JIEYU_ICON_INLINE} />
      </summary>
      <div className="desktop-tx-menu" role="menu" aria-label={label}>
        {DESKTOP_RATES.map((item) => {
          const selected = item.value === props.rate;
          return (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={selected ? 'is-on' : undefined}
              onClick={() => {
                props.onChange(item.value);
                if (rootRef.current) rootRef.current.open = false;
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function DesktopViewControls(props: {
  locale: ReturnType<typeof useLocale>;
  mode: WaveformDisplayMode;
  onChange: (mode: WaveformDisplayMode) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const index = Math.max(
    0,
    DESKTOP_VIEW_MODES.findIndex((item) => item.mode === props.mode),
  );
  const current = DESKTOP_VIEW_MODES[index] ?? DESKTOP_VIEW_MODES[0];
  const groupLabel = t(props.locale, 'transcription.wave.toolbar.displayMode');
  const currentLabel = t(props.locale, current.label);
  useDismissDetails(rootRef);
  return (
    <details ref={rootRef} className="desktop-tx-view" data-testid="desktop-view">
      <summary className="desktop-tx-view-trigger" aria-label={`${groupLabel}：${currentLabel}`}>
        <JieyuIcon name={current.icon} aria-hidden className={JIEYU_ICON_INLINE} />
        <JieyuIcon name="ChevronDown" aria-hidden className={JIEYU_ICON_INLINE} />
        <span className="desktop-tx-zoom-tip" aria-hidden>
          {groupLabel}
        </span>
      </summary>
      <div className="desktop-tx-menu" role="menu" aria-label={groupLabel}>
        {DESKTOP_VIEW_MODES.map((item) => {
          const label = t(props.locale, item.label);
          const selected = item.mode === current.mode;
          return (
            <button
              key={item.mode}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={selected ? 'is-on' : undefined}
              onClick={() => {
                props.onChange(item.mode);
                if (rootRef.current) rootRef.current.open = false;
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function DesktopZoomControls(props: {
  locale: ReturnType<typeof useLocale>;
  zoomPercent: number;
  fitPxPerSec: number;
  maxZoomPercent: number;
  canFitSelection: boolean;
  onFitAll: () => void;
  onFitSelection: () => void;
  onZoomPercent: (percent: number) => void;
}) {
  const { locale, zoomPercent, fitPxPerSec, maxZoomPercent, canFitSelection } = props;
  const percent = Math.round(zoomPercent);
  const sliderPos = timelineZoomSliderPosition(zoomPercent, fitPxPerSec, maxZoomPercent);
  return (
    <div className="desktop-tx-zoom" data-testid="desktop-zoom">
      <button
        type="button"
        className="desktop-tx-icon"
        title={t(locale, 'transcription.zoom.fitAll')}
        aria-label={t(locale, 'transcription.zoom.fitAll')}
        onClick={props.onFitAll}
      >
        <JieyuIcon name="Expand" aria-hidden className={JIEYU_ICON_INLINE} />
        <span className="desktop-tx-zoom-tip" aria-hidden>
          {t(locale, 'transcription.zoom.fitAll')}
        </span>
      </button>
      <button
        type="button"
        className="desktop-tx-icon"
        title={t(locale, 'transcription.zoom.fitSelection')}
        aria-label={t(locale, 'transcription.zoom.fitSelection')}
        aria-disabled={!canFitSelection}
        onClick={props.onFitSelection}
      >
        <JieyuIcon name="Focus" aria-hidden className={JIEYU_ICON_INLINE} />
        <span className="desktop-tx-zoom-tip" aria-hidden>
          {t(locale, 'transcription.zoom.fitSelection')}
        </span>
      </button>
      <input
        type="range"
        className="desktop-tx-zoom-slider"
        min={0}
        max={1000}
        step={1}
        value={sliderPos}
        style={{ '--zoom-fill': `${sliderPos / 10}%` } as CSSProperties}
        title={tf(locale, 'transcription.zoom.scale', { percent })}
        aria-label={tf(locale, 'transcription.zoom.scaleAria', { percent })}
        onChange={(event) => {
          props.onZoomPercent(
            timelineZoomPercentFromSlider(Number(event.target.value), fitPxPerSec, maxZoomPercent),
          );
        }}
      />
      <span className="desktop-tx-zoom-pct">{percent}%</span>
    </div>
  );
}

function formatManuscriptDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
