import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DesktopTranscriptionFoldedStrip,
  DesktopTranscriptionLayerLabel,
} from './DesktopTranscriptionLayerLabel';
import { buildLayerTree, type LayerTreeRow } from './desktopTranscriptionLayerTree';
import type { DesktopLayerView } from './useDesktopLayerView';
import { DesktopTranscriptionCreatePreview } from './DesktopTranscriptionCreatePreview';
import { DesktopWaveformEdges } from './DesktopWaveformEdges';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, type Locale } from '../i18n';
import { getTranscriptionPlaybackClockSnapshot } from '../hooks/transcription/transcriptionPlaybackClock';
import { useToast } from '../contexts/ToastContext';
import { DesktopTranscriptionEdgeChrome } from './DesktopTranscriptionEdgeChrome';
import {
  desktopSegmentFrame,
  edgeNotice,
  followTip,
  playbackWithPreview,
  seamLeft,
  seamSeconds,
} from './desktopTranscriptionEdgeView';
import { useDesktopTranscriptionEdgeController } from './useDesktopTranscriptionEdgeController';
import { edgeFocusKind } from './desktopTranscriptionEdge';
import { NO_CONFLICTS } from './desktopTranscriptionEdgeSession';
import type { RouteLayer, RouteLink } from './desktopTranscriptionCreateRoute';
import { textKey } from './desktopTranscriptionTextKey';
import {
  DesktopTranscriptionLayerRows,
  layerLabel,
  restoreBody,
  sameCard,
  type LayerCardRef,
  type LayerRowLayer,
} from './DesktopTranscriptionLayerRows';
import {
  formatPlaybackTime,
  type DesktopPlaybackUnit,
} from './useDesktopTranscriptionMediaController';

export type WaveCreate = (
  event: ReactPointerEvent<HTMLElement>,
  msAt: (clientX: number) => number,
) => void;

