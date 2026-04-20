import { fireAndForget } from '../utils/fireAndForget';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import type { ContextMenuItem } from './ContextMenu';

interface BuildSidePaneSidebarContextMenuItemsOptions {
  layerId: string | null;
  messages: SidePaneSidebarMessages;
  deletableLayers: LayerDocType[];
  requestDeleteLayer: (layerId: string) => Promise<void>;
}

export function buildSidePaneSidebarContextMenuItems({
  layerId,
  messages,
  deletableLayers,
  requestDeleteLayer,
}: BuildSidePaneSidebarContextMenuItemsOptions): ContextMenuItem[] {
  if (!layerId) return [];

  const canDeleteLayer = deletableLayers.some((layer) => layer.id === layerId);

  return [
    {
      label: messages.contextDeleteCurrentLayer,
      danger: true,
      disabled: !canDeleteLayer,
      onClick: () => {
        fireAndForget(requestDeleteLayer(layerId));
      },
    },
  ];
}
