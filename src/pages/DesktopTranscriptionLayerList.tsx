import { useEffect, useRef, useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, tf, type Locale } from '../i18n';
import { DesktopTranscriptionLayerHostsDialog } from './DesktopTranscriptionLayerHostsDialog';
import { layerLabel } from './DesktopTranscriptionLayerRows';
import { buildLayerTree, emptyFold } from './desktopTranscriptionLayerTree';
import type { DesktopLayerDrag } from './useDesktopTranscriptionLayerDragController';

export interface ContextLayer {
  id: string;
  name: Record<string, string>;
  contentType: string;
  tierType: string | undefined;
  parentId?: string | null;
  sortOrder?: number;
  /** Own units plus stored texts; zero means the layer can go without asking. */
  contentCount: number;
}

export interface ContextLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
  sortOrder: number;
  linkType?: 'direct' | 'free' | 'literal' | 'pedagogical';
}

export interface LayerHostsInput {
  layerId: string;
  hostLayerIds: string[];
  preferredHostLayerId: string;
  linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
}

export interface LayerListRequest {
  nonce: number;
  layerId: string;
  action: 'rename' | 'delete' | 'migrate' | 'hosts';
}

/** The context-column layer list: rename, reorder, and delete. New layers start from the header menu. */
export function DesktopTranscriptionLayerList(props: {
  locale: Locale;
  layers: readonly ContextLayer[];
  links: readonly ContextLink[];
  currentId: string | null;
  error: string;
  onSelect: (layerId: string) => void;
  onRename: (layerId: string, name: Record<string, string>) => void;
  onMove: (layerId: string, direction: 'up' | 'down') => void;
  onDelete: (layerId: string, mode: 'soft' | 'migrate' | 'purge', targetLayerId?: string) => void;
  onPreviewHosts?: (input: LayerHostsInput) => Promise<{
    removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
    blocked: boolean;
  } | null>;
  onSetHosts?: (input: LayerHostsInput) => void;
  onClearError?: () => void;
  drag?: DesktopLayerDrag;
  /** Opens rename, delete, migrate, or hosts. The header menu sends this. */
  request?: LayerListRequest | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<ContextLayer | null>(null);
  const [migrating, setMigrating] = useState<ContextLayer | null>(null);
  const [targetId, setTargetId] = useState('');
  const [hostsLayer, setHostsLayer] = useState<ContextLayer | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const renameOpen = useRef(false);
  const seenRequest = useRef<number | null>(null);
  const commitRename = (layer: ContextLayer) => {
    if (!renameOpen.current) return;
    renameOpen.current = false;
    const trimmed = draft.trim();
    const current = layerLabel(layer.name, props.locale, layer.id);
    setEditingId(null);
    if (trimmed.length === 0 || trimmed === current) return;
    const localeKey = props.locale.startsWith('zh') ? 'zh' : 'en';
    props.onRename(layer.id, { ...layer.name, [localeKey]: trimmed });
  };
  const childCount = (id: string) => {
    const ids = new Set<string>();
    for (const link of props.links) if (link.hostLayerId === id) ids.add(link.layerId);
    for (const layer of props.layers) if (layer.parentId === id) ids.add(layer.id);
    return ids.size;
  };
  const hostOf = (id: string) => {
    const preferred = props.links.find((link) => link.layerId === id && link.isPreferred === true);
    return (preferred ?? props.links.find((link) => link.layerId === id))?.hostLayerId ?? null;
  };
  // Same order as the timeline rows, so moving a layer moves it in both places.
  const byId = new Map(props.layers.map((layer) => [layer.id, layer]));
  const ordered = buildLayerTree(props.layers, props.links, emptyFold()).flatMap((row) => {
    const layer = byId.get(row.layerId);
    return layer === undefined ? [] : [{ layer, depth: row.depth }];
  });
  const targets = (layer: ContextLayer) =>
    props.layers.filter(
      (item) =>
        item.id !== layer.id &&
        item.contentType === layer.contentType &&
        item.tierType === layer.tierType &&
        hostOf(item.id) === hostOf(layer.id),
    );
  const canMigrate = (id: string) => {
    const layer = props.layers.find((item) => item.id === id);
    return layer !== undefined && targets(layer).length > 0;
  };
  const openRequestRef = useRef<(request: LayerListRequest) => void>(() => undefined);
  openRequestRef.current = (request) => {
    if (seenRequest.current === request.nonce) return;
    seenRequest.current = request.nonce;
    const layer = props.layers.find((item) => item.id === request.layerId);
    if (layer === undefined) return;
    if (request.action === 'rename') {
      renameOpen.current = true;
      setEditingId(layer.id);
      setDraft(layerLabel(layer.name, props.locale, layer.id));
      return;
    }
    if (request.action === 'hosts') {
      if (
        props.onPreviewHosts !== undefined &&
        props.onSetHosts !== undefined &&
        layer.tierType === 'symbolic-association'
      ) {
        setHostsLayer(layer);
      }
      return;
    }
    if (request.action === 'migrate') {
      if (!canMigrate(layer.id)) return;
      setMigrating(layer);
      setTargetId('');
      setTargetOpen(false);
      return;
    }
    if (layer.contentCount === 0 && childCount(layer.id) === 0) {
      props.onDelete(layer.id, 'soft');
      return;
    }
    setDeleting(layer);
  };
  useEffect(() => {
    if (props.request == null) return;
    openRequestRef.current(props.request);
  }, [props.request]);
  return (
    <div className="desktop-tx-layer-list">
      {props.error.length > 0 ? <p role="alert">{props.error}</p> : null}
      {props.layers.length === 0 ? null : (
        <ul className="desktop-tx-context__rows">
          {props.drag?.rootZone && props.drag.surface === 'sidebar' ? (
            <li
              className={
                props.drag.dropKind === 'root'
                  ? 'desktop-tx-drop-root is-active'
                  : 'desktop-tx-drop-root'
              }
              data-drop="root"
              data-drop-index="0"
              data-drag-surface="sidebar"
            >
              {t(props.locale, 'app.desktopTranscription.layerHintRoot')}
            </li>
          ) : null}
          {ordered.map(({ layer, depth }) => {
            const here = props.drag?.surface === 'sidebar';
            const moving = here ? props.drag?.mark(layer.id) : null;
            const peer = !here && props.drag?.mark(layer.id) != null;
            const dropHost =
              here && props.drag?.dropLayerId === layer.id && props.drag.dropKind === 'host';
            const dropLine =
              here && props.drag?.dropLayerId === layer.id && props.drag.dropKind === 'line';
            const dropAfter = dropLine && props.drag?.dropEdge === 'after';
            const name = layerLabel(layer.name, props.locale, layer.id);
            const kind =
              layer.contentType === 'translation'
                ? 'app.desktopTranscription.contextLayerTranslation'
                : 'app.desktopTranscription.contextLayerTranscription';
            const shift =
              !here || moving || props.drag === undefined ? 0 : props.drag.shift(layer.id);
            const holdHint = t(props.locale, 'app.desktopTranscription.layerDragHold');
            return (
              <li
                key={layer.id}
                className={`desktop-tx-layer-list__line${peer ? ' is-drag-peer' : ''}${shift === 0 ? '' : ' is-drag-shift'}`}
                data-layer-id={layer.id}
                data-drag-surface="sidebar"
                data-current={layer.id === props.currentId ? 'true' : 'false'}
                data-depth={Math.min(depth, 3)}
                {...(moving && props.drag
                  ? { style: { transform: `translateY(${props.drag.offset}px)` } }
                  : shift === 0
                    ? {}
                    : { style: { transform: `translateY(${shift}px)` } })}
              >
                {editingId === layer.id ? (
                  <form
                    className="desktop-tx-layer-list__rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(layer);
                    }}
                  >
                    <input
                      aria-label={t(props.locale, 'app.desktopTranscription.layerRename')}
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(layer)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        event.preventDefault();
                        renameOpen.current = false;
                        setEditingId(null);
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`desktop-tx-context__row${moving ? ` is-drag-${moving}` : ''}${
                      dropHost ? ' is-drop-host' : ''
                    }${dropLine ? ' is-drop-line' : ''}${dropAfter ? ' is-drop-after' : ''}`}
                    aria-current={layer.id === props.currentId ? 'true' : undefined}
                    title={holdHint}
                    aria-description={holdHint}
                    onClick={() => props.onSelect(layer.id)}
                    {...(props.drag
                      ? {
                          onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
                            props.drag?.onPointerDown(layer.id, 'sidebar', event),
                          onPointerUp: () => props.drag?.onPointerUp(),
                        }
                      : {})}
                  >
                    <span className="desktop-tx-context__kind">{t(props.locale, kind)}</span>
                    <span className="desktop-tx-context__name">{name}</span>
                  </button>
                )}
              </li>
            );
          })}
          {props.drag?.surface === 'sidebar' ? (
            <li
              className={
                props.drag.dropKind === 'line' && props.drag.dropLayerId === null
                  ? 'desktop-tx-drop-tail is-active'
                  : 'desktop-tx-drop-tail'
              }
              data-drop="tail"
              data-drag-surface="sidebar"
            />
          ) : null}
        </ul>
      )}
      {hostsLayer === null ||
      props.onPreviewHosts === undefined ||
      props.onSetHosts === undefined ? null : (
        <DesktopTranscriptionLayerHostsDialog
          locale={props.locale}
          layer={hostsLayer}
          layers={props.layers}
          links={props.links}
          descendantIds={hostedDescendants(hostsLayer.id, props.links, props.layers)}
          onPreview={props.onPreviewHosts}
          onSave={(input) => {
            props.onSetHosts?.(input);
            setHostsLayer(null);
          }}
          onClose={() => {
            props.onClearError?.();
            setHostsLayer(null);
          }}
        />
      )}
      <ModalPanel
        isOpen={deleting !== null}
        onClose={() => {
          setTargetOpen(false);
          setDeleting(null);
        }}
        title={t(props.locale, 'app.desktopTranscription.layerDeleteTitle')}
        footerClassName="desktop-tx-layer-delete__footer"
        footer={
          deleting === null ? null : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  props.onDelete(deleting.id, 'soft');
                  setDeleting(null);
                }}
              >
                {t(props.locale, 'app.desktopTranscription.layerDeleteSoft')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  props.onDelete(deleting.id, 'purge');
                  setDeleting(null);
                }}
              >
                {t(props.locale, 'app.desktopTranscription.layerDeletePurge')}
              </button>
            </>
          )
        }
      >
        {deleting === null ? null : (
          <p className="desktop-tx-layer-delete__note">
            {tf(props.locale, 'app.desktopTranscription.layerDeleteIntro', {
              name: layerLabel(deleting.name, props.locale, deleting.id),
              count: deleting.contentCount,
              children: childCount(deleting.id),
            })}
          </p>
        )}
        <p className="desktop-tx-layer-delete__note">
          {t(props.locale, 'app.desktopTranscription.layerDeletePurgeNote')}
        </p>
      </ModalPanel>
      <ModalPanel
        isOpen={migrating !== null}
        onClose={() => {
          setTargetOpen(false);
          setMigrating(null);
        }}
        title={t(props.locale, 'app.desktopTranscription.layerDeleteMigrate')}
        footerClassName="desktop-tx-layer-delete__footer"
        footer={
          migrating === null ? null : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={targetId.length === 0}
              onClick={() => {
                props.onDelete(migrating.id, 'migrate', targetId);
                setMigrating(null);
              }}
            >
              {t(props.locale, 'app.desktopTranscription.layerDeleteMigrate')}
            </button>
          )
        }
      >
        {migrating !== null && targets(migrating).length > 0 ? (
          <div className="desktop-tx-layer-delete__field">
            <button
              type="button"
              className="desktop-tx-layer-delete__select"
              aria-haspopup="listbox"
              aria-expanded={targetOpen}
              onClick={() => setTargetOpen((open) => !open)}
            >
              <span>
                {targetId.length === 0
                  ? t(props.locale, 'app.desktopTranscription.layerDeleteTargetPlaceholder')
                  : layerLabel(
                      targets(migrating).find((layer) => layer.id === targetId)?.name,
                      props.locale,
                      targetId,
                    )}
              </span>
            </button>
            {targetOpen ? (
              <ul className="desktop-tx-layer-delete__options" role="listbox">
                {targets(migrating).map((layer) => (
                  <li key={layer.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={layer.id === targetId}
                      onClick={() => {
                        setTargetId(layer.id);
                        setTargetOpen(false);
                      }}
                    >
                      {layerLabel(layer.name, props.locale, layer.id)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="desktop-tx-layer-delete__note">
              {t(props.locale, 'app.desktopTranscription.layerDeleteTargetHint')}
            </p>
          </div>
        ) : null}
      </ModalPanel>
    </div>
  );
}

/** Layers under `rootId` through a host link or `parentId`, the same walk the database rejects. */
function hostedDescendants(
  rootId: string,
  links: readonly ContextLink[],
  layers: readonly ContextLayer[],
): string[] {
  const found: string[] = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    for (const link of links) {
      if (link.hostLayerId !== id || seen.has(link.layerId)) continue;
      seen.add(link.layerId);
      found.push(link.layerId);
      queue.push(link.layerId);
    }
    for (const layer of layers) {
      if (layer.parentId !== id || seen.has(layer.id)) continue;
      seen.add(layer.id);
      found.push(layer.id);
      queue.push(layer.id);
    }
  }
  return found;
}