export function DesktopTranscriptionLane(props: {
  locale: Locale;
  sessionId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  layers: readonly (RouteLayer & LayerRowLayer)[] | undefined;
  links: readonly RouteLink[] | undefined;
  view: DesktopLayerView;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  sourceUnits: readonly { id: string; startMs: number | null; endMs: number | null }[] | undefined;
  units: readonly DesktopPlaybackUnit[];
  hasAudio: boolean;
  duration: number;
  zoomPxPerSec: number;
  selectedUnitId: string | null;
  bodyDraft: { unitId: string; text: string } | null;
  onEditBody: (unitId: string, text: string, savedText: string) => void;
  onComposeBody: (composing: boolean) => void;
  onCommitBody: () => void;
  onSelectUnit: (unit: DesktopPlaybackUnit) => void;
  reload: () => Promise<unknown>;
  tierRef: RefObject<HTMLDivElement | null>;
  scrollLeftPx: number;
  waveCreateRef: MutableRefObject<WaveCreate | null>;
  /** The waveform stage: a waveform drag draws its create preview here. */
  waveStage: HTMLElement | null;
  /** Runs `go` once the open body draft is saved or dropped (the leave guard). */
  onLeave: (go: () => void) => void;
  /** A body editor opened on `layerId`'s text of `unitId`: bring back its stored draft. */
  onOpenBody: (layerId: string, unitId: string, savedText: string) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<LayerCardRef | null>(null);
  const [focus, setFocus] = useState<LayerCardRef | null>(null);
  const [createLayerId, setCreateLayerId] = useState<string | null>(null);
  const [waveDrag, setWaveDrag] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const selectedId = props.selectedUnitId;
  useEffect(() => {
    const keep = (card: LayerCardRef | null) => (card?.unitId === selectedId ? card : null);
    setEditing(keep);
    setFocus(keep);
    setChildId(null);
  }, [selectedId]);
  const childRow = childId === null ? undefined : subdivisionRow(props.layers, childId);
  const child = childRow?.units.find((unit) => unit.id === childId);
  const timedUnits = (props.sourceUnits ?? []).flatMap((unit) =>
    unit.startMs === null || unit.endMs === null
      ? []
      : [{ id: unit.id, startMs: unit.startMs, endMs: unit.endMs }],
  );
  const edges = useDesktopTranscriptionEdgeController({
    sessionId: props.sessionId,
    manuscriptId: props.manuscriptId,
    layerId: props.layerId,
    desktopCall: props.desktopCall,
    units: timedUnits,
    otherRowUnits: (props.layers ?? [])
      .filter((layer) => layer.id !== props.layerId)
      .map((layer) => layer.units.flatMap(timedOf)),
    hasMedia: props.hasAudio,
    zoomPxPerSec: props.zoomPxPerSec,
    selectedUnitId: child?.id ?? props.selectedUnitId,
    playheadMs: () => {
      const sec = getTranscriptionPlaybackClockSnapshot();
      return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
    },
    reload: () => props.reload().then(() => undefined),
    message: (kind, time) => edgeNotice(props.locale, kind, time),
    snapMessage: (kind, time) =>
      tf(
        props.locale,
        kind === 'neighbor'
          ? 'app.desktopTranscription.snapNeighbor'
          : 'app.desktopTranscription.snapPlayhead',
        { time },
      ),
    draftSavedMessage: t(props.locale, 'app.desktopTranscription.draftSaved'),
    notify: (message, tone) => toast.showToast(message, tone ?? 'error'),
    focusUnit: (unitId) =>
      props.tierRef.current
        ?.querySelector<HTMLElement>(`[data-unit-id="${CSS.escape(unitId)}"]`)
        ?.focus(),
    createRoute: { layers: props.layers ?? [], links: props.links ?? [] },
    selectUnits: (unitIds) => {
      const hit = props.units.find((unit) => unitIds.includes(unit.id));
      if (hit) props.onSelectUnit(hit);
    },
  });
  const keyOf = (unitId: string) =>
    props.layerId === null ? unitId : textKey(props.layerId, unitId);
  const mainCard = (unitId: string) => ({ layerId: props.layerId ?? '', unitId });
  const openEdit = (card: LayerCardRef, savedText: string) => {
    const main = card.layerId === (props.layerId ?? '');
    const go = () => {
      setFocus(main ? null : card);
      setEditing(card);
      if (!main) props.onOpenBody(card.layerId, card.unitId, savedText);
    };
    const key = main ? keyOf(card.unitId) : textKey(card.layerId, card.unitId);
    if (props.bodyDraft === null || props.bodyDraft.unitId === key) go();
    else props.onLeave(go);
  };
  const waveTarget = useRef<string | null>(null);
  waveTarget.current = focus?.layerId ?? null;
  const waveCreateRef = props.waveCreateRef;
  const beginWaveCreate = edges.beginWaveCreate;
  useEffect(() => {
    waveCreateRef.current = (event, msAt) => {
      setCreateLayerId(waveTarget.current);
      setWaveDrag(true);
      beginWaveCreate(event, msAt, waveTarget.current);
    };
    return () => {
      waveCreateRef.current = null;
    };
  }, [beginWaveCreate, waveCreateRef]);
  const previewFrame =
    edges.ui.preview?.unitId === null && edges.ui.preview
      ? desktopSegmentFrame(
          {
            id: 'draft',
            startTime: edges.ui.preview.startMs / 1000,
            endTime: edges.ui.preview.endMs / 1000,
            text: '',
          },
          props.duration,
          0,
          1,
          props.zoomPxPerSec,
        )
      : null;
  const follow = followTip(props.layers ?? [], edges.ui.preview);
  const followedTip =
    edges.ui.preview === null
      ? null
      : follow !== null
        ? {
            text: tf(
              props.locale,
              follow.edge === 'start'
                ? 'app.desktopTranscription.edgeFollowStart'
                : 'app.desktopTranscription.edgeFollowEnd',
              { count: follow.count, time: formatPlaybackTime(follow.timeMs / 1000) },
            ),
            x: edges.ui.preview.x,
            y: edges.ui.preview.y,
          }
        : edges.ui.preview.tip
          ? { text: edges.ui.preview.tip, x: edges.ui.preview.x, y: edges.ui.preview.y }
          : null;
  const mainSelected = props.units.find((unit) => unit.id === props.selectedUnitId) ?? null;
  const selected: DesktopPlaybackUnit | null = child ?? mainSelected;
  const edgeRow = childRow?.timed ?? timedUnits;
  const wavePreview =
    waveDrag && props.waveStage && edges.ui.preview?.unitId === null && props.zoomPxPerSec > 0
      ? createPortal(
          <DesktopTranscriptionCreatePreview
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              left: (edges.ui.preview.startMs / 1000) * props.zoomPxPerSec - props.scrollLeftPx,
              width: Math.max(
                2,
                ((edges.ui.preview.endMs - edges.ui.preview.startMs) / 1000) * props.zoomPxPerSec,
              ),
              pointerEvents: 'none',
              zIndex: 'calc(var(--z-modal) - 50)',
            }}
          />,
          props.waveStage,
        )
      : null;
  const pickUnit = (unitId: string) => {
    const hit = props.units.find((unit) => unit.id === unitId);
    if (hit) props.onSelectUnit(hit);
  };
  const waveEdges =
    props.waveStage && props.hasAudio && props.zoomPxPerSec > 0
      ? createPortal(
          <DesktopWaveformEdges
            units={timedUnits}
            preview={edges.ui.preview}
            zoomPxPerSec={props.zoomPxPerSec}
            scrollLeftPx={props.scrollLeftPx}
            selectedUnitId={props.selectedUnitId}
            onEdge={(unitId, edge, event) => {
              pickUnit(unitId);
              edges.beginDrag(unitId, edge, event);
            }}
            onMove={(unitId, event) => edges.beginMove(unitId, event, () => pickUnit(unitId))}
          />,
          props.waveStage,
        )
      : null;
  const seconds = seamSeconds(edges.ui.edge, edges.ui.preview, props.units);
  const tree = useMemo(
    () => buildLayerTree(props.layers ?? [], props.links ?? [], props.view.fold),
    [props.layers, props.links, props.view.fold],
  );
  const mainId = props.layerId ?? '';
  // A fold that hides the focused layer hands focus to its host and saves the draft first.
  const handOff = (hiddenIds: readonly string[], hostId: string | null, apply: () => void) => {
    const affects =
      (focus !== null && hiddenIds.includes(focus.layerId)) ||
      (editing !== null && hiddenIds.includes(editing.layerId));
    if (!affects) {
      apply();
      return;
    }
    props.onLeave(() => {
      setEditing(null);
      setFocus(
        hostId === null || hostId === mainId || selectedId === null
          ? null
          : { layerId: hostId, unitId: selectedId },
      );
      apply();
    });
  };
  const toggleGroup = (layerId: string) => {
    const hidden: string[] = [];
    const family = new Set([layerId]);
    for (const row of tree) {
      if (row.hostId !== null && family.has(row.hostId)) {
        family.add(row.layerId);
        hidden.push(row.layerId);
      }
    }
    if (props.view.fold.groups.includes(layerId)) props.view.toggleGroup(layerId);
    else handOff(hidden, layerId, () => props.view.toggleGroup(layerId));
  };
  const collapseLayer = (layerId: string) =>
    handOff([layerId], tree.find((row) => row.layerId === layerId)?.hostId ?? null, () =>
      props.view.toggleRow(layerId),
    );
  const mainName = layerLabel(
    props.layers?.find((layer) => layer.id === props.layerId)?.name,
    props.locale,
    t(props.locale, 'app.desktopTranscription.contextLayerTranscription'),
  );
  const hostNames = (row: LayerTreeRow) =>
    [...(row.hostId ? [row.hostId] : []), ...row.otherHostIds].map((id) =>
      layerLabel(props.layers?.find((layer) => layer.id === id)?.name, props.locale, ''),
    );
  const renderMain = (row: LayerTreeRow) =>
    props.hasAudio || props.units.length > 0 ? (
      <>
        {row.folded ? (
          <DesktopTranscriptionFoldedStrip
            layerId={row.layerId}
            locale={props.locale}
            name={mainName}
            row={row}
            hostNames={hostNames(row)}
            segmentCount={props.units.length}
            onExpand={() => props.view.toggleRow(row.layerId)}
          />
        ) : null}

        <div
          className={`desktop-tx-lane${row.folded ? ' is-folded' : ''}`}
          data-testid="desktop-readonly-timeline"
        >
          <DesktopTranscriptionLayerLabel
            locale={props.locale}
            name={mainName}
            row={row}
            hostNames={hostNames(row)}
            focused={focus === null}
            onToggleGroup={() => toggleGroup(row.layerId)}
            onCollapse={() => collapseLayer(row.layerId)}
          />
          <div ref={props.tierRef} className="desktop-tx-lane__body">
            <div
              className="desktop-tx-lane__track"
              style={
                props.zoomPxPerSec > 0 ? { width: props.duration * props.zoomPxPerSec } : undefined
              }
              onPointerDown={(event) => {
                setCreateLayerId(null);
                setWaveDrag(false);
                edges.beginCreate(event);
              }}
            >
              {props.units.map((unit, index) => {
                const shown = playbackWithPreview(unit, edges.ui.preview);
                const frame = desktopSegmentFrame(
                  shown,
                  props.duration,
                  index,
                  props.units.length,
                  props.zoomPxPerSec,
                );
                const shared = edges.ui.edge?.edge === 'shared';
                const selected = unit.id === props.selectedUnitId && !shared;
                const active = selected && sameCard(editing, mainCard(unit.id));
                const shownSelected = selected && focus === null;
                const draft =
                  props.bodyDraft?.unitId === keyOf(unit.id) ? props.bodyDraft.text : unit.text;
                return (
                  <TimelineAnnotationItem
                    key={unit.id}
                    unitId={unit.id}
                    left={frame.left ?? 0}
                    width={frame.width ?? 0}
                    isSelected={shownSelected}
                    isActive={active}
                    isCompact={false}
                    title={unit.text}
                    draft={draft}
                    onClick={() => {
                      if (selected && focus === null) {
                        openEdit(mainCard(unit.id), unit.text);
                        return;
                      }
                      if (selected) {
                        props.onLeave(() => {
                          setFocus(null);
                          setEditing(null);
                          setChildId(null);
                        });
                        return;
                      }
                      props.onSelectUnit(unit);
                    }}
                    onContextMenu={(event) => edges.openMenu(unit.id, event)}
                    onDoubleClick={ignoreAnnotationEvent}
                    onResizeStartPointerDown={(event) => edges.beginDrag(unit.id, 'start', event)}
                    onResizeEndPointerDown={(event) => edges.beginDrag(unit.id, 'end', event)}
                    onChange={(event) => editBody(props, keyOf(unit.id), unit, event)}
                    onCompositionStart={() => props.onComposeBody(true)}
                    onCompositionEnd={() => props.onComposeBody(false)}
                    onBlur={() => props.onCommitBody()}
                    onKeyDown={(event) =>
                      restoreBody(props.onEditBody, keyOf(unit.id), unit, event, () =>
                        setEditing(null),
                      )
                    }
                  />
                );
              })}
              {previewFrame && createLayerId === null ? (
                <DesktopTranscriptionCreatePreview
                  className="desktop-tx-create"
                  style={previewFrame}
                  radius={4}
                />
              ) : null}
              {seconds === null ? null : (
                <div
                  className="desktop-tx-seam"
                  style={{ left: seamLeft(seconds, props.duration, props.zoomPxPerSec) }}
                  onPointerDown={(event) => {
                    const edge = edges.ui.edge;
                    if (edge?.edge !== 'shared') return;
                    const unit = props.units.find((item) => item.id === edge.unitId);
                    const other = props.units.find((item) => item.id === edge.otherId);
                    edges.beginDrag(
                      edge.unitId,
                      unit && other && unit.endTime === other.startTime ? 'end' : 'start',
                      event,
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </>
    ) : null;
  return (
    <>
      {wavePreview}
      {waveEdges}
      {props.hasAudio || props.units.length > 0 ? (
        <DesktopTranscriptionLayerRows
          locale={props.locale}
          layers={props.layers ?? []}
          tree={tree}
          mainLayerId={props.layerId}
          renderMain={renderMain}
          onToggleGroup={toggleGroup}
          onCollapse={collapseLayer}
          onExpand={props.view.toggleRow}
          duration={props.duration}
          zoomPxPerSec={props.zoomPxPerSec}
          scrollLeftPx={props.scrollLeftPx}
          focus={focus}
          editing={editing}
          createLayerId={createLayerId}
          createFrame={previewFrame}
          bodyDraft={props.bodyDraft}
          preview={edges.ui.preview}
          onRowMenu={(card, name, event) => {
            const linked = props.units.some((unit) => unit.id === card.unitId);
            edges.openMenu(card.unitId, event, card.layerId, name, !linked);
          }}
          onRowResize={(unitId, edge, event) => edges.beginDrag(unitId, edge, event)}
          onPick={(card, unit) => {
            if (sameCard(focus, card)) {
              openEdit(card, unit.text);
              return;
            }
            const hit = props.units.find((item) => item.id === card.unitId);
            props.onLeave(() => {
              setFocus(card);
              setEditing(null);
              setChildId(hit ? null : card.unitId);
              if (hit && hit.id !== selectedId) props.onSelectUnit(hit);
            });
          }}
          onEditBody={props.onEditBody}
          onComposeBody={props.onComposeBody}
          onCommitBody={props.onCommitBody}
          onStopEdit={() => setEditing(null)}
          onCreate={(event, layerId, units) => {
            setCreateLayerId(layerId);
            setWaveDrag(false);
            edges.beginCreate(event, { layerId, units });
          }}
        />
      ) : null}
      <DesktopTranscriptionEdgeChrome
        locale={props.locale}
        place={
          selected === null
            ? null
            : {
                index: edgeRow.findIndex((unit) => unit.id === selected.id) + 1,
                total: edgeRow.length,
              }
        }
        start={edges.ui.raw.start ?? (selected ? formatPlaybackTime(selected.startTime) : '')}
        end={edges.ui.raw.end ?? (selected ? formatPlaybackTime(selected.endTime) : '')}
        saved={
          (edges.ui.raw.saved && edges.ui.raw.unitId === selected?.id) ||
          (props.bodyDraft !== null &&
            selected !== null &&
            props.bodyDraft.unitId === keyOf(selected.id) &&
            props.bodyDraft.text !== selected.text)
        }
        hasMedia={props.hasAudio}
        reason={
          edges.ui.reason !== null && edges.ui.reason.unitId === selected?.id
            ? edges.ui.reason.message
            : null
        }
        tip={followedTip}
        edgeFocus={
          edges.ui.edge !== null &&
          (edges.ui.edge.unitId === selected?.id || edges.ui.edge.otherId === selected?.id)
            ? edgeFocusKind(edgeRow, edges.ui.edge)
            : null
        }
        conflicts={edges.ui.raw.unitId === selected?.id ? edges.ui.raw.conflicts : NO_CONFLICTS}
        stale={edges.ui.stale}
        menu={edges.ui.menu}
        deletePrompt={edges.ui.deletePrompt?.counts ?? null}
        onRebase={(edge) => void edges.rebaseDraft(edge)}
        onDiscardDraft={(edge) => void edges.discardDraft(edge)}
        onDropStale={() => void edges.dropStale()}
        onEdit={edges.editTime}
        onFlush={edges.flushTime}
        onCloseMenu={edges.closeMenu}
        onLink={edges.linkShared}
        onClearText={edges.clearLayerText}
        onAskDelete={() => {
          const unitId = edges.ui.menu?.unitId;
          if (unitId) void edges.askDelete(unitId);
        }}
        onCancelDelete={edges.cancelDelete}
        onConfirmDelete={edges.confirmDelete}
      />
    </>
  );
}

function timedOf(unit: { id: string; startMs: number | null; endMs: number | null }) {
  return unit.startMs === null || unit.endMs === null
    ? []
    : [{ id: unit.id, startMs: unit.startMs, endMs: unit.endMs }];
}

function ignoreAnnotationEvent() {
  return undefined;
}

function editBody(
  props: {
    onEditBody: (unitId: string, text: string, savedText: string) => void;
  },
  key: string,
  unit: DesktopPlaybackUnit,
  event: ChangeEvent<HTMLInputElement>,
) {
  props.onEditBody(key, event.target.value, unit.text);
}

/** The non-linked row that holds `unitId`, with its units shaped for the edge controller. */
function subdivisionRow(layers: readonly LayerRowLayer[] | undefined, unitId: string) {
  const layer = layers?.find((item) => item.units.some((unit) => unit.id === unitId));
  if (!layer) return undefined;
  const units = layer.units.flatMap((unit) =>
    unit.startMs === null || unit.endMs === null
      ? []
      : [
          {
            id: unit.id,
            startTime: unit.startMs / 1000,
            endTime: unit.endMs / 1000,
            text: unit.text,
          },
        ],
  );
  return { units, timed: layer.units.flatMap(timedOf) };
}
