import { useMemo } from 'react';
import { useTranscriptionAnnotationController } from './useTranscriptionAnnotationController';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';

type UseAnnotationInput = Omit<Parameters<typeof useTranscriptionAnnotationController>[0], 'timelineTextLayers'>;
type UseTimelineInput = Omit<Parameters<typeof useTranscriptionTimelineController>[0], 'renderLaneLabel'>;
type TimelineLayer = UseTimelineInput['transcriptionLayers'][number];

interface UseReadyWorkspaceTextEditingControllerInput {
  annotationInput: UseAnnotationInput;
  timelineInput: UseTimelineInput;
  transcriptionLayers: TimelineLayer[];
  translationLayers: TimelineLayer[];
}

type UseReadyWorkspaceTextEditingControllerResult = {
  annotationController: ReturnType<typeof useTranscriptionAnnotationController>;
  timelineController: ReturnType<typeof useTranscriptionTimelineController>;
};

/**
 * 文本编辑域控制器聚合（注释/标签 + 文本轨编辑）。
 * Aggregate text-editing domain controllers (annotation + timeline text editing).
 */
export function useReadyWorkspaceTextEditingController(
  input: UseReadyWorkspaceTextEditingControllerInput,
): UseReadyWorkspaceTextEditingControllerResult {
  const timelineTextLayersForContextMenu = useMemo(
    () => [...input.transcriptionLayers, ...input.translationLayers],
    [input.transcriptionLayers, input.translationLayers],
  );

  const annotationController = useTranscriptionAnnotationController({
    ...input.annotationInput,
    timelineTextLayers: timelineTextLayersForContextMenu,
  });

  const timelineController = useTranscriptionTimelineController({
    ...input.timelineInput,
    renderLaneLabel: annotationController.renderLaneLabel,
  });

  return {
    annotationController,
    timelineController,
  };
}
