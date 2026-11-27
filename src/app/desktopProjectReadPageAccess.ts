/** Desktop folder reader for pages. Pages cannot import `../db`. */
export type { Manuscript, ManuscriptDeletePreview } from '../db/desktop/manuscripts';
export type { DeletedMedia } from '../db/desktop/media';
export type { DueDeletionReminder } from '../db/desktop/manuscriptPurge';
export { createDesktopClient, EDIT_OUTCOME_UNKNOWN } from '../db/desktop/client';
export type { UnitDeletePreview } from '../db/desktop/unitEdges';
export type {
  CorpusQueryCursor,
  CorpusQueryHit,
  CorpusQueryItem,
  CorpusTextSpan,
} from '../db/desktop/corpusQuery';
export type { ContentNoteCategory } from '../db/desktop/notes';
export type { Speaker } from '../db/desktop/speakers';
export type { ProjectBridge, ProjectLanguage, ProjectOrthography } from '../db/desktop/catalog';
export { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from '../db/desktop/customFieldValidation';
export {
  loadDesktopProjectRead,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../db/desktop/projectRead';

export type { SplitTextPreview, FormalCut } from '../db/desktop/unitSplitTextPlan';
export type { ViewScope, ViewScopeWrite } from '../db/desktop/viewScope';
