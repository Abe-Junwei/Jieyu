import type { LayerUnitStatus, NoteCategory, SpeakerDocType } from '../db';
import { getSpeakerDisplayNameByKey } from '../hooks/speakerManagement/speakerUtils';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

export type SegmentContentStateFilter = 'has_text' | 'empty_text';

export const NOTE_CATEGORY_ORDER: NoteCategory[] = ['todo', 'question', 'comment', 'correction', 'linguistic', 'fieldwork'];
export const CERTAINTY_ORDER: UnitSelfCertainty[] = ['not_understood', 'uncertain', 'certain'];
export const ANNOTATION_STATUS_ORDER: LayerUnitStatus[] = ['raw', 'transcribed', 'translated', 'glossed', 'verified'];
export const SOURCE_TYPE_ORDER: Array<'human' | 'ai'> = ['human', 'ai'];

export function resolveSpeakerLabel(
  speakerKey: string,
  speakerById: ReadonlyMap<string, SpeakerDocType>,
): string {
  if (!speakerKey) return '';
  return getSpeakerDisplayNameByKey(speakerKey, speakerById);
}

export function getNoteCategoryLabel(category: NoteCategory, messages: SidePaneSidebarMessages): string {
  switch (category) {
    case 'comment': return messages.segmentListNoteCategoryComment;
    case 'question': return messages.segmentListNoteCategoryQuestion;
    case 'todo': return messages.segmentListNoteCategoryTodo;
    case 'linguistic': return messages.segmentListNoteCategoryLinguistic;
    case 'fieldwork': return messages.segmentListNoteCategoryFieldwork;
    case 'correction': return messages.segmentListNoteCategoryCorrection;
    default: return category;
  }
}

export function getCertaintyLabel(certainty: UnitSelfCertainty, messages: SidePaneSidebarMessages): string {
  switch (certainty) {
    case 'not_understood': return messages.segmentListCertaintyNotUnderstood;
    case 'uncertain': return messages.segmentListCertaintyUncertain;
    case 'certain': return messages.segmentListCertaintyCertain;
    default: return certainty;
  }
}

export function getAnnotationStatusLabel(status: LayerUnitStatus, messages: SidePaneSidebarMessages): string {
  switch (status) {
    case 'raw': return messages.segmentListAnnotationStatusRaw;
    case 'transcribed': return messages.segmentListAnnotationStatusTranscribed;
    case 'translated': return messages.segmentListAnnotationStatusTranslated;
    case 'glossed': return messages.segmentListAnnotationStatusGlossed;
    case 'verified': return messages.segmentListAnnotationStatusVerified;
    default: return status;
  }
}

export function getSourceTypeLabel(sourceType: 'human' | 'ai', messages: SidePaneSidebarMessages): string {
  switch (sourceType) {
    case 'human': return messages.segmentListSourceTypeHuman;
    case 'ai': return messages.segmentListSourceTypeAi;
    default: return sourceType;
  }
}

export function getContentStateLabel(state: SegmentContentStateFilter, messages: SidePaneSidebarMessages): string {
  switch (state) {
    case 'has_text': return messages.segmentListContentStateHasText;
    case 'empty_text': return messages.segmentListContentStateEmptyText;
    default: return state;
  }
}

