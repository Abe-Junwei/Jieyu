/**
 * Speaker management shared types | 说话人管理共享类型
 */

export interface SpeakerVisual {
  name: string;
  color: string;
}

export interface SpeakerFilterOption {
  key: string;
  name: string;
  count: number;
  color?: string;
}

export interface SpeakerReferenceStats {
  /** Rows in `utterances` (default transcription axis). */
  transcriptionUnitCount: number;
  /** Rows in independent / layer segments. */
  segmentCount: number;
  totalCount: number;
}

export const EMPTY_SPEAKER_REFERENCE_STATS: SpeakerReferenceStats = {
  transcriptionUnitCount: 0,
  segmentCount: 0,
  totalCount: 0,
};

/** Result of `LinguisticService.getSpeakerReferenceStats` (per-speaker map + unassigned bucket). */
export interface SpeakerReferenceStatsBundle {
  perSpeaker: Record<string, SpeakerReferenceStats>;
  unassigned: SpeakerReferenceStats;
}

export interface SpeakerScope {
  speakerVisualByUtteranceId: Record<string, SpeakerVisual>;
  speakerFilterOptions: SpeakerFilterOption[];
  selectedSpeakerSummary: string;
}

export type SpeakerActionDialogState =
  | {
      mode: 'rename';
      speakerKey: string;
      speakerName: string;
      draftName: string;
    }
  | {
      mode: 'merge';
      sourceSpeakerKey: string;
      sourceSpeakerName: string;
      targetSpeakerKey: string;
      candidates: Array<{ key: string; name: string }>;
    }
  | {
      mode: 'clear';
      speakerKey: string;
      speakerName: string;
      affectedCount: number;
    }
  | {
      mode: 'delete';
      sourceSpeakerKey: string;
      sourceSpeakerName: string;
      replacementSpeakerKey: string;
      candidates: Array<{ key: string; name: string }>;
      affectedCount: number;
    };