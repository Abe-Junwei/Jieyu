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
  if (input.hosts && layer.tierType === 'symbolic-association') {
    items.push({ id: 'hosts', label: t(input.locale, 'app.desktopTranscription.layerHostsMenu') });
  }
  if (canMigrate(layer, input.layers, input.links)) {
    items.push({
      id: 'migrate',
      label: t(input.locale, 'app.desktopTranscription.layerDeleteMigrate'),
    });
  }
  items.push({
    id: 'delete',
    label: t(input.locale, 'app.desktopTranscription.layerDelete'),
    danger: true,
    ruleBefore: true,
  });
  return items;
}
