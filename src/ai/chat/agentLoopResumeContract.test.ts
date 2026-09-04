import { describe, expect, it } from 'vitest';
import {
  resolveAgentLoopResumeState,
  shouldAutoContinueAgentLoop,
} from './agentLoopResumeContract';

describe('resolveAgentLoopResumeState', () => {
  it('maps failed task or last-turn error to error', () => {
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'failed',
      }),
    ).toBe('error');
    expect(resolveAgentLoopResumeState({ lastTurnError: true })).toBe('error');
  });

  it('maps waiting clarify ahead of a parked checkpoint', () => {
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'pending',
        waitingClarify: true,
      }),
    ).toBe('clarify');
  });

  it('maps missing checkpoint or completed task to done', () => {
    expect(resolveAgentLoopResumeState({})).toBe('done');
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'done',
      }),
    ).toBe('done');
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'pending',
        taskResumable: false,
      }),
    ).toBe('done');
  });

  it('maps parked resumable checkpoint to running', () => {
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'pending',
        taskResumable: true,
      }),
    ).toBe('running');
    expect(
      resolveAgentLoopResumeState({
        checkpoint: { taskId: 't1' },
        taskStatus: 'running',
      }),
    ).toBe('running');
  });

  it('only auto-continues running', () => {
    expect(shouldAutoContinueAgentLoop('running')).toBe(true);
    expect(shouldAutoContinueAgentLoop('done')).toBe(false);
    expect(shouldAutoContinueAgentLoop('clarify')).toBe(false);
    expect(shouldAutoContinueAgentLoop('error')).toBe(false);
  });
});
