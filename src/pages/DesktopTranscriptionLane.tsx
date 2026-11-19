import {
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, type Locale } from '../i18n';
import { getTranscriptionPlaybackClockSnapshot } from '../hooks/transcription/transcriptionPlaybackClock';
import { useToast } from '../contexts/ToastContext';
import { DesktopTranscriptionEdgeChrome } from './DesktopTranscriptionEdgeChrome';
import {
  desktopSegmentFrame,
  edgeNotice,
  playbackWithPreview,
  seamLeft,
  seamSeconds,
} from './desktopTranscriptionEdgeView';
import { useDesktopTranscriptionEdgeController } from './useDesktopTranscriptionEdgeController';
import type { EdgeActions } from './desktopTranscriptionEdgeActions';
import { edgeFocusKind } from './desktopTranscriptionEdge';
import { NO_CONFLICTS } from './desktopTranscriptionEdgeSession';
import {
  formatPlaybackTime,
  type DesktopPlaybackUnit,
} from './useDesktopTranscriptionMediaController';

export type WaveCreate = EdgeActions['beginWaveCreate'];

export function DesktopTranscriptionLane(props: {
  locale: Locale;
  sessionId: string | null;
  manuscriptId: string | null;
  layerId: string | null;
  layers: readonly { id: string; name: Record<string, string> }[] | undefined;
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
  waveCreateRef?: MutableRefObject<WaveCreate | null>;
}) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    if (editingId !== null && editingId !== props.selectedUnitId) setEditingId(null);
  }, [editingId, props.selectedUnitId]);
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
    hasMedia: props.hasAudio,
    zoomPxPerSec: props.zoomPxPerSec,
    selectedUnitId: props.selectedUnitId,
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
  });
  const waveCreateRef = props.waveCreateRef;
  useEffect(() => {
    if (!waveCreateRef) return undefined;
    waveCreateRef.current = edges.beginWaveCreate;
    return () => {
      waveCreateRef.current = null;
    };
  }, [edges.beginWaveCreate, waveCreateRef]);
  const selected = props.units.find((unit) => unit.id === props.selectedUnitId) ?? null;
  const seconds = seamSeconds(edges.ui.edge, edges.ui.preview, props.units);
  return (
    <>
      {props.hasAudio || props.units.length > 0 ? (
        <div className="desktop-tx-lane" data-testid="desktop-readonly-timeline">
          <div className="desktop-tx-band-label">
            {layerLabel(
              props.layers,
              props.layerId,
              props.locale,
              t(props.locale, 'app.desktopTranscription.contextLayerTranscription'),
            )}
          </div>
          <div ref={props.tierRef} className="desktop-tx-lane__body">
            <div
              className="desktop-tx-lane__track"
              style={
                props.zoomPxPerSec > 0 ? { width: props.duration * props.zoomPxPerSec } : undefined
              }
              onPointerDown={edges.beginCreate}
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
                const editing = selected && editingId === unit.id;
                const draft =
                  props.bodyDraft?.unitId === unit.id ? props.bodyDraft.text : unit.text;
                return (
                  <TimelineAnnotationItem
                    key={unit.id}
                    unitId={unit.id}
                    left={frame.left ?? 0}
                    width={frame.width ?? 0}
                    isSelected={selected}
                    isActive={editing}
                    isCompact={false}
                    title={unit.text}
                    draft={draft}
                    onClick={() => {
                      if (selected) {
                        setEditingId(unit.id);
                        return;
                      }
                      props.onSelectUnit(unit);
                    }}
                    onContextMenu={(event) => edges.openMenu(unit.id, event)}
                    onDoubleClick={ignoreAnnotationEvent}
                    onResizeStartPointerDown={(event) => edges.beginDrag(unit.id, 'start', event)}
                    onResizeEndPointerDown={(event) => edges.beginDrag(unit.id, 'end', event)}
                    onChange={(event) => editBody(props, unit, event)}
                    onBlur={() => props.onCommitBody()}
                    onKeyDown={(event) => restoreBody(props, unit, event, () => setEditingId(null))}
                  />
                );
              })}
              {edges.ui.preview?.unitId === null && edges.ui.preview ? (
                <div
                  className="desktop-tx-create"
                  style={desktopSegmentFrame(
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
                  )}
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
      ) : null}
      <DesktopTranscriptionEdgeChrome
        locale={props.locale}
        place={
          selected === null
            ? null
            : {
                index: props.units.findIndex((unit) => unit.id === selected.id) + 1,
                total: props.units.length,
              }
        }
        start={edges.ui.raw.start ?? (selected ? formatPlaybackTime(selected.startTime) : '')}
        end={edges.ui.raw.end ?? (selected ? formatPlaybackTime(selected.endTime) : '')}
        saved={
          (edges.ui.raw.saved && edges.ui.raw.unitId === selected?.id) ||
          (props.bodyDraft !== null &&
            selected !== null &&
            props.bodyDraft.unitId === selected.id &&
            props.bodyDraft.text !== selected.text)
        }
        hasMedia={props.hasAudio}
        reason={
          edges.ui.reason !== null && edges.ui.reason.unitId === selected?.id
            ? edges.ui.reason.message
            : null
        }
        tip={
          edges.ui.preview?.tip
            ? { text: edges.ui.preview.tip, x: edges.ui.preview.x, y: edges.ui.preview.y }
            : null
        }
        edgeFocus={
          edges.ui.edge !== null &&
          (edges.ui.edge.unitId === selected?.id || edges.ui.edge.otherId === selected?.id)
            ? edgeFocusKind(timedUnits, edges.ui.edge)
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

function ignoreAnnotationEvent() {
  return undefined;
}

function editBody(
  props: {
    onComposeBody: (composing: boolean) => void;
    onEditBody: (unitId: string, text: string, savedText: string) => void;
  },
  unit: DesktopPlaybackUnit,
  event: ChangeEvent<HTMLInputElement>,
) {
  const native = event.nativeEvent;
  props.onComposeBody('isComposing' in native && native.isComposing === true);
  props.onEditBody(unit.id, event.target.value, unit.text);
}

function restoreBody(
  props: { onEditBody: (unitId: string, text: string, savedText: string) => void },
  unit: DesktopPlaybackUnit,
  event: KeyboardEvent<HTMLInputElement>,
  stop: () => void,
) {
  if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  props.onEditBody(unit.id, unit.text, unit.text);
  stop();
}

function layerLabel(
  layers: readonly { id: string; name: Record<string, string> }[] | undefined,
  layerId: string | null,
  locale: string,
  fallback: string,
): string {
  const name = layers?.find((layer) => layer.id === layerId)?.name;
  if (name === undefined) return fallback;
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  const label = (preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '').trim();
  return label.length > 0 ? label : fallback;
}
