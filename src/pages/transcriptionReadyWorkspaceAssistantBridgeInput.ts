import type { DbState } from '../hooks/transcriptionTypes';
import type { UseTranscriptionAiControllerInput } from './transcriptionAiController.types';

export interface BuildReadyWorkspaceAssistantBridgeInput
  extends Omit<UseTranscriptionAiControllerInput, 'translationLayerCount' | 'authoritativeUnitCount'> {
  state: DbState;
}

/**
 * ReadyWorkspace AI 桥接输入构造器 | Keep AI bridge input assembly out of the page JSX.
 */
export function buildReadyWorkspaceAssistantBridgeInput(
  input: BuildReadyWorkspaceAssistantBridgeInput,
): UseTranscriptionAiControllerInput {
  const { state, ...rest } = input;
  return {
    ...rest,
    translationLayerCount: rest.translationLayers.length,
    ...(state.phase === 'ready'
      ? { authoritativeUnitCount: state.unifiedUnitCount ?? state.unitCount }
      : {}),
  };
}
