import type { NoteCategory, SpeakerDocType } from '../db';
import { getSpeakerDisplayNameByKey } from '../hooks/speakerManagement/speakerUtils';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import type { UtteranceSelfCertainty } from '../utils/utteranceSelfCertainty';

export const NOTE_CATEGORY_ORDER: NoteCategory[] = ['todo', 'question', 'comment', 'correction', 'linguistic', 'fieldwork'];
export const CERTAINTY_ORDER: UtteranceSelfCertainty[] = ['not_understood', 'uncertain', 'certain'];

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

export function getCertaintyLabel(certainty: UtteranceSelfCertainty, messages: SidePaneSidebarMessages): string {
  switch (certainty) {
    case 'not_understood': return messages.segmentListCertaintyNotUnderstood;
    case 'uncertain': return messages.segmentListCertaintyUncertain;
    case 'certain': return messages.segmentListCertaintyCertain;
    default: return certainty;
  }
}

