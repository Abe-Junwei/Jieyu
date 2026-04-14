import { useState } from 'react';
import type { TimelineUnit } from './transcriptionTypes';

export function useTranscriptionSelectionState() {
  const [selectedTimelineUnit, setSelectedTimelineUnit] = useState<TimelineUnit | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');

  return {
    selectedTimelineUnit,
    setSelectedTimelineUnit,
    selectedUnitIds,
    setSelectedUnitIds,
    selectedMediaId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
  };
}
