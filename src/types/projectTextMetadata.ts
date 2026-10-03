/**
 * Keys stored on `texts.metadata` for one project (`textId`).
 * Language catalogs and orthographies stay in global tables.
 * Gloss abbreviations are this object's `annotationAbbreviations`, not the `abbreviations` table.
 */
export const PROJECT_TEXT_METADATA_KEYS = [
  'primaryLanguageId',
  'objectLanguageIds',
  'workingLanguageIds',
  'timelineMode',
  'logicalDurationSec',
  'timeMapping',
  'timeMappingHistory',
  'timeMappingRollback',
  'annotationAbbreviations',
  'annotationPosCategories',
  'characterVariantLines',
  'annotationDocumentLayout',
  'projectSpeakerIds',
] as const;

export type ProjectTextMetadataKey = (typeof PROJECT_TEXT_METADATA_KEYS)[number];

export const projectTextMetadataKey = {
  primaryLanguageId: 'primaryLanguageId',
  objectLanguageIds: 'objectLanguageIds',
  workingLanguageIds: 'workingLanguageIds',
  timelineMode: 'timelineMode',
  logicalDurationSec: 'logicalDurationSec',
  timeMapping: 'timeMapping',
  timeMappingHistory: 'timeMappingHistory',
  timeMappingRollback: 'timeMappingRollback',
  annotationAbbreviations: 'annotationAbbreviations',
  annotationPosCategories: 'annotationPosCategories',
  characterVariantLines: 'characterVariantLines',
  annotationDocumentLayout: 'annotationDocumentLayout',
  projectSpeakerIds: 'projectSpeakerIds',
} as const satisfies Record<ProjectTextMetadataKey, ProjectTextMetadataKey>;

export interface ProjectTextMetadata {
  primaryLanguageId?: string;
  objectLanguageIds?: string[];
  workingLanguageIds?: string[];
  timelineMode?: string;
  logicalDurationSec?: number;
  timeMapping?: unknown;
  timeMappingHistory?: unknown;
  timeMappingRollback?: unknown;
  annotationAbbreviations?: unknown;
  annotationPosCategories?: unknown;
  characterVariantLines?: string;
  annotationDocumentLayout?: unknown;
  /** Speaker ids on this project's roster. The speaker row itself stays global. */
  projectSpeakerIds?: string[];
  [key: string]: unknown;
}
