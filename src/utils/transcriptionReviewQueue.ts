import type { LayerUnitDocType } from '../db';
import { computeSegmentReviewIssueFlags, matchesReviewPreset, type SegmentReviewIssueFlags, type SegmentReviewPreset } from '../components/sidePaneSegmentListViewModel';

export type TranscriptionReviewPreset = SegmentReviewPreset | 'all';

export interface TranscriptionReviewItem {
  unit: LayerUnitDocType;
  flags: SegmentReviewIssueFlags;
}

export function buildTranscriptionReviewItems(unitsOnCurrentMedia: LayerUnitDocType[]): TranscriptionReviewItem[] {
  const sortedUnits = [...unitsOnCurrentMedia].sort((left, right) => {
    if (left.startTime !== right.startTime) return left.startTime - right.startTime;
    if (left.endTime !== right.endTime) return left.endTime - right.endTime;
    return left.id.localeCompare(right.id);
  });
  const reviewableUnits = sortedUnits.filter((unit) => unit.tags?.skipProcessing !== true);
  const assignedSpeakerCount = reviewableUnits.filter((unit) => (unit.speakerId?.trim() ?? '').length > 0).length;
  const allowSpeakerPending = reviewableUnits.length > 0
    && assignedSpeakerCount > 0
    && assignedSpeakerCount < reviewableUnits.length;

  return reviewableUnits.flatMap((unit, index, rows) => {
    const previousRow = rows[index - 1];
    const annotationStatus = unit.status ?? unit.annotationStatus;
    const flags = computeSegmentReviewIssueFlags({
      empty: (unit.transcription?.default?.trim() ?? '').length === 0,
      ...(unit.selfCertainty !== undefined ? { certainty: unit.selfCertainty } : {}),
      noteCategories: unit.noteCategoryKeys ?? [],
      ...(annotationStatus !== undefined ? { annotationStatus } : {}),
      speakerKeys: unit.speakerId?.trim() ? [unit.speakerId.trim()] : [],
      startTime: unit.startTime,
      endTime: unit.endTime,
      ...(unit.tags?.skipProcessing === true ? { skipProcessing: true } : {}),
    }, {
      isTranscriptionLayer: true,
      allowSpeakerPending,
      ...(previousRow !== undefined ? { previousEndTime: previousRow.endTime } : {}),
    });

    return Object.values(flags).some(Boolean) ? [{ unit, flags }] : [];
  });
}

export function filterTranscriptionReviewQueue(
  items: TranscriptionReviewItem[],
  preset: TranscriptionReviewPreset,
): LayerUnitDocType[] {
  return items.filter((item) => matchesReviewPreset(item.flags, preset)).map((item) => item.unit);
}

export function countTranscriptionReviewPresets(items: TranscriptionReviewItem[]): Record<TranscriptionReviewPreset, number> {
  return {
    all: items.length,
    time: items.filter((item) => matchesReviewPreset(item.flags, 'time')).length,
    content_concern: items.filter((item) => matchesReviewPreset(item.flags, 'content_concern')).length,
    content_missing: items.filter((item) => matchesReviewPreset(item.flags, 'content_missing')).length,
    manual_attention: items.filter((item) => matchesReviewPreset(item.flags, 'manual_attention')).length,
    pending_review: items.filter((item) => matchesReviewPreset(item.flags, 'pending_review')).length,
  };
}

export function buildTranscriptionReviewQueue(unitsOnCurrentMedia: LayerUnitDocType[]): LayerUnitDocType[] {
  return filterTranscriptionReviewQueue(buildTranscriptionReviewItems(unitsOnCurrentMedia), 'all');
}
