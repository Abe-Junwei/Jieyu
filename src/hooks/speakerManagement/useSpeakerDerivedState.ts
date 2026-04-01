/**
 * useSpeakerDerivedState | 说话人派生状态 Hook
 */

import { useMemo } from 'react';
import type { SpeakerDocType, UtteranceDocType } from '../../db';
import {
  buildSelectedSpeakerSummary,
  buildSpeakerFilterOptions,
  buildSpeakerVisualMap,
  type SpeakerDisplayLabels,
  type SpeakerSelectionSummaryLabels,
} from './speakerUtils';

type UseSpeakerDerivedStateLabels = {
  displayLabels?: Partial<SpeakerDisplayLabels>;
  summaryLabels?: Partial<SpeakerSelectionSummaryLabels>;
};

export function useSpeakerDerivedState(
  utterancesOnCurrentMedia: UtteranceDocType[],
  selectedBatchUtterances: UtteranceDocType[],
  speakerOptions: SpeakerDocType[],
  labels?: UseSpeakerDerivedStateLabels,
) {
  const speakerVisualByUtteranceId = useMemo(
    () => buildSpeakerVisualMap(utterancesOnCurrentMedia, speakerOptions, labels?.displayLabels),
    [labels?.displayLabels, speakerOptions, utterancesOnCurrentMedia],
  );

  const speakerFilterOptions = useMemo(
    () => buildSpeakerFilterOptions(utterancesOnCurrentMedia, speakerVisualByUtteranceId, labels?.displayLabels),
    [labels?.displayLabels, speakerVisualByUtteranceId, utterancesOnCurrentMedia],
  );

  const selectedSpeakerSummary = useMemo(
    () => buildSelectedSpeakerSummary(selectedBatchUtterances, speakerOptions, labels?.summaryLabels),
    [labels?.summaryLabels, selectedBatchUtterances, speakerOptions],
  );

  return {
    speakerVisualByUtteranceId,
    speakerFilterOptions,
    selectedSpeakerSummary,
  };
}