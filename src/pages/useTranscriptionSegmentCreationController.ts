import { useLocale } from '../i18n';
import {
  createTranscriptionSegmentCreationActions,
  type UseTranscriptionSegmentCreationControllerInput,
  type UseTranscriptionSegmentCreationControllerResult,
} from './transcriptionSegmentCreationActions';

export type {
  CreateUtteranceOptions,
  UseTranscriptionSegmentCreationControllerInput,
  UseTranscriptionSegmentCreationControllerResult,
} from './transcriptionSegmentCreationActions';

export function useTranscriptionSegmentCreationController(
  input: UseTranscriptionSegmentCreationControllerInput,
): UseTranscriptionSegmentCreationControllerResult {
  const locale = useLocale();
  return createTranscriptionSegmentCreationActions(input, locale);
}
