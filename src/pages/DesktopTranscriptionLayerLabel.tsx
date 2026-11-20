import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { t, tf, type Locale } from '../i18n';
import type { LayerTreeRow } from './desktopTranscriptionLayerTree';

/**
 * The layer-name column cell: tree lines and dot by depth, a chevron on a host with children,
 * and a context menu to squeeze the layer to a strip.
 */
export function DesktopTranscriptionLayerLabel(props: {
  locale: Locale;
  name: string;
  row: LayerTreeRow;
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
  const groupLabel = tf(
    locale,
    row.groupCollapsed
      ? 'app.desktopTranscription.layerGroupExpand'
      : 'app.desktopTranscription.layerGroupCollapse',
    { name: props.name },
  );
  return (
    <div
      className={`desktop-tx-band-label desktop-tx-layer-label is-depth-${row.depth} groove-${row.groove}${
        row.depth === 1 && row.lastChild ? ' is-last' : ''
      }${row.childCount > 0 && !row.groupCollapsed ? ' has-children' : ''}${
        props.focused ? ' is-focused' : ''
      }`}
      tabIndex={0}
      title={props.name}
      onContextMenu={open}
      onKeyDown={onKeyDown}
    >
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
      <span aria-hidden className="desktop-tx-layer-dot" />
      <span className="desktop-tx-layer-name">{props.name}</span>
      {row.groupCollapsed ? (
        <span className="desktop-tx-layer-more">
          {tf(locale, 'app.desktopTranscription.layerGroupMore', { count: row.childCount })}
        </span>
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
