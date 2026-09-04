/**
 * A13.2 / P4 — reload resume contract for pendingAgentLoopCheckpoint.
 * Four terminal-or-continue states; send-turn only auto-continues `running`.
 */

export type AgentLoopResumeState = 'done' | 'clarify' | 'error' | 'running';

export type AgentLoopResumeTaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface AgentLoopResumeContractInput {
  checkpoint?: { taskId?: string } | null;
  taskStatus?: AgentLoopResumeTaskStatus | null;
  taskResumable?: boolean;
  waitingClarify?: boolean;
  lastTurnError?: boolean;
}

export function resolveAgentLoopResumeState(
  input: AgentLoopResumeContractInput,
): AgentLoopResumeState {
  if (input.lastTurnError === true || input.taskStatus === 'failed') return 'error';
  if (input.waitingClarify === true) return 'clarify';
  const hasCheckpoint = Boolean(input.checkpoint);
  if (!hasCheckpoint) return 'done';
  if (input.taskStatus === 'done') return 'done';
  if (input.taskResumable === false) return 'done';
  return 'running';
}

export function shouldAutoContinueAgentLoop(state: AgentLoopResumeState): boolean {
  return state === 'running';
}
