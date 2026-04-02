import { fireAndForget } from '../utils/fireAndForget';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import type { ContextMenuItem } from './ContextMenu';

interface BuildSidePaneSidebarContextMenuItemsOptions {
  layerId: string | null;
  messages: SidePaneSidebarMessages;
  disableCreateTranslationEntry: boolean;
  deletableLayers: LayerDocType[];
  openCreateLayerPopover: (action: 'create-transcription' | 'create-translation', layerId?: string) => void;
  requestDeleteLayer: (layerId: string) => Promise<void>;
  closeContextMenu: () => void;
}

export function buildSidePaneSidebarContextMenuItems({
  layerId,
  messages,
  disableCreateTranslationEntry,
  deletableLayers,
  openCreateLayerPopover,
  requestDeleteLayer,
  closeContextMenu,
}: BuildSidePaneSidebarContextMenuItemsOptions): ContextMenuItem[] {
  if (!layerId) return [];

  return [
    {
      label: messages.contextCreateTranscription,
      onClick: () => {
        closeContextMenu();
        openCreateLayerPopover('create-transcription', layerId);
      },
    },
    {
      label: messages.contextCreateTranslation,
      disabled: disableCreateTranslationEntry,
      onClick: () => {
        closeContextMenu();
        openCreateLayerPopover('create-translation', layerId);
      },
    },
    {
      label: messages.contextDeleteCurrentLayer,
      danger: true,
      disabled: !deletableLayers.some((layer) => layer.id === layerId),
      onClick: () => {
        fireAndForget(requestDeleteLayer(layerId));
      },
    },
  ];
}
