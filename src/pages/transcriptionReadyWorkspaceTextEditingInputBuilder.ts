import type { useReadyWorkspaceTextEditingController } from './useReadyWorkspaceTextEditingController';

type ReadyWorkspaceTextEditingControllerInput = Parameters<typeof useReadyWorkspaceTextEditingController>[0];

export type BuildReadyWorkspaceTextEditingControllerInput = {
  transcriptionLayers: ReadyWorkspaceTextEditingControllerInput['transcriptionLayers'];
  translationLayers: ReadyWorkspaceTextEditingControllerInput['translationLayers'];
  annotationInput: Omit<
    ReadyWorkspaceTextEditingControllerInput['annotationInput'],
    | 'speakerVisualByUnitId'
    | 'independentLayerIds'
    | 'orthographies'
    | 'resolveSelfCertaintyForUnit'
    | 'resolveSelfCertaintyAmbiguityForUnit'
  >;
  speakerVisualByUnitId?: ReadyWorkspaceTextEditingControllerInput['annotationInput']['speakerVisualByUnitId'];
  independentLayerIds?: ReadyWorkspaceTextEditingControllerInput['annotationInput']['independentLayerIds'];
  orthographies?: ReadyWorkspaceTextEditingControllerInput['annotationInput']['orthographies'];
  resolveSelfCertaintyForUnit?: ReadyWorkspaceTextEditingControllerInput['annotationInput']['resolveSelfCertaintyForUnit'];
  resolveSelfCertaintyAmbiguityForUnit?: ReadyWorkspaceTextEditingControllerInput['annotationInput']['resolveSelfCertaintyAmbiguityForUnit'];
  timelineInput: Omit<
    ReadyWorkspaceTextEditingControllerInput['timelineInput'],
    'transcriptionLayers'
  >;
};

export function buildReadyWorkspaceTextEditingControllerInput(
  input: BuildReadyWorkspaceTextEditingControllerInput,
): ReadyWorkspaceTextEditingControllerInput {
  return {
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    annotationInput: {
      ...input.annotationInput,
      ...(input.speakerVisualByUnitId !== undefined ? { speakerVisualByUnitId: input.speakerVisualByUnitId } : {}),
      ...(input.independentLayerIds !== undefined ? { independentLayerIds: input.independentLayerIds } : {}),
      ...(input.orthographies !== undefined ? { orthographies: input.orthographies } : {}),
      ...(input.resolveSelfCertaintyForUnit !== undefined
        ? { resolveSelfCertaintyForUnit: input.resolveSelfCertaintyForUnit }
        : {}),
      ...(input.resolveSelfCertaintyAmbiguityForUnit !== undefined
        ? { resolveSelfCertaintyAmbiguityForUnit: input.resolveSelfCertaintyAmbiguityForUnit }
        : {}),
    },
    timelineInput: {
      ...input.timelineInput,
      transcriptionLayers: input.transcriptionLayers,
    },
  };
}
