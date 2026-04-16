import { buildOrchestratorViewModelsInput, type TranscriptionReadyWorkspaceOrchestratorRawInput } from './transcriptionReadyWorkspaceOrchestratorInput';
import { buildSharedLaneProps, type BuildSharedLanePropsInput } from './transcriptionReadyWorkspacePropsBuilders';
import { useOrchestratorViewModels } from './useOrchestratorViewModels';

export interface UseReadyWorkspaceViewModelsInput {
  lanePropsInput: BuildSharedLanePropsInput;
  orchestratorRawInput: Omit<TranscriptionReadyWorkspaceOrchestratorRawInput, 'sharedLaneProps'>;
}

/**
 * ReadyWorkspace 视图模型桥接层 | Bridge the heavy workspace runtime into orchestrator view-model props.
 */
export function useReadyWorkspaceViewModels(
  input: UseReadyWorkspaceViewModelsInput,
) {
  const sharedLaneProps = buildSharedLaneProps(input.lanePropsInput);
  const orchestratorViewModelsInput = buildOrchestratorViewModelsInput({
    ...input.orchestratorRawInput,
    sharedLaneProps,
  });
  return useOrchestratorViewModels(orchestratorViewModelsInput);
}
