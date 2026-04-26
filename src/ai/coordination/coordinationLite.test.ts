import { describe, expect, it } from 'vitest';
import { CoordinationLiteSession, resolveCoordinationParallelPolicy, validateCoordinationNotification } from './coordinationLite';

describe('validateCoordinationNotification', () => {
  it('accepts minimal valid notifications and trims required fields', () => {
    expect(validateCoordinationNotification({
      taskId: ' task-1 ',
      status: 'completed',
      summary: ' done ',
      phase: 'verification',
    })).toEqual({
      ok: true,
      notification: {
        taskId: 'task-1',
        status: 'completed',
        summary: 'done',
        phase: 'verification',
      },
    });
  });

  it('rejects invalid notifications with stable reasons', () => {
    expect(validateCoordinationNotification({ status: 'completed', summary: 'x' })).toEqual({ ok: false, reason: 'invalid-task-id' });
    expect(validateCoordinationNotification({ taskId: 't', status: 'done', summary: 'x' })).toEqual({ ok: false, reason: 'invalid-status' });
    expect(validateCoordinationNotification({ taskId: 't', status: 'completed', summary: '' })).toEqual({ ok: false, reason: 'invalid-summary' });
    expect(validateCoordinationNotification({ taskId: 't', status: 'completed', summary: 'x', phase: 'deploy' })).toEqual({ ok: false, reason: 'invalid-phase' });
  });
});

describe('resolveCoordinationParallelPolicy', () => {
  it('parallelizes readonly and verification work but serializes writes', () => {
    expect(resolveCoordinationParallelPolicy({ phase: 'research', includesWrite: false })).toEqual({
      canRunInParallel: true,
      reason: 'readonly-parallel',
    });
    expect(resolveCoordinationParallelPolicy({ phase: 'implementation', includesWrite: true })).toEqual({
      canRunInParallel: false,
      reason: 'write-serialized',
    });
    expect(resolveCoordinationParallelPolicy({ phase: 'verification', includesWrite: false })).toEqual({
      canRunInParallel: true,
      reason: 'verification-parallel',
    });
  });
});

describe('CoordinationLiteSession', () => {
  it('quarantines invalid notifications and clears pending tasks on session end', () => {
    const session = new CoordinationLiteSession();

    session.ingest({ taskId: 'research-1', status: 'running', summary: 'reading docs' });
    session.ingest({ taskId: 'verify-1', status: 'completed', summary: 'tests passed' });
    session.ingest({ taskId: '', status: 'running', summary: 'bad' });

    expect(session.listQuarantined()).toEqual([
      { raw: { taskId: '', status: 'running', summary: 'bad' }, reason: 'invalid-task-id' },
    ]);
    expect(session.endSession()).toEqual({
      residualTaskCount: 0,
      cancelledTaskIds: ['research-1'],
    });
  });
});
