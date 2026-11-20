import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { t, tf, type Locale } from '../i18n';
import type { LayerTreeRow } from './desktopTranscriptionLayerTree';

const INDENT_BASE = 30;
const INDENT_STEP = 16;
const INDENT_LEVELS = 3;

/** Dot centre for a depth; deeper than three levels only lengthens the guides. */
const levelX = (depth: number) => INDENT_BASE + INDENT_STEP * Math.min(depth, INDENT_LEVELS);
const px = (value: number) => `${value}px`;
const cssVars = (vars: Record<string, string>) => vars as CSSProperties;

/** Tree guides; drawn only, hidden from assistive tech. */
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
    </span>
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
  /** Names of the hosts beyond the preferred one, for the marker's hover text. */
  otherHosts?: readonly string[];
  focused: boolean;
  onToggleGroup: () => void;
  onCollapse: () => void;
}) {
  const { row, locale } = props;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
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
  const otherHosts = props.otherHosts ?? [];
  const sideNote =
    otherHosts.length > 0
      ? tf(locale, 'app.desktopTranscription.layerOtherHosts', {
          names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(otherHosts),
        })
      : undefined;
  const groupLabel = tf(
    locale,
    row.groupCollapsed
      ? 'app.desktopTranscription.layerGroupExpand'
      : 'app.desktopTranscription.layerGroupCollapse',
    { name: props.name },
  );
  return (
    <div
      className={`desktop-tx-band-label desktop-tx-layer-label${otherHosts.length > 0 ? ' is-side-host' : ''}${
        props.focused ? ' is-focused' : ''
      }`}
      style={cssVars({ '--dot-x': px(levelX(row.depth)) })}
      tabIndex={0}
      title={sideNote ? `${props.name}\n${sideNote}` : props.name}
      onContextMenu={open}
      onKeyDown={onKeyDown}
    >
      <TreeLines row={row} />
      <span aria-hidden className="desktop-tx-layer-dot" />
      <span className="desktop-tx-layer-name">{props.name}</span>
      {row.groupCollapsed ? (
        <span className="desktop-tx-layer-more">
          {tf(locale, 'app.desktopTranscription.layerGroupMore', { count: row.childCount })}
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

/** A squeezed layer: a 28px strip with the way back, the name and the segment count. */
export function DesktopTranscriptionFoldedStrip(props: {
  layerId: string;
  locale: Locale;
  name: string;
  segmentCount: number;
  onExpand: () => void;
}) {
  return (
    <div className="desktop-tx-layer-strip" data-layer-id={props.layerId}>
      <div className="desktop-tx-band-label desktop-tx-layer-strip__spacer" />
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
