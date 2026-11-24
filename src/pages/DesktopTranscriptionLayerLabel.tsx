import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { IconTipButton } from '../components/ui/IconTip';
import { t, tf, type Locale } from '../i18n';
import type { LayerTreeRow } from './desktopTranscriptionLayerTree';
import type { LayerCommandId, LayerCommandItem } from './desktopTranscriptionLayerCommands';
import {
  DesktopLayerHeaderMenu,
  type LayerCreateActions,
  type LayerStyleChange,
  type LayerStyleFields,
} from './DesktopTranscriptionLayerStyleMenu';
import type { SpeakerLaneMode } from './desktopSpeakerLanes';

const INDENT_BASE = 30;
const INDENT_STEP = 16;
const INDENT_LEVELS = 3;
const LANE_BASE = 6;
const LANE_STEP = 4;

/** Dot centre for a depth; deeper than three levels only lengthens the guides. */
const levelX = (depth: number) => INDENT_BASE + INDENT_STEP * Math.min(depth, INDENT_LEVELS);
const px = (value: number) => `${value}px`;
const cssVars = (vars: Record<string, string>) => vars as CSSProperties;

/** Tree guides and the side-lane runs; drawn only, hidden from assistive tech. */
function TreeLines(props: { row: LayerTreeRow }) {
  const { row } = props;
  const dotX = levelX(row.depth);
  return (
    <span aria-hidden className="desktop-tx-tree-lines">
      {row.branches?.map((branch, index) => {
        const x = levelX(branch.depth) - INDENT_STEP;
        const width = Math.max(0, dotX - 4 - x);
        return (
          <span key={index}>
            <i
              className={`tree-guide is-${branch.span}${branch.host ? ' is-own' : ''}${branch.child ? ' tree-elbow' : ''}${x === dotX && !branch.host && !branch.child ? ' is-node-gap' : ''}`}
              style={cssVars({ '--x': px(x), '--w': px(width) })}
            />
            {(branch.child || branch.host) && width > 0 ? (
              <i className="tree-jog" style={cssVars({ '--x': px(x), '--w': px(width) })} />
            ) : null}
          </span>
        );
      })}
      {row.lanes.map((lane) => {
        const x = LANE_BASE + LANE_STEP * lane.lane;
        return (
          <span key={`${lane.lane}`}>
            <i className={`lane-run is-${lane.span}`} style={cssVars({ '--x': px(x) })} />
            {lane.role === 'through' ? null : (
              <i
                className={`lane-stub is-${lane.role}`}
                style={cssVars({
                  '--x': px(x),
                  '--w': px(dotX - (lane.role === 'host' ? 6 : 4) - x),
                })}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

/** A root with no children and no host link has nothing for a dot to mark. */
function showsLayerNode(row: LayerTreeRow): boolean {
  return (
    row.depth > 0 ||
    row.hostId !== null ||
    row.childCount > 0 ||
    row.lanes.length > 0 ||
    row.moreHosts > 0
  );
}

/** The layer's node: tree lines and the dot. No hover note. */
function LayerNode(props: { row: LayerTreeRow }) {
  return (
    <>
      <TreeLines row={props.row} />
      <span
        aria-hidden
        className={`desktop-tx-layer-dot${showsLayerNode(props.row) ? '' : ' is-empty'}`}
      />
    </>
  );
}

/**
 * The layer-name column cell: tree lines and dot by depth, a chevron on a host with children,
 * and a context menu to squeeze the layer to a strip.
 */
export function DesktopTranscriptionLayerLabel(props: {
  locale: Locale;
  name: string;
  timingLabel?: string;
  row: LayerTreeRow;
  focused: boolean;
  onToggleGroup: () => void;
  onCollapse: () => void;
  dragClassName?: string;
  dragOffset?: number;
  onLayerPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onLayerPointerUp?: () => void;
  dragHint?: string;
  /** A click on the name, including a short press that did not become a drag. */
  onSelect?: () => void;
  styleFields?: LayerStyleFields;
  loadOrthographies?: (
    languageId: string,
  ) => Promise<{ id: string; name: Record<string, string>; scriptTag: string }[]>;
  onApplyStyle?: (change: LayerStyleChange) => void;
  commands?: readonly LayerCommandItem[];
  onCommand?: (command: LayerCommandId) => void;
  create?: LayerCreateActions;
  overlapCount?: number;
  lane?: {
    mode: SpeakerLaneMode;
    conflicts: boolean;
    onMode: (mode: SpeakerLaneMode) => void;
    onLock: () => void;
    onClearConflicts: () => void;
  };
}) {
  const { row, locale } = props;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (menu === null) return undefined;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.desktop-tx-layer-menu') !== null
      ) {
        return;
      }
      setMenu(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const open = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setMenu({ x: box.left + 8, y: box.bottom });
  };
  const groupLabel = tf(
    locale,
    row.groupCollapsed
      ? 'app.desktopTranscription.layerGroupExpand'
      : 'app.desktopTranscription.layerGroupCollapse',
    { name: props.name },
  );
  return (
    <div
      className={`desktop-tx-band-label desktop-tx-layer-label${row.lanes.some((lane) => lane.role === 'host') ? ' is-side-host' : ''}${
        props.focused ? ' is-focused' : ''
      }${props.dragClassName ?? ''}`}
      style={{
        ...cssVars({ '--dot-x': px(levelX(row.depth)) }),
        ...(props.dragOffset === undefined
          ? {}
          : { transform: `translateY(${props.dragOffset}px)` }),
      }}
      tabIndex={0}
      onContextMenu={open}
      onKeyDown={onKeyDown}
    >
      <TreeLines row={row} />
      <div className="desktop-tx-nameplate">
        <span
          aria-hidden
          className={`desktop-tx-layer-dot${showsLayerNode(row) ? '' : ' is-empty'}`}
        />
        <span className="desktop-tx-nameplate__text">
          <span
            className="desktop-tx-layer-name"
            {...(props.dragHint === undefined
              ? {}
              : { title: props.dragHint, 'aria-description': props.dragHint })}
            {...(props.onLayerPointerDown === undefined
              ? {}
              : { onPointerDown: props.onLayerPointerDown })}
            {...(props.onLayerPointerUp === undefined
              ? {}
              : { onPointerUp: props.onLayerPointerUp })}
            {...(props.onSelect === undefined
              ? {}
              : {
                  onClick: (event: MouseEvent<HTMLElement>) => {
                    event.stopPropagation();
                    props.onSelect?.();
                  },
                })}
          >
            {props.name}
          </span>
          {props.timingLabel ? (
            <span className="desktop-tx-layer-timing">{props.timingLabel}</span>
          ) : null}
          {props.overlapCount !== undefined && props.overlapCount > 0 ? (
            <span className="desktop-tx-layer-more">
              {tf(locale, 'app.desktopTranscription.laneOverlaps', { count: props.overlapCount })}
            </span>
          ) : null}
          {props.styleFields !== undefined && props.styleFields.orthographyName.length > 0 ? (
            <span className="desktop-tx-layer-script">{props.styleFields.orthographyName}</span>
          ) : null}
        </span>
        {row.groupCollapsed ? (
          <span className="desktop-tx-layer-more">
            {tf(locale, 'app.desktopTranscription.layerGroupMore', { count: row.childCount })}
          </span>
        ) : null}
        {row.moreHosts > 0 ? (
          <span aria-hidden className="desktop-tx-layer-more">
            +{row.moreHosts}
          </span>
        ) : null}
        {row.childCount > 0 ? (
          <IconTipButton
            className="desktop-tx-layer-chevron"
            aria-expanded={!row.groupCollapsed}
            label={groupLabel}
            onClick={props.onToggleGroup}
          >
            <span aria-hidden className="desktop-tx-layer-chevron__mark" />
          </IconTipButton>
        ) : null}
      </div>
      {menu === null ? null : (
        <DesktopLayerHeaderMenu
          locale={locale}
          x={menu.x}
          y={menu.y}
          onCollapse={() => {
            setMenu(null);
            props.onCollapse();
          }}
          {...(props.commands === undefined || props.onCommand === undefined
            ? {}
            : {
                commands: props.commands,
                onCommand: (command: LayerCommandId) => {
                  setMenu(null);
                  props.onCommand?.(command);
                },
              })}
          {...(props.create === undefined
            ? {}
            : {
                create: {
                  ...props.create,
                  onCreate: (
                    kind: 'transcription' | 'translation' | 'orthography',
                    label: string,
                  ) => {
                    setMenu(null);
                    props.create?.onCreate(kind, label, props.row.layerId);
                  },
                  onCreatePair: (kind: 'voice' | 'oral', audioName: string, textName: string) => {
                    setMenu(null);
                    props.create?.onCreatePair(kind, audioName, textName);
                  },
                },
              })}
          {...(props.styleFields === undefined ||
          props.onApplyStyle === undefined ||
          props.loadOrthographies === undefined
            ? {}
            : {
                fields: props.styleFields,
                loadOrthographies: props.loadOrthographies,
                onApply: props.onApplyStyle,
              })}
          {...(props.lane === undefined ? {} : { lane: props.lane })}
        />
      )}
    </div>
  );
}

/**
 * A squeezed layer: a 28px strip with the way back, the name and the segment count. Its label cell
 * drops the name but keeps the node and the lines, so the tree reads through it.
 */
export function DesktopTranscriptionFoldedStrip(props: {
  layerId: string;
  locale: Locale;
  name: string;
  row: LayerTreeRow;
  segmentCount: number;
  onExpand: () => void;
  onSelect?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`desktop-tx-layer-strip${props.className ?? ''}`}
      data-layer-id={props.layerId}
      data-drag-surface="timeline"
      {...(props.style === undefined ? {} : { style: props.style })}
    >
      <div
        className="desktop-tx-band-label desktop-tx-layer-label desktop-tx-layer-strip__label"
        style={cssVars({ '--dot-x': px(levelX(props.row.depth)) })}
      >
        <LayerNode row={props.row} />
      </div>
      <button
        type="button"
        className="desktop-tx-layer-strip__body"
        onClick={() => {
          props.onSelect?.();
          props.onExpand();
        }}
      >
        <span className="desktop-tx-layer-strip__expand">
          {t(props.locale, 'app.desktopTranscription.layerExpand')}
        </span>
        <span className="desktop-tx-layer-strip__name">{props.name}</span>
        <span className="desktop-tx-layer-strip__count">
          {tf(props.locale, 'app.desktopTranscription.layerSegmentCount', {
            count: props.segmentCount,
          })}
        </span>
      </button>
    </div>
  );
}
