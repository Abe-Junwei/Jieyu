/**
 * useSpeakerDerivedState | 说话人派生状态 Hook
 */

import { useMemo } from 'react';
import type { SpeakerDocType, LayerUnitDocType } from '../../db';
import { buildSelectedSpeakerSummary, buildSpeakerFilterOptions, buildSpeakerVisualMap, type SpeakerDisplayLabels, type SpeakerSelectionSummaryLabels } from './speakerUtils';

type UseSpeakerDerivedStateLabels = {
  displayLabels?: Partial<SpeakerDisplayLabels>;
  summaryLabels?: Partial<SpeakerSelectionSummaryLabels>;
};

export function useSpeakerDerivedState(
  unitsOnCurrentMedia: LayerUnitDocType[],
  selectedBatchUnits: LayerUnitDocType[],
  speakerOptions: SpeakerDocType[],
  labels?: UseSpeakerDerivedStateLabels,
) {
  const speakerVisualByUnitId = useMemo(
    () => buildSpeakerVisualMap(unitsOnCurrentMedia, speakerOptions, labels?.displayLabels),
    [labels?.displayLabels, speakerOptions, unitsOnCurrentMedia],
  );

  const speakerFilterOptions = useMemo(
    () => buildSpeakerFilterOptions(unitsOnCurrentMedia, speakerVisualByUnitId, labels?.displayLabels),
    [labels?.displayLabels, speakerVisualByUnitId, unitsOnCurrentMedia],
  );

  const selectedSpeakerSummary = useMemo(
    () => buildSelectedSpeakerSummary(selectedBatchUnits, speakerOptions, labels?.summaryLabels),
    [labels?.summaryLabels, selectedBatchUnits, speakerOptions],
  );

  return {
    speakerVisualByUnitId,
    speakerFilterOptions,
    selectedSpeakerSummary,
  };
}