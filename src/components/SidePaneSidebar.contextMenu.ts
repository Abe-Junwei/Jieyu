import { fireAndForget } from '../utils/fireAndForget';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import type { ContextMenuItem } from './ContextMenu';

interface BuildSidePaneSidebarContextMenuItemsOptions {
  layerId: string | null;
  messages: SidePaneSidebarMessages;
  allLayers: LayerDocType[];
  deletableLayers: LayerDocType[];
  canOpenLayerMetadata: boolean;
  requestOpenLayerMetadata: (layerId: string) => void;
  requestDeleteLayer: (layerId: string) => Promise<void>;
}

export function buildSidePaneSidebarContextMenuItems({
  layerId,
  messages,
  allLayers,
  deletableLayers,
  canOpenLayerMetadata,
  requestOpenLayerMetadata,
  requestDeleteLayer,
}: BuildSidePaneSidebarContextMenuItemsOptions): ContextMenuItem[] {
  if (!layerId) return [];

  const currentLayer = allLayers.find((layer) => layer.id === layerId);
  const canEditMetadata = Boolean(currentLayer);
  const canDeleteLayer = deletableLayers.some((layer) => layer.id === layerId);
  const editMetadataLabel = currentLayer?.layerType === 'translation'
    ? messages.contextEditTranslationMetadata
    : messages.contextEditTranscriptionMetadata;

  return [
    {
      label: editMetadataLabel,
      disabled: !canEditMetadata || !canOpenLayerMetadata,
      onClick: () => {
        requestOpenLayerMetadata(layerId);
      },
    },
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
