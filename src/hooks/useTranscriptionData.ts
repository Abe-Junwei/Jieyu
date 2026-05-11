import type { SaveState, SnapGuide } from './transcription/transcriptionTypes';
import { useTranscriptionDataBindings } from './transcription/useTranscriptionDataBindings';
import { useTranscriptionDataFoundation } from './transcription/useTranscriptionDataFoundation';

export type { SaveState, SnapGuide };

export function useTranscriptionData() {
  const foundation = useTranscriptionDataFoundation();
  return useTranscriptionDataBindings(foundation);
}
