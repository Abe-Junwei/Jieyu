import type { BuildReadyWorkspaceOverlaysPropsInput } from './transcriptionReadyWorkspacePropsBuilders';

type SkipProcessingCandidateUnit = {
  id: string;
  layerId?: string;
  kind: string;
  tags?: { skipProcessing?: boolean };
};

export type BuildReadyWorkspaceOverlaysPropsInputFromControllers = Omit<
  BuildReadyWorkspaceOverlaysPropsInput,
  | 'onCloseCtxMenu'
  | 'onCloseUttOpsMenu'
  | 'onCloseNotePopover'
  | 'onToggleSkipProcessingFromMenu'
  | 'resolveSkipProcessingState'
> & {
  setCtxMenu: (next: null) => void;
  setUttOpsMenu: (next: null) => void;
  timelineUnitsOnCurrentMedia: readonly SkipProcessingCandidateUnit[];
  toggleSkipProcessingRouted: (unitId: string, layerId?: string) => Promise<void>;
};

export function buildReadyWorkspaceOverlaysPropsInput(
  input: BuildReadyWorkspaceOverlaysPropsInputFromControllers,
): BuildReadyWorkspaceOverlaysPropsInput {
  return {
    ...input,
    onCloseCtxMenu: () => input.setCtxMenu(null),
    onCloseUttOpsMenu: () => input.setUttOpsMenu(null),
    onCloseNotePopover: () => input.setNotePopover(null),
    onToggleSkipProcessingFromMenu: (unitId, kind, layerId) => {
      if (kind !== 'segment') return;
      void input.toggleSkipProcessingRouted(unitId, layerId);
    },
    resolveSkipProcessingState: (unitId, layerId, kind) => (
      input.timelineUnitsOnCurrentMedia.some((unit) => (
        unit.id === unitId
        && unit.layerId === layerId
        && unit.kind === kind
        && unit.tags?.skipProcessing === true
      ))
    ),
  };
}
