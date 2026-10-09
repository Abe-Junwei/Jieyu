// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  let value: null | {
    dbName: string;
    projectId: string | null;
    bytes: number;
    maxBytes: number;
    staleCleared: boolean;
    at: number;
  } = null;
  const listeners = new Set<() => void>();
  return {
    set(next: typeof value) {
      value = next;
      for (const l of listeners) l();
    },
    get: () => value,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock('../services/SnapshotService', () => ({
  getRecoverySnapshotSkip: store.get,
  subscribeRecoverySnapshotSkip: store.subscribe,
  dismissRecoverySnapshotSkip: () => store.set(null),
}));

import { RecoverySnapshotSkippedNotice } from './RecoverySnapshotSkippedNotice';

afterEach(() => {
  cleanup();
  store.set(null);
});

describe('RecoverySnapshotSkippedNotice (T43)', () => {
  it('shows "skipped" with size and limit, mentions the cleared stale snapshot, and dismisses', () => {
    render(<RecoverySnapshotSkippedNotice locale="zh-CN" />);
    expect(screen.queryByTestId('recovery-snapshot-skipped')).toBeNull();

    act(() => {
      store.set({
        dbName: 'jieyu',
        projectId: 't1',
        bytes: 9.5 * 1024 * 1024,
        maxBytes: 8 * 1024 * 1024,
        staleCleared: true,
        at: Date.now(),
      });
    });
    const notice = screen.getByTestId('recovery-snapshot-skipped');
    expect(notice.textContent).toContain('已跳过');
    expect(notice.textContent).toContain('9.5');
    expect(notice.textContent).toContain('8 MiB');
    expect(notice.textContent).toContain('旧的恢复快照已清理');

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.queryByTestId('recovery-snapshot-skipped')).toBeNull();
  });
});
