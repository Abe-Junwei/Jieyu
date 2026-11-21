import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import { t, type Locale } from '../i18n';
import { DesktopTranscriptionCreatePreview } from './DesktopTranscriptionCreatePreview';
import { DesktopTranscriptionLaneResize } from './DesktopTranscriptionLaneResize';
import {
  DesktopTranscriptionFoldedStrip,
  DesktopTranscriptionLayerLabel,
} from './DesktopTranscriptionLayerLabel';
import type { LayerTreeRow } from './desktopTranscriptionLayerTree';
import type { TimedEdgeUnit } from './desktopTranscriptionEdge';
import { desktopSegmentFrame, playbackWithPreview } from './desktopTranscriptionEdgeView';
import type { ShownPreview } from './desktopTranscriptionEdgePointer';
import { textKey } from './desktopTranscriptionTextKey';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';

export interface LayerRowLayer {
  id: string;
  name: Record<string, string>;
  sortOrder?: number;
  laneHeight?: number | null;
  units: readonly {
    id: string;
    startMs: number | null;
    endMs: number | null;
    text: string;
    parentUnitId?: string | null;
    confidence?: number | null;
    skipProcessing?: boolean;
  }[];
}

/** A card in some layer row: `layerId` + the unit id that row lists. */
export interface LayerCardRef {
  layerId: string;
  unitId: string;
}

/**
 * The manuscript's layers as a tree (`tree` is the visible rows in order; the main layer's own
 * row comes from `renderMain`). Cards of the same time unit line up; text is that layer's own.
 * Click selects, a second click edits, a drag on the empty track creates there.
 */
