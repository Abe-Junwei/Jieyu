import { assembleReadyWorkspaceAssistantBridgeControllerInput } from './readyWorkspaceAssistantBridgeOrchestratorInputSlice';
import { joinAssistantBridgeOrchestratorSliceDeps } from './readyWorkspaceAssistantBridgeOrchestratorSliceDepsJoin';
import type { ReadyWorkspaceSurfaceOrchestratorLayeredFlatAssemblyInput } from './readyWorkspaceSurfaceOrchestratorLayeredFlatSlice';
import { buildReadyWorkspaceSurfaceOrchestratorLayeredFlatFromAssemblyInput } from './readyWorkspaceSurfaceOrchestratorLayeredFlatSlice';
import { buildReadyWorkspaceSurfaceOrchestratorNestedSliceInputs } from './readyWorkspaceSurfaceOrchestratorNestedSliceInputsBuilder';
import { buildReadyWorkspaceToolbarPropsWithCollaboration } from './readyWorkspaceToolbarCollaborationExtras';
import { buildReadyWorkspaceViewModelsInput } from './readyWorkspaceViewModelsInputBuilder';
import { useReadyWorkspaceAxisStatus } from './useReadyWorkspaceAxisStatus';
import { useReadyWorkspaceRenderController } from './useReadyWorkspaceRenderController';
import { useReadyWorkspaceSurfaceOrchestratorBundle } from './useReadyWorkspaceSurfaceOrchestratorBundle';
import { useReadyWorkspaceViewModels } from './useReadyWorkspaceViewModels';

type ViewModelsAndSurfacePhaseReturn = ReturnType<
  typeof useReadyWorkspaceSurfaceOrchestratorBundle
>;

type LayeredFlatWithoutAssembled = Omit<
  ReadyWorkspaceSurfaceOrchestratorLayeredFlatAssemblyInput,
  | 'toolbarPropsWithCollaboration'
  | 'assistantBridgeControllerInput'
  | 'readyWorkspaceViewModels'
  | 'readyWorkspaceRenderController'
  | 'readyWorkspaceAxisStatusController'
>;

export interface UseReadyWorkspaceViewModelsAndSurfacePhaseParams {
  viewModels: Parameters<typeof buildReadyWorkspaceViewModelsInput>[0];
  toolbarCollaboration: Omit<
    Parameters<typeof buildReadyWorkspaceToolbarPropsWithCollaboration>[0],
    'toolbarProps'
  >;
  axisStatusWithoutTimelineTop: Omit<
    Parameters<typeof useReadyWorkspaceAxisStatus>[0],
    'timelineTopProps'
  >;
  renderController: Parameters<typeof useReadyWorkspaceRenderController>[0];
  assistantBridgeJoin: Parameters<typeof joinAssistantBridgeOrchestratorSliceDeps>[0];
  layeredFlatAssemblyWithoutAssembled: LayeredFlatWithoutAssembled;
  nestedOrchestratorSlices: Parameters<
    typeof buildReadyWorkspaceSurfaceOrchestratorNestedSliceInputs
  >[0];
}

/** L11：viewModels → toolbar → axis → render gate → assistant bridge → surface orchestrator bundle */
export function useReadyWorkspaceViewModelsAndSurfacePhase(
  params: UseReadyWorkspaceViewModelsAndSurfacePhaseParams,
): ViewModelsAndSurfacePhaseReturn {
  const {
    viewModels: viewModelsInput,
    toolbarCollaboration,
    axisStatusWithoutTimelineTop,
    renderController,
    assistantBridgeJoin,
    layeredFlatAssemblyWithoutAssembled,
    nestedOrchestratorSlices,
  } = params;

  const readyWorkspaceViewModels = useReadyWorkspaceViewModels(
    buildReadyWorkspaceViewModelsInput(viewModelsInput),
  );

  const toolbarPropsWithCollaboration = buildReadyWorkspaceToolbarPropsWithCollaboration({
    ...toolbarCollaboration,
    toolbarProps: readyWorkspaceViewModels.toolbarProps,
  });

  const readyWorkspaceAxisStatusController = useReadyWorkspaceAxisStatus({
    ...axisStatusWithoutTimelineTop,
    timelineTopProps: readyWorkspaceViewModels.timelineTopProps,
  });

  const readyWorkspaceRenderController = useReadyWorkspaceRenderController(renderController);

  const assistantBridgeControllerInput = assembleReadyWorkspaceAssistantBridgeControllerInput(
    joinAssistantBridgeOrchestratorSliceDeps(assistantBridgeJoin),
  );

  return useReadyWorkspaceSurfaceOrchestratorBundle({
    layeredFlat: buildReadyWorkspaceSurfaceOrchestratorLayeredFlatFromAssemblyInput({
      ...layeredFlatAssemblyWithoutAssembled,
      toolbarPropsWithCollaboration,
      assistantBridgeControllerInput,
      readyWorkspaceViewModels,
      readyWorkspaceRenderController,
      readyWorkspaceAxisStatusController,
    }),
    ...buildReadyWorkspaceSurfaceOrchestratorNestedSliceInputs(nestedOrchestratorSlices),
  });
}
