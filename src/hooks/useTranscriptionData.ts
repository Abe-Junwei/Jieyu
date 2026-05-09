import type { SaveState, SnapGuide } from './transcriptionTypes';
import { useTranscriptionDataBindings } from './useTranscriptionDataBindings';
import { useTranscriptionDataFoundation } from './useTranscriptionDataFoundation';

export type { SaveState, SnapGuide };

export function useTranscriptionData() {
  const foundation = useTranscriptionDataFoundation();
  return useTranscriptionDataBindings(foundation);
}
