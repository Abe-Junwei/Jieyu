import { useState } from 'react';

export function useTranscriptionSelectionState() {
  const [selectedUtteranceId, setSelectedUtteranceId] = useState<string>('');
  const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');

  return {
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
    selectedMediaId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
  };
}
