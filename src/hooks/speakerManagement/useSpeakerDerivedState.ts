/**
 * useSpeakerDerivedState | 说话人派生状态 Hook
 */

import { useMemo } from 'react';
import type { SpeakerDocType, UtteranceDocType } from '../../db';
import {
  buildSelectedSpeakerSummary,
  buildSpeakerFilterOptions,
  buildSpeakerVisualMap,
} from './speakerUtils';

export function useSpeakerDerivedState(
  utterancesOnCurrentMedia: UtteranceDocType[],
  selectedBatchUtterances: UtteranceDocType[],
  speakerOptions: SpeakerDocType[],
) {
  const speakerVisualByUtteranceId = useMemo(
    () => buildSpeakerVisualMap(utterancesOnCurrentMedia, speakerOptions),
    [speakerOptions, utterancesOnCurrentMedia],
  );

  const speakerFilterOptions = useMemo(
    () => buildSpeakerFilterOptions(utterancesOnCurrentMedia, speakerVisualByUtteranceId),
    [speakerVisualByUtteranceId, utterancesOnCurrentMedia],
  );

  const selectedSpeakerSummary = useMemo(
    () => buildSelectedSpeakerSummary(selectedBatchUtterances, speakerOptions),
    [selectedBatchUtterances, speakerOptions],
  );

  return {
    speakerVisualByUtteranceId,
    speakerFilterOptions,
    selectedSpeakerSummary,
  };
}