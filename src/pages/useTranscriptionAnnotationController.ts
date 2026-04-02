import { createLogger } from '../observability/logger';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { updateOverlapCycleTelemetry } from '../utils/overlapCycleTelemetry';

const log = createLogger('TranscriptionPage');

type UseTimelineAnnotationHelpersInput = Parameters<typeof useTimelineAnnotationHelpers>[0];

interface UseTranscriptionAnnotationControllerInput extends UseTimelineAnnotationHelpersInput {
  setOverlapCycleToast: React.Dispatch<React.SetStateAction<{ index: number; total: number; nonce: number } | null>>;
  overlapCycleTelemetryRef: React.MutableRefObject<ReturnType<typeof updateOverlapCycleTelemetry>>;
}

export function useTranscriptionAnnotationController({
  setOverlapCycleToast,
  overlapCycleTelemetryRef,
  ...annotationHelpersInput
}: UseTranscriptionAnnotationControllerInput) {
  return useTimelineAnnotationHelpers({
    ...annotationHelpersInput,
    onOverlapCycleToast: (index, total, utteranceId) => {
      setOverlapCycleToast({ index, total, nonce: Date.now() });
      const nextTelemetry = updateOverlapCycleTelemetry(overlapCycleTelemetryRef.current, {
        utteranceId,
        index,
        total,
      });
      overlapCycleTelemetryRef.current = nextTelemetry;
      log.info('Overlap cycle telemetry update', {
        event: 'transcription.overlap_cycle',
        cycleCount: nextTelemetry.cycleCount,
        avgStep: nextTelemetry.avgStep,
        avgCandidateTotal: nextTelemetry.avgCandidateTotal,
      });
    },
  });
}
