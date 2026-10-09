// @vitest-environment jsdom
/**
 * 删除 / 仅从本机移除的确认流程（rev5 9.1）。
 * Prompt flow for delete vs remove-from-this-device (rev5 9.1).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ProjectHasUnsyncedChangesError,
  type ProjectRemovalPlan,
} from '../services/projectRemoval';
import { runProjectRemovalWithPrompts } from './projectRemovalFlow';

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    timeline: {
      getTextById: vi.fn(async () => ({ title: { zh: '', eng: 'Field notes' } })),
    },
    cleanup: {},
  },
}));

function plan(mode: ProjectRemovalPlan['mode'], pendingOutboundCount = 0): ProjectRemovalPlan {
  return {
    projectId: 'p1',
    mode,
    pendingOutboundCount,
    collaboration: {
      verdict: mode === 'delete' ? 'never-collaborated' : 'collaborated',
      evidence: [],
    },
  };
}

function service(p: ProjectRemovalPlan) {
  return {
    planDeleteProject: vi.fn(() => p),
    deleteProject: vi.fn(async () => p.mode),
  };
}

describe('runProjectRemovalWithPrompts', () => {
  it('never-collaborated project: deletes without extra prompts', async () => {
    const svc = service(plan('delete'));
    const prompts = {
      confirmRemoveLocally: vi.fn(() => true),
      confirmDiscardUnsynced: vi.fn(() => true),
    };
    await expect(runProjectRemovalWithPrompts(svc, 'p1', prompts)).resolves.toBe('delete');
    expect(prompts.confirmRemoveLocally).not.toHaveBeenCalled();
    expect(svc.deleteProject).toHaveBeenCalledWith('p1', {});
  });

  it('collaborated project: asks, passes the project name, can be cancelled', async () => {
    const svc = service(plan('remove-local'));
    await expect(
      runProjectRemovalWithPrompts(svc, 'p1', {
        confirmRemoveLocally: () => false,
        confirmDiscardUnsynced: () => true,
      }),
    ).resolves.toBe('cancelled');
    expect(svc.deleteProject).not.toHaveBeenCalled();

    await expect(
      runProjectRemovalWithPrompts(svc, 'p1', {
        confirmRemoveLocally: () => true,
        confirmDiscardUnsynced: () => true,
      }),
    ).resolves.toBe('remove-local');
    expect(svc.deleteProject).toHaveBeenCalledWith('p1', { projectName: 'Field notes' });
  });

  it('unsynced changes: cancel keeps the project, confirm discards', async () => {
    const svc = service(plan('remove-local', 2));
    const cancel = vi.fn(() => false);
    await expect(
      runProjectRemovalWithPrompts(svc, 'p1', {
        confirmRemoveLocally: () => true,
        confirmDiscardUnsynced: cancel,
      }),
    ).resolves.toBe('cancelled');
    expect(cancel).toHaveBeenCalledWith(2);
    expect(svc.deleteProject).not.toHaveBeenCalled();

    await runProjectRemovalWithPrompts(svc, 'p1', {
      confirmRemoveLocally: () => true,
      confirmDiscardUnsynced: () => true,
    });
    expect(svc.deleteProject).toHaveBeenCalledWith('p1', {
      projectName: 'Field notes',
      discardUnsyncedChanges: true,
    });
  });

  it('changes queued while the prompt was open are confirmed again', async () => {
    const svc = service(plan('remove-local'));
    svc.deleteProject
      .mockRejectedValueOnce(new ProjectHasUnsyncedChangesError('p1', 1))
      .mockResolvedValueOnce('remove-local');
    const confirmDiscard = vi.fn(() => true);
    await expect(
      runProjectRemovalWithPrompts(svc, 'p1', {
        confirmRemoveLocally: () => true,
        confirmDiscardUnsynced: confirmDiscard,
      }),
    ).resolves.toBe('remove-local');
    expect(confirmDiscard).toHaveBeenCalledWith(1);
    expect(svc.deleteProject).toHaveBeenLastCalledWith('p1', {
      projectName: 'Field notes',
      discardUnsyncedChanges: true,
    });
  });
});
