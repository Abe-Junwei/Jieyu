import { useMemo } from 'react';
import {
  buildTranscriptionSelectionSnapshot,
  type BuildTranscriptionSelectionSnapshotInput,
} from './transcriptionSelectionSnapshot';

export function useTranscriptionSelectionSnapshot(input: BuildTranscriptionSelectionSnapshotInput) {
  return useMemo(() => buildTranscriptionSelectionSnapshot(input), [input]);
}