export function DesktopTranscriptionLayerRows(props: {
  locale: Locale;
  layers: readonly LayerRowLayer[];
  tree: readonly LayerTreeRow[];
  mainLayerId: string | null;
  renderMain: (row: LayerTreeRow) => ReactNode;
  onToggleGroup: (layerId: string) => void;
  onCollapse: (layerId: string) => void;
  onExpand: (layerId: string) => void;
  compact: boolean;
  duration: number;
  zoomPxPerSec: number;
  scrollLeftPx: number;
  focus: LayerCardRef | null;
  editing: LayerCardRef | null;
  createLayerId: string | null;
  createFrame: CSSProperties | null;
  bodyDraft: { unitId: string; text: string } | null;
  /** Live drag preview of an edge; rows shift the matching card with it. */
  preview: ShownPreview | null;
  onRowMenu: (card: LayerCardRef, name: string, event: ReactMouseEvent<Element>) => void;
  onRowResize: (
    unitId: string,
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onPick: (card: LayerCardRef, unit: DesktopPlaybackUnit) => void;
  onEditBody: (unitId: string, text: string, savedText: string) => void;
  onComposeBody: (composing: boolean) => void;
  onCommitBody: () => void;
  onStopEdit: () => void;
  onCreate: (
    event: ReactPointerEvent<HTMLElement>,
    layerId: string,
    units: readonly TimedEdgeUnit[],
  ) => void;
  onLaneHeight?: (layerId: string, height: number) => void;
}) {
  const mainInTree = props.tree.some((row) => row.layerId === props.mainLayerId);
  const mainRow: LayerTreeRow = {
    layerId: props.mainLayerId ?? '',
    depth: 0,
    hostId: null,
    childCount: 0,
    lastChild: false,
    groupCollapsed: false,
    folded: false,
    guides: [],
    lanes: [],
    moreHosts: 0,
    otherHostIds: [],
  };
  const hostNames = (row: LayerTreeRow) =>
    [...(row.hostId ? [row.hostId] : []), ...row.otherHostIds].map((id) =>
      layerLabel(props.layers.find((item) => item.id === id)?.name, props.locale, ''),
    );
  const rows = props.tree.flatMap((row) => {
    const layer = props.layers.find((item) => item.id === row.layerId);
    return layer ? [{ row, layer }] : [];
  });
  const body = rows.map(({ row, layer }) => {
    if (layer.id === props.mainLayerId)
      return <Fragment key={layer.id}>{props.renderMain(row)}</Fragment>;
    const units = layer.units.flatMap((unit) =>
      unit.startMs === null || unit.endMs === null
        ? []
        : [
            {
              id: unit.id,
              startTime: unit.startMs / 1000,
              endTime: unit.endMs / 1000,
              text: unit.text,
              parentUnitId: unit.parentUnitId ?? null,
              ...(typeof unit.confidence === 'number' ? { confidence: unit.confidence } : {}),
              ...(unit.skipProcessing === true ? { skipProcessing: true } : {}),
            },
          ],
    );
    const timed = units.map((unit) => ({
      id: unit.id,
      startMs: Math.round(unit.startTime * 1000),
      endMs: Math.round(unit.endTime * 1000),
    }));
    const name = layerLabel(layer.name, props.locale, '');
    if (row.folded) {
      return (
        <DesktopTranscriptionFoldedStrip
          key={layer.id}
          layerId={layer.id}
          locale={props.locale}
          name={name}
          row={row}
          hostNames={hostNames(row)}
          segmentCount={layer.units.length}
          onExpand={() => props.onExpand(layer.id)}
        />
      );
    }
    return (
      <div
        key={layer.id}
        className="desktop-tx-lane"
        data-layer-id={layer.id}
        style={laneHeightStyle(layer.laneHeight)}
      >
        <DesktopTranscriptionLayerLabel
          locale={props.locale}
          name={name}
          row={row}
          hostNames={hostNames(row)}
          focused={props.focus?.layerId === layer.id}
          onToggleGroup={() => props.onToggleGroup(layer.id)}
          onCollapse={() => props.onCollapse(layer.id)}
        />
        <div
          className="desktop-tx-lane__body"
          ref={(body) => {
            if (body) body.scrollLeft = props.scrollLeftPx;
          }}
        >
          <div
            className="desktop-tx-lane__track"
            style={
              props.zoomPxPerSec > 0 ? { width: props.duration * props.zoomPxPerSec } : undefined
            }
            onPointerDown={(event) => props.onCreate(event, layer.id, timed)}
          >
            {units.map((rowUnit, index) => {
              const unit = playbackWithPreview(rowUnit, props.preview, rowUnit.parentUnitId);
              const frame = desktopSegmentFrame(
                unit,
                props.duration,
                index,
                units.length,
                props.zoomPxPerSec,
              );
              const key = textKey(layer.id, unit.id);
              const card = { layerId: layer.id, unitId: unit.id };
              const selected = sameCard(props.focus, card);
              return (
                <TimelineAnnotationItem
                  key={unit.id}
                  unitId={unit.id}
                  left={frame.left ?? 0}
                  width={frame.width ?? 0}
                  isSelected={selected}
                  isActive={selected && sameCard(props.editing, card)}
                  isCompact={props.compact}
                  skipProcessing={unit.skipProcessing === true}
                  title={unit.text}
                  draft={props.bodyDraft?.unitId === key ? props.bodyDraft.text : unit.text}
                  {...(typeof unit.confidence === 'number' ? { confidence: unit.confidence } : {})}
                  onClick={() => props.onPick(card, unit)}
                  onContextMenu={(event) => props.onRowMenu(card, name, event)}
                  onDoubleClick={ignore}
                  onResizeStartPointerDown={(event) => props.onRowResize(unit.id, 'start', event)}
                  onResizeEndPointerDown={(event) => props.onRowResize(unit.id, 'end', event)}
                  onChange={(event) => props.onEditBody(key, event.target.value, unit.text)}
                  onCompositionStart={() => props.onComposeBody(true)}
                  onCompositionEnd={() => props.onComposeBody(false)}
                  onBlur={() => props.onCommitBody()}
                  onKeyDown={(event) =>
                    restoreBody(props.onEditBody, key, unit, event, props.onStopEdit)
                  }
                />
              );
            })}
            {props.createLayerId === layer.id && props.createFrame ? (
              <DesktopTranscriptionCreatePreview
                className="desktop-tx-create"
                style={props.createFrame}
                radius={4}
              />
            ) : null}
          </div>
        </div>
        {props.onLaneHeight === undefined ? null : (
          <DesktopTranscriptionLaneResize
            label={t(props.locale, 'app.desktopTranscription.layerHeight')}
            onCommit={(height) => props.onLaneHeight?.(layer.id, height)}
          />
        )}
      </div>
    );
  });
  return (
    <>
      {mainInTree ? null : props.renderMain(mainRow)}
      {body}
    </>
  );
}

function ignore() {
  return undefined;
}

export function sameCard(a: LayerCardRef | null, b: LayerCardRef | null): boolean {
  return a !== null && b !== null && a.layerId === b.layerId && a.unitId === b.unitId;
}

export function restoreBody(
  onEditBody: (unitId: string, text: string, savedText: string) => void,
  key: string,
  unit: DesktopPlaybackUnit,
  event: KeyboardEvent<HTMLInputElement>,
  stop: () => void,
) {
  if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  onEditBody(key, unit.text, unit.text);
  stop();
}

export function laneHeightStyle(height: number | null | undefined): CSSProperties | undefined {
  if (height == null) return undefined;
  return { '--lane-height': `${height}px` } as CSSProperties;
}

export function layerLabel(
  name: Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string {
  if (name === undefined) return fallback;
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  const label = (preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '').trim();
  return label.length > 0 ? label : fallback;
}
