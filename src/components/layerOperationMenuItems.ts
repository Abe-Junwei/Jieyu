import type { LayerDocType } from '../db';
import type { ContextMenuItem } from './ContextMenu';

export type LayerOperationActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

interface LayerOperationMenuLabels {
  editLayerMetadata: string;
  createTranscription: string;
  createTranslation: string;
  deleteCurrentLayer: string;
}

interface BuildLayerOperationMenuItemsInput {
  layer: LayerDocType | undefined;
  deletableLayers: LayerDocType[];
  canOpenTranslationCreate: boolean;
  labels: LayerOperationMenuLabels;
  onAction: (action: LayerOperationActionType, layerId: string | undefined) => void;
}

export function buildLayerOperationMenuItems({
  layer,
  deletableLayers,
  canOpenTranslationCreate,
  labels,
  onAction,
}: BuildLayerOperationMenuItemsInput): ContextMenuItem[] {
  const layerId = layer?.id;
  const canDeleteCurrentLayer = !!layerId && deletableLayers.some((item) => item.id === layerId);

  return [
    {
      label: labels.editLayerMetadata,
      disabled: !layerId,
      onClick: () => {
        onAction(layer?.layerType === 'translation' ? 'edit-translation-metadata' : 'edit-transcription-metadata', layerId);
      },
    },
    {
      label: labels.createTranscription,
      onClick: () => {
        onAction('create-transcription', layerId);
      },
    },
    {
      label: labels.createTranslation,
      disabled: !canOpenTranslationCreate,
      onClick: () => {
        onAction('create-translation', layerId);
      },
    },
    {
      label: labels.deleteCurrentLayer,
      danger: true,
      disabled: !canDeleteCurrentLayer,
      onClick: () => {
        onAction('delete', layerId);
      },
    },
  ];
}