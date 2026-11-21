import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { TimeRuler } from '../components/TimeRuler';
import { TimelineTranslationAudioControls } from '../components/TimelineTranslationAudioControls';
import { RegionActionOverlay } from '../components/transcription/RegionActionOverlay';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { ToastProvider } from '../contexts/ToastContext';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { useDesktopDraftGuard } from '../desktop/useDesktopDraftGuard';
import { layerTextStore, textKey } from './desktopTranscriptionTextKey';
import { t, tf, useLocale } from '../i18n';
import { JIEYU_ICON_INLINE, JIEYU_ICON_WAVE, JIEYU_ICON_WAVE_PLAY } from '../utils/jieyuIcon';
import { getWaveformDisplayHeights } from '../utils/waveformDisplayMode';
import { msToSec } from '../utils/timeMs';
import { DesktopTranscriptionSidePane } from './DesktopTranscriptionSidePane';
import {
  DesktopRateControl,
  DesktopViewControls,
  DesktopZoomControls,
  formatManuscriptDuration,
} from './DesktopTranscriptionWorkspaceControls';
import { DesktopDraftLeaveDialog } from './DesktopDraftLeaveDialog';
import {
  DesktopTranscriptionWaveMenu,
  waveMenuUnitAt,
  type WaveMenuState,
} from './DesktopTranscriptionWaveMenu';
import { readDesktopCorpusLocate } from './desktopCorpusLocate';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../hooks/transcription/transcriptionPlaybackClock';
import { useDesktopLayerView } from './useDesktopLayerView';
import { useDesktopTranscriptionLayerController } from './useDesktopTranscriptionLayerController';
import { DesktopLayerDragReason } from './useDesktopTranscriptionLayerDragController';
import { useDesktopTranscriptionOralController } from './useDesktopTranscriptionOralController';
import {
  DesktopTranscriptionLane,
  type WaveCreate,
  type WaveSkip,
} from './DesktopTranscriptionLane';
import {
  formatPlaybackTime,
  useDesktopTranscriptionMediaController,
  type DesktopPlaybackUnit,
} from './useDesktopTranscriptionMediaController';
import '../styles/pages/desktop-transcription-workspace.css';
import '../styles/pages/transcription-waveform.css';

export { desktopSegmentFrame } from './desktopTranscriptionEdgeView';

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
  return (
    <ToastProvider>
      <DesktopTranscriptionWorkspace />
    </ToastProvider>
  );
}

