import { buildReadyWorkspaceAssistantSidebarControllerInputHeaderSlice } from './readyWorkspaceAssistantSidebarControllerInputHeaderSlice';
import { buildReadyWorkspaceAssistantSidebarRuntimePropsInput } from './readyWorkspaceAssistantSidebarRuntimePropsInputSlice';
import { useReadyWorkspaceTrackEditControllers } from './useReadyWorkspaceTrackEditControllers';
import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';
import { useTranscriptionAssistantSidebarControllerInput } from './useTranscriptionAssistantSidebarControllerInput';
import { useTranscriptionWorkspacePanelEffects } from './useTranscriptionWorkspacePanelEffects';

export interface UseReadyWorkspaceSidebarAndTrackPhaseParams {
  assistantSidebarHeaderInput: Parameters<
    typeof buildReadyWorkspaceAssistantSidebarControllerInputHeaderSlice
  >[0];
  assistantSidebarRuntimeInput: Parameters<
    typeof buildReadyWorkspaceAssistantSidebarRuntimePropsInput
  >[0];
  workspacePanelEffects: Parameters<typeof useTranscriptionWorkspacePanelEffects>[0];
  trackEditControllers: Parameters<typeof useReadyWorkspaceTrackEditControllers>[0];
}

/** L10：Assistant 侧栏 input/controller + 工作区面板 effect + 轨面编辑 controllers */
export function useReadyWorkspaceSidebarAndTrackPhase(
  params: UseReadyWorkspaceSidebarAndTrackPhaseParams,
) {
  const {
    assistantSidebarHeaderInput,
    assistantSidebarRuntimeInput,
    workspacePanelEffects,
    trackEditControllers,
  } = params;

  const assistantSidebarControllerInput = useTranscriptionAssistantSidebarControllerInput({
    ...buildReadyWorkspaceAssistantSidebarControllerInputHeaderSlice(assistantSidebarHeaderInput),
    runtimePropsInput: buildReadyWorkspaceAssistantSidebarRuntimePropsInput(
      assistantSidebarRuntimeInput,
    ),
  });

  const assistantSidebarController = useTranscriptionAssistantSidebarController({
    ...assistantSidebarControllerInput,
  });

  const workspacePanelEffectsController =
    useTranscriptionWorkspacePanelEffects(workspacePanelEffects);

  const {
    speakerActionScopeController,
    batchOperationController,
    speakerController,
    selfCertaintyController,
    updateLayerMetadata,
    trackEntityStateController: _trackEntityStateController,
    annotationController,
    timelineController,
    trackDisplayController,
  } = useReadyWorkspaceTrackEditControllers(trackEditControllers);

  return {
    assistantSidebarController,
    workspacePanelEffectsController,
    speakerActionScopeController,
    batchOperationController,
    speakerController,
    selfCertaintyController,
    updateLayerMetadata,
    annotationController,
    timelineController,
    trackDisplayController,
  };
}
