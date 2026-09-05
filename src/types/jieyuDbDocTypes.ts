/**
 * Re-exports Dexie document types for page modules (M3: `src/pages/*` must not import `../db` directly).
 */

export type {
  CustomFieldDefinitionDocType,
  CustomFieldValueType,
  LanguageCatalogHistoryDocType,
  LayerDisplaySettings,
  LayerDocType,
  LayerLinkDocType,
  LayerSegmentViewDocType,
  LayerUnitContentDocType,
  LayerUnitContentViewDocType,
  LayerUnitDocType,
  LexemeDocType,
  TokenLexemeLinkDocType,
  LexemeAssetDocType,
  LexemeAssetLinkDocType,
  MediaItemDocType,
  MultiLangString,
  OrthographyDocType,
  SpeakerDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
  UserNoteDocType,
} from '../db';
