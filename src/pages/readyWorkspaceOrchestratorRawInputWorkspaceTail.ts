import type { TranscriptionReadyWorkspaceOrchestratorRawInput } from './transcriptionReadyWorkspaceOrchestratorInput';

type Raw = Omit<TranscriptionReadyWorkspaceOrchestratorRawInput, 'sharedLaneProps'>;

/**
 * 编排 raw 入参尾簇（波形偏好、历史、搜索、Hub、对话框等），从 ReadyWorkspace 主文件外提以降低行数热点。
 */
export function packOrchestratorRawWorkspaceTailCluster<K extends keyof Raw>(slice: Pick<Raw, K>): Pick<Raw, K> {
  return slice;
}
