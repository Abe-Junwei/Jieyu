// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { activeId, clearActive } = vi.hoisted(() => ({
  activeId: { current: 'p1' },
  clearActive: vi.fn(),
}));

vi.mock('../utils/transcriptionUrlDeepLink', () => ({
  getActiveProjectTextId: () => activeId.current,
  clearActiveProjectTextId: clearActive,
}));

import {
  broadcastCollaborationLifecycle,
  resetCollaborationLifecycleBroadcastForTests,
} from '../collaboration/cloud/collaborationLifecycleBroadcast';
import { APP_GLOBAL_TOAST_EVENT, type AppGlobalToastDetail } from '../utils/appGlobalToast';
import { CollaborationLifecycleNotices } from './CollaborationLifecycleNotices';

let toasts: AppGlobalToastDetail[];
const onToast = (event: Event) => toasts.push((event as CustomEvent<AppGlobalToastDetail>).detail);

beforeEach(() => {
  toasts = [];
  activeId.current = 'p1';
  clearActive.mockClear();
  resetCollaborationLifecycleBroadcastForTests();
  window.addEventListener(APP_GLOBAL_TOAST_EVENT, onToast);
});

afterEach(() => {
  window.removeEventListener(APP_GLOBAL_TOAST_EVENT, onToast);
});

describe('CollaborationLifecycleNotices (rev5 9.3)', () => {
  it('cloud deletion of the open project clears it and tells the user', () => {
    render(<CollaborationLifecycleNotices locale="zh-CN" />);
    broadcastCollaborationLifecycle('project-deleted-cloud', 'p1');
    expect(clearActive).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toContain('云端删除');
  });

  it('own-tab local removal and other projects are ignored', () => {
    render(<CollaborationLifecycleNotices locale="zh-CN" />);
    broadcastCollaborationLifecycle('project-removed-locally', 'p1');
    broadcastCollaborationLifecycle('project-deleted-cloud', 'other');
    expect(clearActive).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('a server rejection in this tab asks for a reload', () => {
    render(<CollaborationLifecycleNotices locale="en-US" />);
    broadcastCollaborationLifecycle('protocol-changed', 'p1');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ variant: 'error', autoDismissMs: 0 });
    expect(toasts[0]!.message).toMatch(/reload/i);
  });
});
