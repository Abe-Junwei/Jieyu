/**
 * TranscriptionPage - Ready Workspace (thin body / chunk export surface)
 *
 * Chunk CSS entry stays on `TranscriptionPage.ReadyWorkspace.tsx`.
 * 重编排运行时见 `TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` | Heavy wiring: {@link TranscriptionPageReadyWorkspaceOrchestrator}.
 */

import { preserveReadyWorkspaceStructureMarkers } from './TranscriptionPage.ReadyWorkspace.structureMarkers';
import {
  TranscriptionPageReadyWorkspaceOrchestrator,
  type TranscriptionPageReadyWorkspaceProps,
} from './TranscriptionPage.ReadyWorkspaceOrchestrator';

void preserveReadyWorkspaceStructureMarkers;

export type { TranscriptionPageReadyWorkspaceProps };

export function TranscriptionPageReadyWorkspace(props: TranscriptionPageReadyWorkspaceProps) {
  return <TranscriptionPageReadyWorkspaceOrchestrator {...props} />;
}
