import type { LayerConstraint, LayerLinkDocType } from '../db';

export type LayerMetadataUpdateInput = {
  dialect?: string;
  vernacular?: string;
  alias?: string;
  languageId?: string;
  orthographyId?: string;
  modality?: 'text' | 'audio' | 'mixed';
  constraint?: LayerConstraint;
  parentLayerId?: string;
  bridgeId?: string;
  participantId?: string;
  dataCategory?: string;
  delimiter?: string;
  sortOrder?: number;
  accessRights?: 'open' | 'restricted' | 'confidential';
  isDefault?: boolean;
  hostTranscriptionLayerIds?: string[];
  preferredHostTranscriptionLayerId?: string;
  linkType?: LayerLinkDocType['linkType'];
};