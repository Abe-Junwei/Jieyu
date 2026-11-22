import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { TimelineAnnotationItem } from '../components/TimelineAnnotationItem';
import { desktopAnnotationStyle } from '../utils/layerDisplayStyle';
import {
  layerStyleFields,
  styleMenuProps,
  type LayerStyleChange,
} from './DesktopTranscriptionLayerStyleMenu';
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
import {
  timelineDragProps,
  type DesktopLayerDrag,
} from './useDesktopTranscriptionLayerDragController';

export interface LayerRowLayer {
  id: string;
  name: Record<string, string>;
  sortOrder?: number;
  laneHeight?: number | null;
  languageId?: string | null;
  orthographyId?: string | null;
  orthographyName?: Record<string, string> | null;
  orthographyScriptTag?: string | null;
  displayFont?: string | null;
  displayFontSize?: number | null;
  displayBold?: boolean;
  displayItalic?: boolean;
  modality?: string;
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
  renderMain: (row: LayerTreeRow, groupContinues: boolean) => ReactNode;
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
  onLayerStyle?: (layerId: string, change: LayerStyleChange) => void;
  loadOrthographies?: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>;
  onSelectLayer?: (layerId: string) => void;
  drag?: DesktopLayerDrag;
  /** Record, play, and delete for a modality=audio card. Text layers ignore it. */
  audioTools?: (layerId: string, unitId: string) => ReactNode;
}) {
  const mainInTree = props.tree.some((row) => row.layerId === props.mainLayerId);
  const mainExists =
    props.mainLayerId !== null && props.layers.some((layer) => layer.id === props.mainLayerId);
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
  const rows = props.tree.flatMap((row) => {
    const layer = props.layers.find((item) => item.id === row.layerId);
    return layer ? [{ row, layer }] : [];
  });
  const body = rows.map(({ row, layer }, index) => {
    const groupContinues = (rows[index + 1]?.row.depth ?? 0) > 0;
    if (layer.id === props.mainLayerId)
      return <Fragment key={layer.id}>{props.renderMain(row, groupContinues)}</Fragment>;
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
    const dragBits = timelineDragProps(props.drag, layer.id, row.folded);
    if (row.folded) {
      return (
        <DesktopTranscriptionFoldedStrip
          key={layer.id}
          layerId={layer.id}
          locale={props.locale}
          name={name}
          row={row}
          segmentCount={layer.units.length}
          onExpand={() => props.onExpand(layer.id)}
          {...(props.onSelectLayer === undefined
            ? {}
            : { onSelect: () => props.onSelectLayer?.(layer.id) })}
          className={dragBits.laneClass}
          style={dragBits.laneStyle}
        />
      );
    }
    return (
      <div
        key={layer.id}
        className={`desktop-tx-lane${groupContinues ? ' is-group-mid' : ''}${dragBits.laneClass}`}
        data-layer-id={layer.id}
        data-drag-surface="timeline"
        style={{ ...(laneHeightStyle(layer.laneHeight) ?? {}), ...dragBits.laneStyle }}
      >
        <DesktopTranscriptionLayerLabel
          locale={props.locale}
          name={name}
          row={row}
          focused={false}
          onToggleGroup={() => props.onToggleGroup(layer.id)}
          onCollapse={() => props.onCollapse(layer.id)}
          {...(props.onSelectLayer === undefined
            ? {}
            : { onSelect: () => props.onSelectLayer?.(layer.id) })}
          {...dragBits.label}
          {...(props.drag === undefined
            ? {}
            : { dragHint: t(props.locale, 'app.desktopTranscription.layerDragHold') })}
          {...(props.onLayerStyle === undefined || props.loadOrthographies === undefined
            ? {}
            : styleMenuProps(
                layerStyleFields(layer, props.locale),
                props.loadOrthographies,
                (change) => props.onLayerStyle?.(layer.id, change),
              ))}
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
              const painted = annotationStyle(layer);
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
                  {...(props.audioTools !== undefined && layer.modality === 'audio'
                    ? { content: props.audioTools(layer.id, unit.id) }
                    : {})}
                  {...(painted === undefined ? {} : { layerStyle: painted })}
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
      {props.drag?.rootZone && props.drag.surface === 'timeline' ? (
        <div
          className={
            props.drag.dropKind === 'root'
              ? 'desktop-tx-drop-root is-active'
              : 'desktop-tx-drop-root'
          }
          data-drop="root"
          data-drop-index="0"
          data-drag-surface="timeline"
        >
          {t(props.locale, 'app.desktopTranscription.layerHintRoot')}
        </div>
      ) : null}
      {mainInTree || !mainExists ? null : props.renderMain(mainRow, false)}
      {body}
      {props.drag?.surface === 'timeline' ? (
        <div
          className={
            props.drag.dropKind === 'line' && props.drag.dropLayerId === null
              ? 'desktop-tx-drop-tail is-active'
              : 'desktop-tx-drop-tail'
          }
          data-drop="tail"
          data-drag-surface="timeline"
        />
      ) : null}
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

function annotationStyle(layer: LayerRowLayer): CSSProperties | undefined {
  const style = desktopAnnotationStyle({
    ...(layer.displayFont === undefined ? {} : { displayFont: layer.displayFont }),
    ...(layer.displayFontSize === undefined ? {} : { displayFontSize: layer.displayFontSize }),
    ...(layer.displayBold === undefined ? {} : { displayBold: layer.displayBold }),
    ...(layer.displayItalic === undefined ? {} : { displayItalic: layer.displayItalic }),
    ...(layer.orthographyScriptTag === undefined ? {} : { scriptTag: layer.orthographyScriptTag }),
    ...(layer.languageId === undefined ? {} : { languageId: layer.languageId }),
  });
  if (
    style.fontFamily === undefined &&
    style.fontSize === undefined &&
    style.fontWeight === undefined &&
    style.fontStyle === undefined &&
    style.direction === undefined
  ) {
    return undefined;
  }
  return style;
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