function DesktopTranscriptionWorkspace() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const tierRef = useRef<HTMLDivElement | null>(null);
  const waveHostRef = useRef<HTMLDivElement | null>(null);
  const waveCreateRef = useRef<WaveCreate | null>(null);
  const waveSkipRef = useRef<WaveSkip | null>(null);
  const waveDeleteRef = useRef<WaveSkip | null>(null);
  const [waveStage, setWaveStage] = useState<HTMLDivElement | null>(null);
  const [waveMenu, setWaveMenu] = useState<WaveMenuState | null>(null);
  const [searchParams] = useSearchParams();
  const locate = readDesktopCorpusLocate(searchParams);
  const read = useDesktopProjectReadController(
    host,
    true,
    locate === null ? null : { manuscriptId: locate.manuscriptId, layerId: locate.layerId },
  );
  const layerView = useDesktopLayerView(read.model?.manuscriptId ?? null);
  const textStore = layerTextStore(read);
  const draft = useDesktopDraftGuard(textStore.save, textStore.store);
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
                confidence: unit.confidence,
                skipProcessing: unit.skipProcessing,
              },
            ],
      ),
    [sourceUnits],
  );
  const hasAudio = (read.model?.audioUrl ?? null) !== null;
  const selection = useDesktopTranscriptionSelectionController(locate?.unitId ?? null);
  const selectPlaybackUnit = (unit: DesktopPlaybackUnit) => {
    if (unit.id === selection.selectedUnitId) {
      selection.selectUnit(unit);
      return;
    }
    draft.leave(() => selection.selectUnit(unit));
  };
  const selectPlaybackUnits = (picked: readonly DesktopPlaybackUnit[]) => {
    const [first] = picked;
    if (!first) return;
    draft.leave(() => selection.selectUnits(picked));
  };
  const selectPlaybackUnitRef = useRef(selectPlaybackUnit);
  selectPlaybackUnitRef.current = selectPlaybackUnit;
  const openWaveRegionMenu = useRef<(unitId: string, x: number, y: number) => void>(
    () => undefined,
  );
  const playback = useDesktopTranscriptionMediaController({
    mediaUrl: read.model?.audioUrl ?? null,
    units,
    selectedUnitId: selection.selectedUnitId,
    selectedUnitIds: selection.selectedUnitIds,
    tierContainerRef: tierRef,
    waveformWheelCaptureRootRef: waveHostRef,
    onSelectUnit: (unitId) => {
      const unit = units.find((item) => item.id === unitId);
      if (unit) selectPlaybackUnit(unit);
    },
    onRegionContextMenu: (unitId, x, y) => openWaveRegionMenu.current(unitId, x, y),
  });
  openWaveRegionMenu.current = (unitId, x, y) => {
    if (playback.isPlaying) playback.togglePlayback();
    const wave = playback.waveformRef.current;
    const zoom = playback.zoomPxPerSec;
    const time =
      wave && zoom > 0 ? (x - wave.getBoundingClientRect().left + playback.scrollLeftPx) / zoom : 0;
    setWaveMenu({ x, y, time, unitId });
  };
  selection.seekToRef.current = playback.seekTo;
  const selectedUnit = units.find((unit) => unit.id === selection.selectedUnitId) ?? null;
  const textSync = useRef({
    syncSaved: draft.syncSaved,
    restore: draft.restore,
    read: read.readTextDraft,
  });
  textSync.current = {
    syncSaved: draft.syncSaved,
    restore: draft.restore,
    read: read.readTextDraft,
  };
  const textLayerId = read.model?.layerId ?? null;
  useEffect(() => {
    const id = selection.selectedUnitId;
    if (id === null || selectedUnit === null || textLayerId === null) return;
    const key = textKey(textLayerId, id);
    const saved = selectedUnit.text;
    textSync.current.syncSaved(key, saved);
    void textSync.current.read(id, textLayerId).then((row) => {
      if (row) textSync.current.restore({ ...row, unitId: key }, saved);
    });
  }, [selectedUnit, selection.selectedUnitId, textLayerId]);
  const waveHeights = getWaveformDisplayHeights(224, playback.waveformDisplayMode);

  const speakerCount = new Set(
    (sourceUnits ?? []).map((unit) => unit.speakerId).filter((id) => id !== null),
  ).size;
  const sideActions = useRef({ draft, read, selection });
  sideActions.current = { draft, read, selection };
  const layerActions = useDesktopTranscriptionLayerController({
    sessionId: read.sessionId,
    desktopCall: host?.desktopCall,
    manuscriptId: read.model?.manuscriptId ?? null,
    layers: read.model?.layers,
    links: read.model?.links,
    currentLayerId: read.model?.layerId ?? null,
    refresh: () => read.refresh(),
  });
  const oral = useDesktopTranscriptionOralController({
    sessionId: read.sessionId,
    desktopCall: host?.desktopCall,
    audioLayerIds: (read.model?.layers ?? []).flatMap((layer) =>
      layer.modality === 'audio' ? [layer.id] : [],
    ),
    refresh: () => read.refresh(),
  });
  const playbackDuration = playback.duration;
  const readModel = read.model;
  const selectedUnitId = selection.selectedUnitId;
  const manuscriptList = useMemo(
    () => (
      <DesktopTranscriptionSidePane
        locale={locale}
        model={readModel}
        units={units}
        durationLabel={
          hasAudio && playbackDuration > 0 ? formatManuscriptDuration(playbackDuration) : null
        }
        speakerCount={speakerCount}
        selectedUnitId={selectedUnitId}
        actions={layerActions}
        onOpen={(manuscriptId, layerId) =>
          sideActions.current.draft.leave(() => {
            if (layerId === undefined) sideActions.current.selection.clearSelection();
            if (layerId === undefined) sideActions.current.read.selectManuscript(manuscriptId);
            else sideActions.current.read.selectManuscript(manuscriptId, layerId);
          })
        }
        onSelectUnit={(unitId) => {
          const unit = units.find((item) => item.id === unitId);
          if (unit) selectPlaybackUnitRef.current(unit);
        }}
      />
    ),
    [
      hasAudio,
      layerActions,
      locale,
      playbackDuration,
      readModel,
      selectedUnitId,
      speakerCount,
      units,
    ],
  );
  useRegisterAppSidePane({
    subtitle: '',
    content: manuscriptList,
    enabled: hasAudio || units.length > 0,
  });

  if (host === null) return <Navigate to="/" replace />;

  return (
    <section
      className={`desktop-tx-workspace${layerView.headerFolded ? ' is-header-folded' : ''}${layerView.compact ? ' is-compact' : ''}`}
      data-testid="desktop-transcription-workspace"
    >
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
              <button
                type="button"
                className="desktop-tx-icon desktop-tx-compact"
                aria-pressed={layerView.compact}
                aria-label={t(
                  locale,
                  layerView.compact
                    ? 'app.desktopTranscription.compactOff'
                    : 'app.desktopTranscription.compactOn',
                )}
                onClick={layerView.toggleCompact}
              >
                <JieyuIcon name="Rows3" aria-hidden className={JIEYU_ICON_INLINE} />
                <span className="desktop-tx-zoom-tip" aria-hidden>
                  {t(
                    locale,
                    layerView.compact
                      ? 'app.desktopTranscription.compactOff'
                      : 'app.desktopTranscription.compactOn',
                  )}
                </span>
              </button>
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
                  <div
                    ref={setWaveStage}
                    className="desktop-tx-wave-stage"
                    onPointerDown={(event) => {
                      const wave = playback.waveformRef.current;
                      const zoom = playback.zoomPxPerSec;
                      if (!wave || !(event.target instanceof Node) || !wave.contains(event.target))
                        return;
                      const left = wave.getBoundingClientRect().left;
                      waveCreateRef.current?.(
                        event,
                        (clientX) => ((clientX - left + playback.scrollLeftPx) / zoom) * 1000,
                      );
                    }}
                    onContextMenu={(event) => {
                      const wave = playback.waveformRef.current;
                      const zoom = playback.zoomPxPerSec;
                      if (
                        !wave ||
                        !(event.target instanceof Node) ||
                        !event.currentTarget.contains(event.target)
                      )
                        return;
                      if (
                        event.target instanceof Element &&
                        event.target.closest('.desktop-tx-zoom-dock')
                      )
                        return;
                      event.preventDefault();
                      if (!(zoom > 0)) return;
                      if (playback.isPlaying) playback.togglePlayback();
                      const left = wave.getBoundingClientRect().left;
                      const time = (event.clientX - left + playback.scrollLeftPx) / zoom;
                      setWaveMenu({
                        x: event.clientX,
                        y: event.clientY,
                        time,
                        unitId: waveMenuUnitAt(units, time, event.target, selection.selectedUnitId),
                      });
                    }}
                  >
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
                        skipProcessing={selectedUnit.skipProcessing === true}
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
                  <button
                    type="button"
                    className="desktop-tx-header-fold"
                    aria-label={t(
                      locale,
                      layerView.headerFolded
                        ? 'app.desktopTranscription.layerHeaderExpand'
                        : 'app.desktopTranscription.layerHeaderCollapse',
                    )}
                    title={t(
                      locale,
                      layerView.headerFolded
                        ? 'app.desktopTranscription.layerHeaderExpand'
                        : 'app.desktopTranscription.layerHeaderCollapse',
                    )}
                    aria-expanded={!layerView.headerFolded}
                    onClick={layerView.toggleHeader}
                  >
                    <span aria-hidden className="desktop-tx-header-fold__mark" />
                  </button>
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
          ) : units.length === 0 ? (
            <div className="desktop-tx-no-audio" data-testid="desktop-no-audio">
              <h2>{t(locale, 'app.desktopTranscription.noAudioTitle')}</h2>
              <p>{t(locale, 'app.desktopTranscription.noAudioMessage')}</p>
              <button type="button" className="btn btn-primary" onClick={read.importRecording}>
                {t(locale, 'app.desktopTranscription.importAudio')}
              </button>
            </div>
          ) : null}
          <DesktopLayerDragReason locale={locale} drag={layerActions.drag} />
          <DesktopTranscriptionLane
            locale={locale}
            sessionId={read.sessionId}
            manuscriptId={read.model?.manuscriptId ?? null}
            layerId={read.model?.layerId ?? null}
            layers={read.model?.layers}
            links={read.model?.links}
            view={layerView}
            desktopCall={host?.desktopCall}
            sourceUnits={sourceUnits}
            units={units}
            hasAudio={hasAudio}
            duration={playback.duration}
            zoomPxPerSec={playback.zoomPxPerSec}
            selectedUnitId={selection.selectedUnitId}
            selectedUnitIds={selection.selectedUnitIds}
            bodyDraft={draft.draft}
            onEditBody={draft.edit}
            onComposeBody={draft.setComposing}
            onCommitBody={() => void draft.commit()}
            onSelectUnit={selectPlaybackUnit}
            onSelectUnits={selectPlaybackUnits}
            onClearSelection={() => selection.clearSelection()}
            onSeek={playback.seekTo}
            reload={() => read.refresh()}
            tierRef={tierRef}
            scrollLeftPx={playback.scrollLeftPx}
            waveCreateRef={waveCreateRef}
            waveSkipRef={waveSkipRef}
            waveDeleteRef={waveDeleteRef}
            waveStage={waveStage}
            onWaveSegmentMenu={(unitId, x, y) => openWaveRegionMenu.current(unitId, x, y)}
            onLaneHeight={(layerId, height) => layerActions.setHeight(layerId, height)}
            layerDrag={layerActions.drag}
            audioTools={(layerId, unitId) => (
              <TimelineTranslationAudioControls
                audioSrc={oral.src(layerId, unitId)}
                isRecording={oral.isRecording(layerId, unitId)}
                disabled={oral.busy && !oral.isRecording(layerId, unitId)}
                onStartRecording={() => void oral.start(layerId, unitId)}
                onStopRecording={oral.stop}
                onDeleteRecording={() => void oral.remove(layerId, unitId)}
                onTranscribeRecording={() => oral.transcribe(layerId, unitId)}
              />
            )}
            onLeave={(go) => draft.leave(go)}
            onOpenBody={(layerId, unitId, saved) => {
              const key = textKey(layerId, unitId);
              textSync.current.syncSaved(key, saved);
              void textSync.current.read(unitId, layerId).then((row) => {
                if (row) textSync.current.restore({ ...row, unitId: key }, saved);
              });
            }}
          />
        </div>
      </div>

      {waveMenu === null ? null : (
        <DesktopTranscriptionWaveMenu
          locale={locale}
          menu={waveMenu}
          units={units}
          onClose={() => setWaveMenu(null)}
          onPlayFrom={(time) => {
            playback.seekTo(time);
            if (!playback.isPlaying) playback.togglePlayback();
          }}
          onToggleSkip={(unitId) => waveSkipRef.current?.(unitId)}
          onDelete={(unitId) => waveDeleteRef.current?.(unitId)}
        />
      )}
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
