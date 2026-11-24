import { t, tf, type Locale } from '../i18n';
import { layerLabel } from './DesktopTranscriptionLayerRows';
import type { LayerMenuReasonKey } from './useDesktopTranscriptionLayerDragController';

export type LayerCommandId =
  'up' | 'down' | 'rename' | 'attach' | 'return' | 'hosts' | 'migrate' | 'delete';

export interface LayerCommandItem {
  id: LayerCommandId;
  label: string;
  disabledReason?: string;
  danger?: boolean;
  ruleBefore?: boolean;
}

export interface LayerCommandSource {
  id: string;
  name: Record<string, string>;
  contentType: string;
  modality?: string | undefined;
  tierType?: string;
}

export interface LayerCommandLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
}

export interface LayerCommandDrag {
  attachReason: (layerId: string) => LayerMenuReasonKey | null;
  returnReason: (layerId: string) => LayerMenuReasonKey | null;
  showReturn: (layerId: string) => boolean;
}

function hostOf(id: string, links: readonly LayerCommandLink[]): string | null {
  const preferred = links.find((link) => link.layerId === id && link.isPreferred);
  return (preferred ?? links.find((link) => link.layerId === id))?.hostLayerId ?? null;
}

function canMigrate(
  layer: LayerCommandSource,
  layers: readonly LayerCommandSource[],
  links: readonly LayerCommandLink[],
): boolean {
  const host = hostOf(layer.id, links);
  return layers.some(
    (item) =>
      item.id !== layer.id &&
      item.contentType === layer.contentType &&
      item.tierType === layer.tierType &&
      hostOf(item.id, links) === host,
  );
}

/** The next unused display name: the base word, then "base 2", "base 3", and so on. */
export function nextLayerName(
  base: string,
  layers: readonly { id: string; name: Record<string, string> }[],
  locale: Locale,
): string {
  const taken = new Set(layers.map((layer) => layerLabel(layer.name, locale, layer.id)));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base} ${count}`)) count += 1;
  return `${base} ${count}`;
}

/** Items that used to live on the context-column row menu, in that order. */
export function layerCommandItems(input: {
  locale: Locale;
  layerId: string;
  layers: readonly LayerCommandSource[];
  links: readonly LayerCommandLink[];
  currentId: string | null;
  drag?: LayerCommandDrag;
  hosts: boolean;
}): LayerCommandItem[] {
  const layer = input.layers.find((item) => item.id === input.layerId);
  if (layer === undefined) return [];
  const items: LayerCommandItem[] = [
    { id: 'up', label: t(input.locale, 'app.desktopTranscription.layerMoveUp') },
    { id: 'down', label: t(input.locale, 'app.desktopTranscription.layerMoveDown') },
    { id: 'rename', label: t(input.locale, 'app.desktopTranscription.layerRename') },
  ];
  if (input.drag !== undefined) {
    const reason = input.drag.attachReason(layer.id);
    const current = input.layers.find((item) => item.id === input.currentId);
    const attach: LayerCommandItem = {
      id: 'attach',
      label: current
        ? tf(input.locale, 'app.desktopTranscription.layerAttachNamed', {
            name: layerLabel(current.name, input.locale, current.id),
          })
        : t(input.locale, 'app.desktopTranscription.layerAttachCurrent'),
    };
    if (!(layer.tierType === 'time-aligned' && layer.contentType === 'transcription')) {
      if (reason !== null) attach.disabledReason = t(input.locale, reason);
      items.push(attach);
    }
    if (input.drag.showReturn(layer.id)) {
      const back = input.drag.returnReason(layer.id);
      const home: LayerCommandItem = {
        id: 'return',
        label: t(input.locale, 'app.desktopTranscription.layerReturnRoot'),
      };
      if (back !== null) home.disabledReason = t(input.locale, back);
      items.push(home);
    }
  }
  if (
    input.hosts &&
    layer.tierType === 'symbolic-association' &&
    layer.contentType === 'translation'
  ) {
    items.push({ id: 'hosts', label: t(input.locale, 'app.desktopTranscription.layerHostsMenu') });
  }
  const blocked = orthographyDeletionBlocked(layer.id, input.layers, input.links);
  const disabled = blocked
    ? { disabledReason: t(input.locale, 'app.desktopTranscription.orthographyDeleteBlocked') }
    : {};
  if (canMigrate(layer, input.layers, input.links)) {
    items.push({
      ...disabled,
      id: 'migrate',
      label: t(input.locale, 'app.desktopTranscription.layerDeleteMigrate'),
    });
  }
  items.push({
    ...disabled,
    id: 'delete',
    label: t(input.locale, 'app.desktopTranscription.layerDelete'),
    danger: true,
    ruleBefore: true,
  });
  return items;
}

export type LayerCreateKind = 'transcription' | 'translation' | 'orthography';

export function layerCreateParams(input: {
  kind: LayerCreateKind;
  label: string;
  manuscriptId: string | null;
  currentLayerId: string | null;
  layers: readonly {
    id: string;
    key?: string;
    tierType?: string;
    contentType?: string;
    sortOrder?: number;
    languageId?: string | null;
  }[];
  links: readonly { layerId: string; hostLayerId: string; isPreferred?: boolean }[];
  deletedKeys: readonly string[];
}) {
  const timed = (id: string | undefined) =>
    input.layers.find(
      (row) =>
        row.id === id && row.contentType === 'transcription' && row.tierType === 'time-aligned',
    );
  const hostLinks = input.links.filter((row) => row.layerId === input.currentLayerId);
  const link = hostLinks.find((row) => row.isPreferred) ?? hostLinks[0];
  const currentHost = timed(input.currentLayerId ?? undefined) ?? timed(link?.hostLayerId);
  const host =
    currentHost ??
    (input.kind === 'translation' ? input.layers.find((row) => timed(row.id)) : undefined);
  if (input.kind !== 'transcription' && host === undefined)
    throw new Error('layer host is not a transcription layer');
  const prefix = input.kind === 'translation' ? 'tl' : 'tx';
  const taken = new Set([
    ...input.deletedKeys,
    ...input.layers.flatMap((row) => (row.key === undefined ? [] : [row.key])),
  ]);
  let count = input.layers.length + 1;
  while (taken.has(`${prefix}-${count}`)) count += 1;
  return {
    manuscriptId: input.manuscriptId,
    key: `${prefix}-${count}`,
    name: { zh: input.label },
    tierType: input.kind === 'transcription' ? 'time-aligned' : 'symbolic-association',
    contentType: input.kind === 'translation' ? 'translation' : 'transcription',
    sortOrder: Math.max(-1, ...input.layers.map((row) => row.sortOrder ?? 0)) + 1,
    ...(input.kind === 'orthography' && host?.languageId != null
      ? { languageId: host.languageId }
      : {}),
    ...(input.kind !== 'transcription' && host !== undefined
      ? { hosts: [{ hostLayerId: host.id, preferred: true }] }
      : {}),
  };
}

export function orthographyDeletionBlocked(
  layerId: string,
  layers: readonly {
    id: string;
    contentType?: string;
    tierType?: string | undefined;
    modality?: string | undefined;
  }[],
  links: readonly { layerId: string; hostLayerId: string }[],
): boolean {
  return layers.some(
    (layer) =>
      layer.contentType === 'transcription' &&
      layer.tierType === 'symbolic-association' &&
      layer.modality !== 'audio' &&
      links.some((link) => link.layerId === layer.id && link.hostLayerId === layerId),
  );
}
