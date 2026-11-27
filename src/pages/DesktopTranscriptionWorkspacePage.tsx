import { layerLabel } from './DesktopTranscriptionLayerRows';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { TimeRuler } from '../components/TimeRuler';
import { DesktopTranscriptionOralTools } from './DesktopTranscriptionOralTools';
import { RegionActionOverlay } from '../components/transcription/RegionActionOverlay';
import { IconTipButton } from '../components/ui/IconTip';
import { ToastProvider, useToast } from '../contexts/ToastContext';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { useDesktopDraftGuard } from '../desktop/useDesktopDraftGuard';
import { layerTextStore, textKey } from './desktopTranscriptionTextKey';
import { t, useLocale } from '../i18n';
import { getWaveformDisplayHeights } from '../utils/waveformDisplayMode';
import { DesktopZoomControls } from './DesktopTranscriptionWorkspaceControls';
import { DesktopTranscriptionPlaybackBar } from './DesktopTranscriptionPlaybackBar';
import { waveMenuUnitAt, type WaveMenuState } from './DesktopTranscriptionWaveMenu';
import { playbackUnitsFromSource, selectablePlaybackUnits } from './desktopTranscriptionLaneSelect';
import { useDesktopTranscriptionSplitController } from './useDesktopTranscriptionSplitController';
import { mergeBody, nextMergeId, timedUnits } from './desktopTranscriptionMerge';
import { useDesktopTranscriptionMergeController } from './useDesktopTranscriptionMergeController';
import { readDesktopCorpusLocate } from './desktopCorpusLocate';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import { useDesktopTranscriptionSelectionController } from './useDesktopTranscriptionSelectionController';
import { featureFlags } from '../ai/config/featureFlags';
import {
  EMPTY_SPEAKER_FILTER,
  spanAffectedFromUnits,
  speakerFilterActive,
  speakerFilterRevision,
  unitVisibleInSpeakerFilter,
  writeScopeArgs,
  visibleSpeakerLayers,
  type SpeakerFilterState,
} from './desktopTranscriptionSpeakerFilter';
import { confirmCreateAndAssignSpeaker } from './desktopTranscriptionCreateAssign';
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../hooks/transcription/transcriptionPlaybackClock';
import { useDesktopLayerView } from './useDesktopLayerView';
import { useDesktopTranscriptionLayerController } from './useDesktopTranscriptionLayerController';
import { useDesktopTranscriptionLaneController } from './useDesktopTranscriptionLaneController';
import type { LayerListRequest } from './DesktopTranscriptionLayerList';
import type { LayerCommandId } from './desktopTranscriptionLayerCommands';
import { DesktopLayerDragReason } from './useDesktopTranscriptionLayerDragController';
import { useDesktopTranscriptionOralController } from './useDesktopTranscriptionOralController';
import { useDesktopTranscriptionPointController } from './useDesktopTranscriptionPointController';
import { useDesktopTranscriptionRetimeController } from './useDesktopTranscriptionRetimeController';
import { useDesktopTranscriptionMetadataController } from './useDesktopTranscriptionMetadataController';
import { useOralNavigationGuard } from './oralNavigationGuard';
import {
  DesktopTranscriptionLane,
  type WaveCreate,
  type WaveSkip,
} from './DesktopTranscriptionLane';
import { DesktopTranscriptionWorkspaceDialogs } from './DesktopTranscriptionWorkspaceDialogs';
import { DesktopTranscriptionWorkspaceSidePaneMount } from './DesktopTranscriptionWorkspaceSidePaneMount';
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
  const { showToast } = useToast();
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const tierRef = useRef<HTMLDivElement | null>(null);
  const textWheelRef = useRef<HTMLDivElement | null>(null);
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
  const oralGate = useRef({
    holding: false,
    leave: (_go: () => void, _cancel?: () => void) => undefined as void,
  });
  useEffect(() => {
    const stopFlush = host?.onTextClose?.(() => {
      const reportDraft = () => {
        void draft.flushForClose().then((result) => host.reportTextClose?.(result));
      };
      if (oralGate.current.holding) {
        oralGate.current.leave(reportDraft, () => host.reportTextClose?.('stay'));
        return;
      }
      reportDraft();
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
  const [speakerFilter, setSpeakerFilter] = useState<SpeakerFilterState>(EMPTY_SPEAKER_FILTER);
  const [createAssignOpen, setCreateAssignOpen] = useState(false);
  const [createAssignName, setCreateAssignName] = useState('');
  const [createAssignRevision, setCreateAssignRevision] = useState('');
  const filtering = speakerFilterActive(speakerFilter);
  const units = useMemo(() => {
    const all = playbackUnitsFromSource(sourceUnits);
    if (!featureFlags.desktopTranscriptionBatchEditingEnabled || !filtering) return all;
    const visible = new Set(
      (sourceUnits ?? [])
        .filter((unit) => unitVisibleInSpeakerFilter(unit.speakerId, speakerFilter))
        .map((unit) => unit.id),
    );
    return all.filter((unit) => visible.has(unit.id));
  }, [filtering, sourceUnits, speakerFilter]);
  const hasAudio = (read.model?.audioUrl ?? null) !== null;
  const selectionScope = useMemo(
    () => ({
      units: read.model
        ? selectablePlaybackUnits(
            [{ id: read.model.layerId ?? '', units: read.model.units }, ...read.model.layers],
            (id) => unitVisibleInSpeakerFilter(id, speakerFilter),
          )
        : undefined,
      speakers: [
        ...(sourceUnits ?? []),
        ...(read.model?.layers ?? []).flatMap((layer) => layer.units),
      ],
    }),
    [read.model, speakerFilter, sourceUnits],
  );
  const selection = useDesktopTranscriptionSelectionController(
    locate?.unitId ?? null,
    selectionScope.units,
  );
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
    tierWheelCaptureRootRef: textWheelRef,
    onSelectUnit: (unitId) => {
      const unit = units.find((item) => item.id === unitId);
      if (unit) selectPlaybackUnit(unit);
    },
    onRegionContextMenu: (unitId, x, y) => openWaveRegionMenu.current(unitId, x, y),
  });
  openWaveRegionMenu.current = (unitId, x, y) => {
    if (playback.isPlaying) playback.togglePlayback();
    const time = playback.timeAtClientX(x);
    if (time === null) return;
    selection.applyContextMenuTarget(unitId);
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
  const mergeBlockedByFilter =
    filtering &&
    (() => {
      const id = selection.selectedUnitId;
      if (id === null) return false;
      const next = nextMergeId(timedUnits(sourceUnits ?? []), id);
      if (next === null) return false;
      const partner = (sourceUnits ?? []).find((unit) => unit.id === next);
      return partner !== undefined && !unitVisibleInSpeakerFilter(partner.speakerId, speakerFilter);
    })();
  const writeScope = (affectedUnitIds: readonly string[]) =>
    writeScopeArgs(read.model?.manuscriptId, speakerFilter, affectedUnitIds);
  const activeLayer = read.model?.layers.find((layer) => layer.id === read.model?.layerId) ?? null;
  const metadata = useDesktopTranscriptionMetadataController({
    locale,
    sessionId: read.sessionId,
    manuscriptId: read.model?.manuscriptId ?? null,
    desktopCall: host?.desktopCall,
    textLayerId,
    layerName: activeLayer?.name?.zh ?? activeLayer?.name?.en ?? activeLayer?.key ?? '',
    layerNameOf: (id) =>
      layerLabel(read.model?.layers.find((layer) => layer.id === id)?.name, locale, ''),
    orthographyLabel: '',
    selectedUnitIds: selection.selectedUnitIds,
    certaintyOf: (unitId, layerId) =>
      read.model?.layers
        .find((layer) => layer.id === (layerId ?? textLayerId))
        ?.units.find((u) => u.id === unitId)?.selfCertainty ?? null,
    writeScope,
    reload: () => read.refresh(),
    refetchNotes: (sessionId) => read.refetchNotes(sessionId),
    listNotesForUnits: () => read.notes ?? [],
  });
  const merge = useDesktopTranscriptionMergeController({
    locale,
    sessionId: read.sessionId,
    units: sourceUnits ?? [],
    selectedUnitId: selection.selectedUnitId,
    ...(featureFlags.desktopTranscriptionBatchEditingEnabled
      ? { selectedUnitIds: selection.selectedUnitIds }
      : {}),
    textLayerId,
    textOf: (id) => mergeBody(textLayerId, id, draft.draft, sourceUnits, textKey),
    prepareText: draft.persistForStructure,
    onCommitted: draft.structureCommitted,
    desktopCall: host?.desktopCall,
    reload: () => read.refresh(),
    mergeBlockedByFilter,
    filterRevision: speakerFilterRevision(speakerFilter),
    writeScope,
    childIdsOf: (unitId) =>
      spanAffectedFromUnits(
        (read.model?.layers ?? []).flatMap((layer) => layer.units),
        unitId,
      ).slice(1),
  });
  const split = useDesktopTranscriptionSplitController({
    locale,
    sessionId: read.sessionId,
    textLayerId,
    units,
    draft: draft.draft,
    writeScope: (ids) =>
      writeScope(
        ids.flatMap((id) =>
          spanAffectedFromUnits(
            (read.model?.layers ?? []).flatMap((layer) => layer.units),
            id,
          ),
        ),
      ),
    desktopCall: host?.desktopCall,
    playheadSec: getTranscriptionPlaybackClockSnapshot,
    prepareText: draft.persistForStructure,
    onCommitted: draft.structureCommitted,
    reload: () => read.refresh(),
  });
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
  const laneChrome = useDesktopTranscriptionLaneController({
    sessionId: read.sessionId,
    desktopCall: host?.desktopCall,
    manuscriptId: read.model?.manuscriptId ?? null,
    layers: read.model?.layers,
    selectedUnitId: selection.selectedUnitId,
    selectedUnitIds: selection.selectedUnitIds,
    refresh: () => read.refresh(),
    writeScope,
  });
  useEffect(() => {
    setSpeakerFilter(EMPTY_SPEAKER_FILTER);
  }, [read.model?.manuscriptId]);
  const layerActions = useDesktopTranscriptionLayerController({
    sessionId: read.sessionId,
    desktopCall: host?.desktopCall,
    manuscriptId: read.model?.manuscriptId ?? null,
    layers: read.model?.layers,
    links: read.model?.links,
    currentLayerId: read.model?.layerId ?? null,
    refresh: () => read.refresh(),
    onLayerMoved: (layerId, hostIds) => {
      layerView.reveal(hostIds);
      const manuscriptId = read.model?.manuscriptId;
      if (manuscriptId) read.selectManuscript(manuscriptId, layerId);
    },
  });
  const points = useDesktopTranscriptionPointController({
    locale,
    sessionId: read.sessionId,
    manuscriptId: read.model?.manuscriptId ?? null,
    desktopCall: host?.desktopCall,
    layers: read.model?.layers,
    durationSec: playback.duration,
    playheadSec: () => getTranscriptionPlaybackClockSnapshot(),
    seekTo: playback.seekTo,
    clearUnitSelection: () => selection.clearSelection(),
    reload: () => read.refresh(),
    writesBlocked: filtering,
    writeScope: () => writeScope([]),
  });
  const retime = useDesktopTranscriptionRetimeController({
    locale,
    sessionId: read.sessionId,
    manuscriptId: read.model?.manuscriptId ?? null,
    desktopCall: host?.desktopCall,
    filtering,
    writeScope: () => writeScope([]),
    reload: () => read.refresh(),
  });
  const hasTimedUnits = (sourceUnits ?? []).some(
    (unit) => unit.startMs !== null && unit.endMs !== null,
  );
  const oral = useDesktopTranscriptionOralController({
    sessionId: read.sessionId,
    desktopCall: host?.desktopCall,
    audioLayerIds: (read.model?.layers ?? []).flatMap((layer) =>
      layer.modality === 'audio' ? [layer.id] : [],
    ),
    structureKey: (sourceUnits ?? []).map((unit) => unit.id).join('\n'),
    refresh: () => read.refresh(),
  });
  oralGate.current = { holding: oral.holding, leave: oral.leave };
  useOralNavigationGuard(oral.holding, oral.leave);
  const [layerRequest, setLayerRequest] = useState<LayerListRequest | null>(null);
  const layerRequestNonce = useRef(0);
  const runLayerCommand = (layerId: string, command: LayerCommandId) => {
    if (command === 'up' || command === 'down') {
      layerActions.move(layerId, command);
      return;
    }
    if (command === 'attach') {
      layerActions.drag.attachToCurrent(layerId);
      return;
    }
    if (command === 'return') {
      layerActions.drag.returnToRoot(layerId);
      return;
    }
    layerRequestNonce.current += 1;
    const action = command;
    setLayerRequest({ nonce: layerRequestNonce.current, layerId, action });
  };
  const sidePane = (
    <DesktopTranscriptionWorkspaceSidePaneMount
      locale={locale}
      hasAudio={hasAudio}
      playbackDuration={playback.duration}
      speakerCount={speakerCount}
      units={units}
      sourceUnits={selectionScope.speakers}
      readModel={read.model}
      selectedUnitId={selection.selectedUnitId}
      layerActions={layerActions}
      layerRequest={layerRequest}
      speakers={laneChrome.speakers ?? []}
      speakerFilter={speakerFilter}
      setSpeakerFilter={setSpeakerFilter}
      setCreateAssignName={setCreateAssignName}
      setCreateAssignRevision={setCreateAssignRevision}
      setCreateAssignOpen={setCreateAssignOpen}
      onRetimeAsk={() => retime.ask()}
      leaveThen={(go) => oral.leave(() => draft.leave(go))}
      onOpenManuscript={(manuscriptId, layerId) => {
        selection.clearSelection();
        if (layerId === undefined) read.selectManuscript(manuscriptId);
        else read.selectManuscript(manuscriptId, layerId);
      }}
      selectPlaybackUnit={(unit) => selectPlaybackUnitRef.current(unit)}
    />
  );

  if (host === null) {
    return (
      <>
        {sidePane}
        <Navigate to="/" replace />
      </>
    );
  }

  return (
    <section
      className={`desktop-tx-workspace${layerView.headerFolded ? ' is-header-folded' : ''}${layerView.compact ? ' is-compact' : ''}${hasAudio ? '' : ' is-no-audio'}`}
      data-testid="desktop-transcription-workspace"
    >
      {sidePane}
      <div className="desktop-tx-workspace__body">
        <div className="desktop-tx-workspace__main">
          {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}
          {hasAudio ? (
            <DesktopTranscriptionPlaybackBar
              locale={locale}
              playback={playback}
              layerView={layerView}
              retime={retime}
              hasTimedUnits={hasTimedUnits}
              readout={<PlaybackReadout duration={playback.duration} noAudio={false} />}
            />
          ) : null}
          <div className="desktop-tx-stage">
            {hasAudio ? (
              <>
                <div className="desktop-tx-waveband">
                  <div className="desktop-tx-band-label">
                    {t(locale, 'transcription.wave.toolbar.displayMode.waveform')}
                  </div>
                  <div
                    ref={waveHostRef}
                    onPointerMoveCapture={(event) => {
                      const dock = event.currentTarget.querySelector('.desktop-tx-zoom-dock');
                      if (!dock) return;
                      const rect = dock.getBoundingClientRect();
                      dock.toggleAttribute(
                        'data-hovered',
                        event.clientX >= rect.left &&
                          event.clientX <= rect.right &&
                          event.clientY >= rect.top &&
                          event.clientY <= rect.bottom,
                      );
                    }}
                    onPointerLeave={(event) => {
                      event.currentTarget
                        .querySelector('.desktop-tx-zoom-dock')
                        ?.removeAttribute('data-hovered');
                    }}
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
                        if (
                          !playback.isReady ||
                          !(zoom > 0) ||
                          !wave ||
                          !(event.target instanceof Node) ||
                          !wave.contains(event.target)
                        )
                          return;
                        // Freeze scroll for the gesture. Live getScroll() grows if the drag
                        // itself scrolls, and the new segment then covers the next gap.
                        const left = wave.getBoundingClientRect().left;
                        const scroll =
                          playback.instanceRef.current?.getScroll() ?? playback.scrollLeftPx;
                        waveCreateRef.current?.(
                          event,
                          (clientX) => ((clientX - left + scroll) / zoom) * 1000,
                        );
                      }}
                      onContextMenu={(event) => {
                        const wave = playback.waveformRef.current;
                        if (
                          !playback.isReady ||
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
                        const time = playback.timeAtClientX(event.clientX);
                        if (time === null) return;
                        if (playback.isPlaying) playback.togglePlayback();
                        setWaveMenu({
                          x: event.clientX,
                          y: event.clientY,
                          time,
                          unitId: waveMenuUnitAt(
                            units,
                            time,
                            event.target,
                            selection.selectedUnitId,
                          ),
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
                    </div>
                    <div ref={playback.spectrogramRef} className="desktop-tx-spectrogram" />
                    {playback.fitPxPerSec > 0 ? (
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
                </div>
                {playback.duration > 0 ? (
                  <div className="desktop-tx-ruler">
                    <IconTipButton
                      className="desktop-tx-header-fold"
                      label={t(
                        locale,
                        layerView.headerFolded
                          ? 'app.desktopTranscription.layerHeaderExpand'
                          : 'app.desktopTranscription.layerHeaderCollapse',
                      )}
                      aria-expanded={!layerView.headerFolded}
                      onClick={layerView.toggleHeader}
                    >
                      <span aria-hidden className="desktop-tx-header-fold__mark" />
                    </IconTipButton>
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
            <div ref={textWheelRef} className="desktop-tx-tiers">
              <DesktopTranscriptionLane
                locale={locale}
                sessionId={read.sessionId}
                manuscriptId={read.model?.manuscriptId ?? null}
                layerId={read.model?.layerId ?? null}
                layers={visibleSpeakerLayers(read.model?.layers, speakerFilter)}
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
                onSelectUnit={(unit) => {
                  points.clearSelection();
                  selectPlaybackUnit(unit);
                }}
                onSelectUnits={(picked) => {
                  points.clearSelection();
                  selectPlaybackUnits(picked);
                }}
                {...(featureFlags.desktopTranscriptionBatchEditingEnabled
                  ? {
                      onClickUnit: (
                        unit: DesktopPlaybackUnit,
                        mods: { toggle: boolean; range: boolean },
                      ) => {
                        points.clearSelection();
                        draft.leave(() => selection.clickUnit(unit, mods));
                      },
                    }
                  : {})}
                onPrepareContextMenu={selection.applyContextMenuTarget}
                onClearSelection={() => {
                  points.clearSelection();
                  selection.clearSelection();
                }}
                onSeek={playback.seekTo}
                reload={() => read.refresh()}
                tierRef={tierRef}
                scrollLeftPx={playback.scrollLeftPx}
                waveCreateRef={waveCreateRef}
                waveCreateEnabled={!read.selectionPending && !filtering}
                filteringSelection={filtering}
                writeScope={writeScope}
                scopeUnits={(read.model?.layers ?? []).flatMap((layer) => layer.units)}
                affectedVisible={(ids) =>
                  ids.every((id) => {
                    const unit = (read.model?.layers ?? [])
                      .flatMap((layer) => layer.units)
                      .find((row) => row.id === id);
                    return (
                      unit === undefined ||
                      unitVisibleInSpeakerFilter(unit.speakerId, speakerFilter)
                    );
                  })
                }
                writeBlockedMessage={t(locale, 'app.desktopTranscription.writeBlockedByFilter')}
                waveSkipRef={waveSkipRef}
                waveDeleteRef={waveDeleteRef}
                onSplit={(unitId) => split.ask(unitId, 'playhead')}
                canMerge={merge.canMerge}
                onMerge={(unitId) => void merge.ask(unitId)}
                waveStage={waveStage}
                onWaveSegmentMenu={(unitId, x, y) => openWaveRegionMenu.current(unitId, x, y)}
                onLaneHeight={(layerId, height) => layerActions.setHeight(layerId, height)}
                onLayerStyle={(layerId, change) => layerActions.setStyle(layerId, change)}
                loadOrthographies={layerActions.orthographies}
                onSelectLayer={(layerId) => {
                  const manuscriptId = read.model?.manuscriptId;
                  const layer = read.model?.layers.find((item) => item.id === layerId);
                  if (
                    manuscriptId &&
                    layer?.contentType === 'transcription' &&
                    layer.tierType === 'time-aligned'
                  ) {
                    selection.clearSelection();
                    read.selectManuscript(manuscriptId, layerId);
                  }
                }}
                layerDrag={layerActions.drag}
                layerHosts
                onLayerCommand={runLayerCommand}
                onCreateLayer={layerActions.create}
                onCreatePair={layerActions.createPair}
                onCreateTranscription={() =>
                  layerActions.create(
                    'transcription',
                    t(locale, 'app.desktopTranscription.contextLayerTranscription'),
                  )
                }
                lanes={laneChrome}
                {...(featureFlags.desktopTranscriptionBatchEditingEnabled
                  ? {
                      metadata: (layerId, ids) =>
                        read.model?.layers.find((layer) => layer.id === layerId)?.modality ===
                        'audio'
                          ? undefined
                          : metadata.laneMetadataFor(layerId, ids),
                    }
                  : {})}
                pointsApi={points}
                audioTools={(layerId, unitId) => (
                  <DesktopTranscriptionOralTools
                    oral={oral}
                    layerId={layerId}
                    unitId={unitId}
                    playing={playback.isPlaying}
                    togglePlayback={playback.togglePlayback}
                  />
                )}
                openAudioLayerId={oral.openLayerId}
                onLeave={(go) => oral.leave(() => draft.leave(go))}
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
        </div>
      </div>
      <DesktopTranscriptionWorkspaceDialogs
        locale={locale}
        draft={draft}
        oral={oral}
        retime={retime}
        splitDialog={split.dialog}
        mergeDialog={merge.dialog}
        createAssignOpen={createAssignOpen}
        createAssignName={createAssignName}
        setCreateAssignOpen={setCreateAssignOpen}
        setCreateAssignName={setCreateAssignName}
        onCreateAssignConfirm={() =>
          confirmCreateAndAssignSpeaker({
            name: createAssignName,
            sessionId: read.sessionId,
            manuscriptId: read.model?.manuscriptId ?? null,
            desktopCall: host.desktopCall,
            unitIds: selection.selectedUnitIds,
            speakerFilter,
            revisionAtOpen: createAssignRevision,
            locale,
            showToast,
            refresh: () => read.refresh(),
            close: () => setCreateAssignOpen(false),
          })
        }
        waveMenu={waveMenu}
        units={units}
        selectedUnitIds={selection.selectedUnitIds}
        setWaveMenu={setWaveMenu}
        onPlayFrom={(time) => {
          playback.seekTo(time);
          if (!playback.isPlaying) playback.togglePlayback();
        }}
        onToggleSkip={(unitId) => waveSkipRef.current?.(unitId)}
        onDelete={(unitId) => waveDeleteRef.current?.(unitId)}
        onSplit={(unitId, time) => split.ask(unitId, time)}
        canMerge={merge.canMerge}
        onMerge={(unitId) => void merge.ask(unitId)}
        {...(featureFlags.desktopTranscriptionBatchEditingEnabled
          ? { notes: metadata.notesDialogBindings, waveMetadata: metadata.waveMetadata }
          : {})}
      />
    </section>
  );
}
