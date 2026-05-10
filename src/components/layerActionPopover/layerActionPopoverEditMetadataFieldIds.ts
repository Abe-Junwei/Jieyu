export function buildLayerActionPopoverEditMetadataFieldIds(fieldIdPrefix: string) {
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
  } as const;
}

export type LayerActionPopoverEditMetadataFieldIds = ReturnType<
  typeof buildLayerActionPopoverEditMetadataFieldIds
>;
