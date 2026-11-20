import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { t, tf, type Locale } from '../i18n';
import type { LayerTreeRow } from './desktopTranscriptionLayerTree';

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
      {row.guides.map((through, level) =>
        through ? (
          <i
            key={`g${level}`}
            className="tree-guide"
            style={cssVars({ '--x': px(levelX(level)) })}
          />
        ) : null,
      )}
      {row.depth > 0 ? (
        <i
          className={`tree-elbow${row.lastChild ? ' is-last' : ''}`}
          style={cssVars({
            '--x': px(levelX(row.depth - 1)),
            '--w': px(Math.max(dotX - 4 - levelX(row.depth - 1), 0)),
          })}
        />
      ) : null}
      {row.childCount > 0 && !row.groupCollapsed ? (
        <i className="tree-guide is-own" style={cssVars({ '--x': px(dotX) })} />
      ) : null}
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

/**
 * The layer's node: hovering it, or focusing the label, shows the name and what the layer hangs
 * on. Portalled so the clipped label column cannot cut the bubble.
 */
function LayerNode(props: {
  locale: Locale;
  row: LayerTreeRow;
  name: string;
  hostNames: readonly string[];
  shown: boolean;
  onShow: (shown: boolean) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const box = props.shown ? ref.current?.getBoundingClientRect() : undefined;
  const note =
    props.hostNames.length > 0
      ? tf(props.locale, 'app.desktopTranscription.layerHostsNote', {
          names: new Intl.ListFormat(props.locale, { type: 'conjunction' }).format(props.hostNames),
        })
      : t(props.locale, 'app.desktopTranscription.layerRootNote');
  return (
    <>
      <TreeLines row={props.row} />
      <span
        ref={ref}
        aria-hidden
        className="desktop-tx-layer-dot"
        onPointerEnter={() => props.onShow(true)}
        onPointerLeave={() => props.onShow(false)}
      />
      {box
        ? createPortal(
            <span
              role="tooltip"
              className="desktop-tx-layer-tip"
              style={{ left: box.left + box.width / 2, top: box.bottom + 6 }}
            >
              <span className="desktop-tx-layer-tip__name">{props.name}</span>
              <span>{note}</span>
            </span>,
            document.body,
          )
        : null}
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
  row: LayerTreeRow;
  /** Host names, preferred first, for the node's hover note. */
  hostNames: readonly string[];
  focused: boolean;
  onToggleGroup: () => void;
  onCollapse: () => void;
}) {
  const { row, locale } = props;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (menu === null) return undefined;
    const close = () => setMenu(null);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
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
      }`}
      style={cssVars({ '--dot-x': px(levelX(row.depth)) })}
      tabIndex={0}
      onFocus={(event) => setTip(event.target === event.currentTarget)}
      onBlur={() => setTip(false)}
      onContextMenu={open}
      onKeyDown={onKeyDown}
    >
      <LayerNode
        locale={locale}
        row={row}
        name={props.name}
        hostNames={props.hostNames}
        shown={tip}
        onShow={setTip}
      />
      <span className="desktop-tx-layer-name">{props.name}</span>
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
        <button
          type="button"
          className="desktop-tx-layer-chevron"
          aria-expanded={!row.groupCollapsed}
          aria-label={groupLabel}
          title={groupLabel}
          onClick={props.onToggleGroup}
        >
          <span aria-hidden className="desktop-tx-layer-chevron__mark" />
        </button>
      ) : null}
      {menu === null ? null : (
        <div
          className="desktop-tx-menu desktop-tx-layer-menu"
          role="menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setMenu(null);
              props.onCollapse();
            }}
          >
            {t(locale, 'app.desktopTranscription.layerCollapse')}
          </button>
        </div>
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
  hostNames: readonly string[];
  segmentCount: number;
  onExpand: () => void;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div className="desktop-tx-layer-strip" data-layer-id={props.layerId}>
      <div
        className="desktop-tx-band-label desktop-tx-layer-label desktop-tx-layer-strip__label"
        style={cssVars({ '--dot-x': px(levelX(props.row.depth)) })}
      >
        <LayerNode
          locale={props.locale}
          row={props.row}
          name={props.name}
          hostNames={props.hostNames}
          shown={tip}
          onShow={setTip}
        />
      </div>
      <button type="button" className="desktop-tx-layer-strip__body" onClick={props.onExpand}>
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
