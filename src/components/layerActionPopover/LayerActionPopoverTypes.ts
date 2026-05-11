import type { LayerCreateInput } from '../../hooks/transcription/transcriptionTypes';
import type { LayerDocType, LayerLinkDocType } from '../../db';
import type { LayerMetadataUpdateInput } from '../../types/layerMetadata';
import type { LayerActionType } from '../layerActionPopoverHelpers';

export interface LayerActionPopoverProps {
  action: LayerActionType;
  layerId: string | undefined;
  deletableLayers: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  layerCreateMessage?: string;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  updateLayerMetadata?: (layerId: string, input: LayerMetadataUpdateInput) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  layerLinks?: ReadonlyArray<
    Pick<
      LayerLinkDocType,
      'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred' | 'linkType'
    >
  >;
  onClose: () => void;
}
