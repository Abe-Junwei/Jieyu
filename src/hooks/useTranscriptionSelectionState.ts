import { useState } from 'react';
import type { TimelineUnit } from './transcriptionTypes';

export function useTranscriptionSelectionState() {
  const [selectedTimelineUnit, setSelectedTimelineUnit] = useState<TimelineUnit | null>(null);
  const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');

  return {
    selectedTimelineUnit,
    setSelectedTimelineUnit,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
    selectedMediaId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
  };
}
