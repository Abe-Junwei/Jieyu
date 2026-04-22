import type { TranscriptionReadyWorkspaceOrchestratorRawInput } from './transcriptionReadyWorkspaceOrchestratorInput';

type Raw = Omit<TranscriptionReadyWorkspaceOrchestratorRawInput, 'sharedLaneProps'>;

/**
 * 将编排原始入参拆块后再合并，便于 ReadyWorkspace 壳层保持较短的 `orchestratorRawInput` 调用点。
 */
export function mergeReadyWorkspaceOrchestratorRawInputSlices(
  mediaAndViewport: Pick<
    Raw,
    | 'selectedMediaUrl'
    | 'playableAcoustic'
    | 'timelineExtentSec'
    | 'player'
    | 'layers'
    | 'locale'
    | 'importFileRef'
    | 'layerAction'
    | 'timelineViewportProjection'
  >,
  gesture: Pick<Raw, 'segmentRangeGesturePreviewReadModel'>,
  remainder: Omit<
    Raw,
    | 'selectedMediaUrl'
    | 'playableAcoustic'
    | 'timelineExtentSec'
    | 'player'
    | 'layers'
    | 'locale'
    | 'importFileRef'
    | 'layerAction'
    | 'timelineViewportProjection'
    | 'segmentRangeGesturePreviewReadModel'
  >,
): Raw {
  return { ...mediaAndViewport, ...gesture, ...remainder };
}
