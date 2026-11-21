import { useRef, useState } from 'react';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, tf, type Locale } from '../i18n';
import { JIEYU_ICON_INLINE_TIGHT } from '../utils/jieyuIcon';
import { DesktopTranscriptionLayerHostsDialog } from './DesktopTranscriptionLayerHostsDialog';
import { layerLabel } from './DesktopTranscriptionLayerRows';
import { buildLayerTree, emptyFold } from './desktopTranscriptionLayerTree';

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

/** The next unused display name: the base word, then "base 2", "base 3", and so on. */
function nextLayerName(base: string, layers: readonly ContextLayer[], locale: Locale): string {
  const taken = new Set(layers.map((layer) => layerLabel(layer.name, locale, layer.id)));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base} ${count}`)) count += 1;
  return `${base} ${count}`;
}

/** The context-column layer list: create, rename, reorder, and delete. Height is dragged on the lane. */
export function DesktopTranscriptionLayerList(props: {
  locale: Locale;
  layers: readonly ContextLayer[];
  links: readonly ContextLink[];
  currentId: string | null;
  error: string;
  onSelect: (layerId: string) => void;
  onCreate: (kind: 'transcription' | 'translation', label: string) => void;
  onCreatePair?: (kind: 'voice' | 'oral', audioName: string, textName: string) => void;
  onRename: (layerId: string, name: Record<string, string>) => void;
  onMove: (layerId: string, direction: 'up' | 'down') => void;
  onDelete: (layerId: string, mode: 'soft' | 'migrate' | 'purge', targetLayerId?: string) => void;
  onPreviewHosts?: (input: LayerHostsInput) => Promise<{
    removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
    blocked: boolean;
  } | null>;
  onSetHosts?: (input: LayerHostsInput) => void;
  onClearError?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<ContextLayer | null>(null);
  const [migrating, setMigrating] = useState<ContextLayer | null>(null);
  const [targetId, setTargetId] = useState('');
  const [menu, setMenu] = useState<{ layerId: string; x: number; y: number } | null>(null);
  const [hostsLayer, setHostsLayer] = useState<ContextLayer | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const renameOpen = useRef(false);
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
  return (
    <div className="desktop-tx-layer-list">
      {props.error.length > 0 ? <p role="alert">{props.error}</p> : null}
      {props.layers.length === 0 ? (
        <p className="desktop-tx-context__empty">
          {t(props.locale, 'app.desktopTranscription.contextEmptyLayers')}
        </p>
      ) : null}
      <ul className="desktop-tx-context__rows">
        {ordered.map(({ layer, depth }) => {
          const name = layerLabel(layer.name, props.locale, layer.id);
          const kind =
            layer.contentType === 'translation'
              ? 'app.desktopTranscription.contextLayerTranslation'
              : 'app.desktopTranscription.contextLayerTranscription';
          return (
            <li
              key={layer.id}
              className="desktop-tx-layer-list__line"
              data-current={layer.id === props.currentId ? 'true' : 'false'}
              data-depth={Math.min(depth, 3)}
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
                  className="desktop-tx-context__row"
                  aria-current={layer.id === props.currentId ? 'true' : undefined}
                  onClick={() => props.onSelect(layer.id)}
                >
                  <span className="desktop-tx-context__kind">{t(props.locale, kind)}</span>
                  <span className="desktop-tx-context__name">{name}</span>
                </button>
              )}
              <button
                type="button"
                className="desktop-tx-context__more"
                aria-label={t(props.locale, 'app.desktopTranscription.layerMenu')}
                aria-haspopup="menu"
                aria-expanded={menu?.layerId === layer.id}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu((current) =>
                    current?.layerId === layer.id
                      ? null
                      : {
                          layerId: layer.id,
                          x: Math.max(8, rect.right - 168),
                          y: rect.bottom + 4,
                        },
                  );
                }}
              >
                <span />
                <span />
                <span />
              </button>
            </li>
          );
        })}
        <li className="desktop-tx-layer-list__add">
          <button
            type="button"
            className="desktop-tx-context__row"
            onClick={() =>
              props.onCreate(
                'transcription',
                nextLayerName(
                  t(props.locale, 'app.desktopTranscription.contextLayerTranscription'),
                  props.layers,
                  props.locale,
                ),
              )
            }
          >
            <JieyuIcon name="Plus" className={JIEYU_ICON_INLINE_TIGHT} aria-hidden />
            {t(props.locale, 'transcription.laneHeader.layer.createTranscription')}
          </button>
        </li>
        <li className="desktop-tx-layer-list__add">
          <button
            type="button"
            className="desktop-tx-context__row"
            onClick={() =>
              props.onCreate(
                'translation',
                nextLayerName(
                  t(props.locale, 'app.desktopTranscription.contextLayerTranslation'),
                  props.layers,
                  props.locale,
                ),
              )
            }
          >
            <JieyuIcon name="Plus" className={JIEYU_ICON_INLINE_TIGHT} aria-hidden />
            {t(props.locale, 'transcription.laneHeader.layer.createTranslation')}
          </button>
        </li>
        {props.onCreatePair === undefined ? null : (
          <>
            <li className="desktop-tx-layer-list__add">
              <button
                type="button"
                className="desktop-tx-context__row"
                onClick={() =>
                  props.onCreatePair?.(
                    'voice',
                    nextLayerName(
                      t(props.locale, 'app.desktopTranscription.contextLayerVoice'),
                      props.layers,
                      props.locale,
                    ),
                    nextLayerName(
                      t(props.locale, 'app.desktopTranscription.contextLayerVoiceText'),
                      props.layers,
                      props.locale,
                    ),
                  )
                }
              >
                <JieyuIcon name="Plus" className={JIEYU_ICON_INLINE_TIGHT} aria-hidden />
                {t(props.locale, 'transcription.laneHeader.layer.createVoice')}
              </button>
            </li>
            <li className="desktop-tx-layer-list__add">
              <button
                type="button"
                className="desktop-tx-context__row"
                onClick={() =>
                  props.onCreatePair?.(
                    'oral',
                    nextLayerName(
                      t(props.locale, 'app.desktopTranscription.contextLayerOral'),
                      props.layers,
                      props.locale,
                    ),
                    nextLayerName(
                      t(props.locale, 'app.desktopTranscription.contextLayerOralText'),
                      props.layers,
                      props.locale,
                    ),
                  )
                }
              >
                <JieyuIcon name="Plus" className={JIEYU_ICON_INLINE_TIGHT} aria-hidden />
                {t(props.locale, 'transcription.laneHeader.layer.createOral')}
              </button>
            </li>
          </>
        )}
      </ul>
      {menu === null ? null : (
        <>
          <button
            type="button"
            className="desktop-tx-menu-backdrop"
            aria-label={t(props.locale, 'app.desktopTranscription.cancel')}
            onClick={() => setMenu(null)}
          />
          <div
            className="desktop-tx-menu desktop-tx-menu-fixed desktop-tx-context__menu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            {(
              [
                ['up', 'app.desktopTranscription.layerMoveUp'],
                ['down', 'app.desktopTranscription.layerMoveDown'],
                ['rename', 'app.desktopTranscription.layerRename'],
              ] as const
            ).map(([action, key]) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                onClick={() => {
                  const layer = props.layers.find((item) => item.id === menu.layerId);
                  setMenu(null);
                  if (!layer) return;
                  if (action === 'rename') {
                    renameOpen.current = true;
                    setEditingId(layer.id);
                    setDraft(layerLabel(layer.name, props.locale, layer.id));
                    return;
                  }
                  props.onMove(layer.id, action);
                }}
              >
                {t(props.locale, key)}
              </button>
            ))}
            {props.onPreviewHosts !== undefined &&
            props.onSetHosts !== undefined &&
            props.layers.find((item) => item.id === menu.layerId)?.tierType ===
              'symbolic-association' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const layer = props.layers.find((item) => item.id === menu.layerId);
                  setMenu(null);
                  if (layer) setHostsLayer(layer);
                }}
              >
                {t(props.locale, 'app.desktopTranscription.layerHostsMenu')}
              </button>
            ) : null}
            {canMigrate(menu.layerId) ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const layer = props.layers.find((item) => item.id === menu.layerId);
                  setMenu(null);
                  if (!layer) return;
                  setMigrating(layer);
                  setTargetId('');
                  setTargetOpen(false);
                }}
              >
                {t(props.locale, 'app.desktopTranscription.layerDeleteMigrate')}
              </button>
            ) : null}
            <div className="desktop-tx-menu__rule" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                const layer = props.layers.find((item) => item.id === menu.layerId);
                setMenu(null);
                if (!layer) return;
                if (layer.contentCount === 0 && childCount(layer.id) === 0) {
                  props.onDelete(layer.id, 'soft');
                  return;
                }
                setDeleting(layer);
              }}
            >
              {t(props.locale, 'app.desktopTranscription.layerDelete')}
            </button>
          </div>
        </>
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
