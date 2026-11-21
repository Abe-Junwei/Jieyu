import { useEffect, useRef, useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, tf, type Locale } from '../i18n';
import { layerLabel } from './DesktopTranscriptionLayerRows';
import type { ContextLayer, ContextLink, LayerHostsInput } from './DesktopTranscriptionLayerList';

type LinkType = LayerHostsInput['linkType'];

const LINK_TYPES: readonly LinkType[] = ['direct', 'free', 'literal', 'pedagogical'];

const TYPE_KEY = {
  direct: 'app.desktopTranscription.layerHostsDirect',
  free: 'app.desktopTranscription.layerHostsFree',
  literal: 'app.desktopTranscription.layerHostsLiteral',
  pedagogical: 'app.desktopTranscription.layerHostsPedagogical',
} as const;

interface HostsPreview {
  removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
  blocked: boolean;
}

/** Choose the transcription layers a symbolic layer reads, and which one it hangs under. */
export function DesktopTranscriptionLayerHostsDialog(props: {
  locale: Locale;
  layer: ContextLayer;
  layers: readonly ContextLayer[];
  links: readonly ContextLink[];
  descendantIds: readonly string[];
  onPreview: (input: LayerHostsInput) => Promise<HostsPreview | null>;
  onSave: (input: LayerHostsInput) => void;
  onClose: () => void;
}) {
  const name = layerLabel(props.layer.name, props.locale, props.layer.id);
  const blocked = new Set(props.descendantIds);
  const candidates = props.layers.filter(
    (item) =>
      item.contentType === 'transcription' && item.id !== props.layer.id && !blocked.has(item.id),
  );
  const own = props.links.filter((link) => link.layerId === props.layer.id);
  const initialIds = candidates
    .map((item) => item.id)
    .filter((id) => own.some((link) => link.hostLayerId === id));
  const initialPreferred = own.find((link) => link.isPreferred)?.hostLayerId ?? initialIds[0] ?? '';
  const initialType = own.find((link) => link.isPreferred)?.linkType ?? own[0]?.linkType ?? 'free';
  const [hostIds, setHostIds] = useState(initialIds);
  const [preferredId, setPreferredId] = useState(initialPreferred);
  const [linkType, setLinkType] = useState<LinkType>(initialType);
  const [preview, setPreview] = useState<HostsPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const previewRef = useRef(props.onPreview);
  previewRef.current = props.onPreview;
  const unchanged =
    linkType === initialType &&
    preferredId === initialPreferred &&
    hostIds.length === initialIds.length &&
    hostIds.every((id, index) => id === initialIds[index]);
  const input: LayerHostsInput = {
    layerId: props.layer.id,
    hostLayerIds: hostIds,
    preferredHostLayerId: preferredId,
    linkType,
  };

  useEffect(() => {
    if (unchanged || hostIds.length === 0 || preferredId.length === 0) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    let active = true;
    setPreview(null);
    setPreviewError('');
    const timer = setTimeout(() => {
      void previewRef
        .current({
          layerId: props.layer.id,
          hostLayerIds: hostIds,
          preferredHostLayerId: preferredId,
          linkType,
        })
        .then((result) => {
          if (!active) return;
          setPreview(result);
          setPreviewError(
            result === null ? t(props.locale, 'app.desktopTranscription.layerActionFailed') : '',
          );
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setPreview(null);
          setPreviewError(
            caught instanceof Error && caught.message.length > 0
              ? caught.message
              : t(props.locale, 'app.desktopTranscription.layerActionFailed'),
          );
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hostIds, linkType, preferredId, props.layer.id, props.locale, unchanged]);

  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...hostIds, id] : hostIds.filter((item) => item !== id);
    const ordered = candidates.map((item) => item.id).filter((item) => next.includes(item));
    setHostIds(ordered);
    if (!checked && preferredId === id) setPreferredId(ordered[0] ?? '');
    if (checked && preferredId.length === 0) setPreferredId(id);
  };
  const removed = new Map((preview?.removed ?? []).map((row) => [row.hostLayerId, row]));
  const blockedRow = preview?.removed.find((row) => row.texts + row.drafts > 0);
  const blockedHost = candidates.find((item) => item.id === blockedRow?.hostLayerId);
  const preferredChanged = preferredId !== initialPreferred && preferredId.length > 0;
  const saveDisabled =
    hostIds.length === 0 ||
    unchanged ||
    preview === null ||
    preview.blocked ||
    blockedRow !== undefined;

  return (
    <ModalPanel
      isOpen
      compact
      onClose={props.onClose}
      title={t(props.locale, 'app.desktopTranscription.layerHostsTitle')}
      bodyClassName="desktop-tx-hosts"
      footerClassName="desktop-tx-hosts__footer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            {t(props.locale, 'app.desktopTranscription.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saveDisabled}
            onClick={() => props.onSave(input)}
          >
            {t(props.locale, 'app.desktopTranscription.layerHostsSave')}
          </button>
        </>
      }
    >
      <p className="desktop-tx-hosts__intro">
        {tf(props.locale, 'app.desktopTranscription.layerHostsIntro', { name })}
      </p>
      <p className="desktop-tx-hosts__label">
        {t(props.locale, 'app.desktopTranscription.layerHostsHost')}
      </p>
      <ul className="desktop-tx-hosts__list">
        {candidates.map((item) => {
          const checked = hostIds.includes(item.id);
          const label = layerLabel(item.name, props.locale, item.id);
          const count = removed.get(item.id);
          return (
            <li key={item.id} className="desktop-tx-hosts__row">
              <label className="desktop-tx-hosts__check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggle(item.id, event.target.checked)}
                />
                <span>{label}</span>
              </label>
              {count !== undefined && count.texts > 0 ? (
                <span className="desktop-tx-hosts__count">
                  {tf(props.locale, 'app.desktopTranscription.layerHostsTexts', {
                    count: count.texts,
                  })}
                </span>
              ) : (
                <span className="desktop-tx-hosts__count" />
              )}
              <label className="desktop-tx-hosts__preferred">
                <input
                  type="radio"
                  name={`layer-host-${props.layer.id}`}
                  checked={preferredId === item.id}
                  disabled={!checked}
                  aria-label={`${label} ${t(props.locale, 'app.desktopTranscription.layerHostsPreferred')}`}
                  onChange={() => setPreferredId(item.id)}
                />
                <span>{t(props.locale, 'app.desktopTranscription.layerHostsPreferred')}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <label className="desktop-tx-hosts__type">
        <span>{t(props.locale, 'app.desktopTranscription.layerHostsLinkType')}</span>
        <select
          value={linkType}
          onChange={(event) => {
            const next = event.target.value;
            if (isLinkType(next)) setLinkType(next);
          }}
        >
          {LINK_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(props.locale, TYPE_KEY[type])}
            </option>
          ))}
        </select>
      </label>
      {previewError.length > 0 ? (
        <p className="desktop-tx-hosts__reason" role="alert">
          {previewError}
        </p>
      ) : null}
      {blockedRow !== undefined && blockedHost !== undefined ? (
        <p className="desktop-tx-hosts__reason" role="alert">
          {tf(props.locale, 'app.desktopTranscription.layerHostsReason', {
            layer: name,
            host: layerLabel(blockedHost.name, props.locale, blockedHost.id),
            texts: blockedRow.texts,
            drafts: blockedRow.drafts,
          })}
        </p>
      ) : preferredChanged ? (
        <p className="desktop-tx-hosts__hint">
          {t(props.locale, 'app.desktopTranscription.layerHostsPreferredHint')}
        </p>
      ) : null}
    </ModalPanel>
  );
}

function isLinkType(value: string): value is LinkType {
  return LINK_TYPES.some((type) => type === value);
}
