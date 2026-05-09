/**
 * layerActionPopoverFieldIds — Field ID prefix builder for LayerActionPopover
 */

export interface LayerActionPopoverFieldIds {
  orthography: string;
  dialect: string;
  vernacular: string;
  alias: string;
  modality: string;
  constraint: string;
  accessRights: string;
  bridgeId: string;
  participantId: string;
  dataCategory: string;
  delimiter: string;
  sortOrder: string;
  translationLinkType: string;
  isDefault: string;
  translationParentLayer: string;
  transcriptionParentLayer: string;
  deleteLayer: string;
}

export function buildLayerActionPopoverFieldIds(fieldIdPrefix: string): LayerActionPopoverFieldIds {
  return {
    orthography: `${fieldIdPrefix}-orthography`,
    dialect: `${fieldIdPrefix}-dialect`,
    vernacular: `${fieldIdPrefix}-vernacular`,
    alias: `${fieldIdPrefix}-alias`,
    modality: `${fieldIdPrefix}-modality`,
    constraint: `${fieldIdPrefix}-constraint`,
    accessRights: `${fieldIdPrefix}-access-rights`,
    bridgeId: `${fieldIdPrefix}-bridge-id`,
    participantId: `${fieldIdPrefix}-participant-id`,
    dataCategory: `${fieldIdPrefix}-data-category`,
    delimiter: `${fieldIdPrefix}-delimiter`,
    sortOrder: `${fieldIdPrefix}-sort-order`,
    translationLinkType: `${fieldIdPrefix}-translation-link-type`,
    isDefault: `${fieldIdPrefix}-is-default`,
    translationParentLayer: `${fieldIdPrefix}-translation-parent-layer`,
    transcriptionParentLayer: `${fieldIdPrefix}-transcription-parent-layer`,
    deleteLayer: `${fieldIdPrefix}-delete-layer`,
  };
}
