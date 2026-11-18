// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopTextDraft, TextSaveResult } from './desktopTextDraft';
import { useDesktopDraftGuard } from './useDesktopDraftGuard';

afterEach(cleanup);

type Guard = ReturnType<typeof useDesktopDraftGuard>;

function mount(
  save: (draft: DesktopTextDraft, operationId: string) => Promise<boolean | TextSaveResult>,
  store?: Parameters<typeof useDesktopDraftGuard>[1],
) {
  const seen: { guard: Guard | null; navigate: ((to: string) => void) | null } = {
    guard: null,
    navigate: null,
  };
  function Editor() {
    seen.guard = useDesktopDraftGuard(save, store);
    const navigate = useNavigate();
    seen.navigate = (to) => void navigate(to);
    return <div>editor</div>;
  }
  const router = createMemoryRouter(
    [
      { path: '/edit', element: <Editor /> },
      { path: '/other', element: <div>other</div> },
    ],
    { initialEntries: ['/edit'] },
  );
  render(<RouterProvider router={router} />);
  const guard = () => {
    if (seen.guard === null) throw new Error('not mounted');
    return seen.guard;
  };
  return { guard, navigate: (to: string) => act(() => seen.navigate?.(to)), router };
}

const AUTOSAVE_MS = 500;

function deferredSave() {
  const resolvers: Array<(result: boolean | TextSaveResult) => void> = [];
  const saved: Array<{ text: string; operationId: string }> = [];
  const save = (draft: DesktopTextDraft, operationId: string) => {
    saved.push({ text: draft.text, operationId });
    return new Promise<boolean | TextSaveResult>((resolve) => {
      resolvers.push(resolve);
    });
  };
  return { resolvers, saved, save };
}

async function settleAutosave(resolvers: unknown[]) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  });
  expect(resolvers).toHaveLength(1);
}

async function trackClose(view: ReturnType<typeof mount>) {
  const close: { finished: boolean; result: string } = { finished: false, result: '' };
  act(() => {
    void view
      .guard()
      .flushForClose()
      .then((value) => {
        close.result = value;
        close.finished = true;
      });
  });
  await act(async () => {
    await Promise.resolve();
  });
  return close;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useDesktopDraftGuard', () => {
  it('lets a route change through when nothing is unsaved', async () => {
    const view = mount(() => Promise.resolve(true));
    view.navigate('/other');
    expect(await screen.findByText('other')).toBeTruthy();
  });

  it('saves a submittable draft, then proceeds', async () => {
    const saved: DesktopTextDraft[] = [];
    const view = mount((draft) => {
      saved.push(draft);
      return Promise.resolve(true);
    });
    act(() => view.guard().edit('u1', '新', '旧'));
    view.navigate('/other');
    expect(await screen.findByText('other')).toBeTruthy();
    expect(saved).toEqual([{ unitId: 'u1', text: '新' }]);
  });

  it('blocks on a failed save until retry succeeds', async () => {
    let ok = false;
    const view = mount(() => Promise.resolve(ok));
    act(() => view.guard().edit('u1', '新', '旧'));
    view.navigate('/other');
    await waitFor(() => expect(view.guard().prompt).toEqual({ failed: true }));
    expect(view.router.state.location.pathname).toBe('/edit');
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
    ok = true;
    act(() => view.guard().retry());
    expect(await screen.findByText('other')).toBeTruthy();
  });

  it('stays put and keeps the draft when the user chooses to stay', async () => {
    const view = mount(() => Promise.resolve(false));
    act(() => view.guard().edit('u1', '新', '旧'));
    view.navigate('/other');
    await waitFor(() => expect(view.guard().prompt).not.toBeNull());
    act(() => view.guard().stay());
    expect(view.router.state.location.pathname).toBe('/edit');
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
    expect(view.guard().prompt).toBeNull();
  });

  it('discards only on an explicit choice', async () => {
    const view = mount(() => Promise.resolve(false));
    act(() => view.guard().edit('u1', '新', '旧'));
    view.navigate('/other');
    await waitFor(() => expect(view.guard().prompt).not.toBeNull());
    await act(() => view.guard().discard());
    expect(await screen.findByText('other')).toBeTruthy();
  });

  it('does not save during an IME composition and asks instead', async () => {
    const saved: DesktopTextDraft[] = [];
    const view = mount((draft) => {
      saved.push(draft);
      return Promise.resolve(true);
    });
    act(() => {
      view.guard().setComposing(true);
      view.guard().edit('u1', 'ni', '旧');
    });
    expect(await act(() => view.guard().commit())).toBe(false);
    view.navigate('/other');
    await waitFor(() => expect(view.guard().prompt).toEqual({ failed: false }));
    expect(saved).toEqual([]);
  });

  it('retries leave instead of navigating when the user edits during a deferred save', async () => {
    const resolvers: Array<(ok: boolean) => void> = [];
    const saved: DesktopTextDraft[] = [];
    const view = mount((draft) => {
      saved.push(draft);
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    });
    act(() => view.guard().edit('u1', '第一次', '旧'));
    let navigated = false;
    act(() => {
      view.guard().leave(() => {
        navigated = true;
      });
    });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    act(() => view.guard().edit('u1', '第二次', '旧'));
    await act(async () => {
      resolvers[0]?.(true);
    });
    expect(navigated).toBe(false);
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: '第二次' });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(saved).toEqual([
      { unitId: 'u1', text: '第一次' },
      { unitId: 'u1', text: '第二次' },
    ]);
    await act(async () => {
      resolvers[1]?.(true);
    });
    await waitFor(() => expect(navigated).toBe(true));
    expect(view.guard().draft).toBeNull();
  });

  it('keeps one operation id until that text is sent, then mints another', async () => {
    const ids: string[] = [];
    const resolvers: Array<(ok: boolean) => void> = [];
    const view = mount((draft, operationId) => {
      ids.push(`${draft.text}:${operationId}`);
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    });
    act(() => {
      view.guard().edit('u1', '一', '旧');
      view.guard().edit('u1', '一二', '旧');
      void view.guard().commit();
    });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    const first = ids[0]?.split(':')[1];
    expect(ids.map((item) => item.split(':')[0])).toEqual(['一二']);
    act(() => view.guard().edit('u1', '一二三', '旧'));
    await act(async () => {
      resolvers[0]?.(true);
    });
    act(() => {
      void view.guard().commit();
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(ids[1]?.split(':')[0]).toBe('一二三');
    expect(ids[1]?.split(':')[1]).not.toBe(first);
  });

  it('saves 500ms after the last keystroke, and by 5s while typing continues', async () => {
    vi.useFakeTimers();
    try {
      const saved: string[] = [];
      const view = mount((draft) => {
        saved.push(draft.text);
        return Promise.resolve(true);
      });
      act(() => view.guard().edit('u1', '一', '旧'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(saved).toEqual(['一']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reset the 5s cap when typing continues', async () => {
    vi.useFakeTimers();
    try {
      const saved: string[] = [];
      const view = mount((draft) => {
        saved.push(draft.text);
        return Promise.resolve(true);
      });
      act(() => view.guard().edit('u1', '一', '旧'));
      for (let step = 0; step < 12; step += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(400);
        });
        act(() => view.guard().edit('u1', '一二', '旧'));
        expect(saved).toEqual([]);
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(saved).toEqual(['一二']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not write again after the list fails to refresh, and leaving continues', async () => {
    const saved: string[] = [];
    const view = mount(() => {
      saved.push('write');
      return Promise.resolve('refresh-failed');
    });
    act(() => view.guard().edit('u1', '新', '旧'));
    expect(await act(() => view.guard().commit())).toBe(true);
    expect(await act(() => view.guard().commit())).toBe(false);
    expect(saved).toEqual(['write']);
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
    let navigated = false;
    act(() => {
      view.guard().leave(() => {
        navigated = true;
      });
    });
    expect(navigated).toBe(true);
    expect(saved).toEqual(['write']);
  });

  it('writes the restored baseline after the in-flight text commits', async () => {
    const saved: string[] = [];
    const resolvers: Array<(ok: boolean) => void> = [];
    const view = mount((draft) => {
      saved.push(draft.text);
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    });
    act(() => view.guard().edit('u1', 'A', 'O'));
    act(() => {
      void view.guard().commit();
    });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    act(() => view.guard().edit('u1', 'O', 'O'));
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: 'O' });
    await act(async () => {
      resolvers[0]?.(true);
    });
    await waitFor(() => expect(saved).toEqual(['A', 'O']));
    await act(async () => {
      resolvers[1]?.(true);
    });
    await waitFor(() => expect(view.guard().draft).toBeNull());
  });

  it('reports the window saved only after the newest text is written', async () => {
    const saved: string[] = [];
    const resolvers: Array<(ok: boolean) => void> = [];
    const view = mount((draft) => {
      saved.push(draft.text);
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    });
    act(() => view.guard().edit('u1', 'A', 'O'));
    let result = '';
    let finished = false;
    act(() => {
      void view
        .guard()
        .flushForClose()
        .then((value) => {
          result = value;
          finished = true;
        });
    });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    act(() => view.guard().edit('u1', 'B', 'O'));
    await act(async () => {
      resolvers[0]?.(true);
    });
    expect(finished).toBe(false);
    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(saved.map((item) => item)).toEqual(['A', 'B']);
    await act(async () => {
      resolvers[1]?.(true);
    });
    await waitFor(() => expect(finished).toBe(true));
    expect(result).toBe('saved');
  });

  it('mints a new operation id when the text changes after a failed save', async () => {
    const ids: string[] = [];
    let fail = true;
    const view = mount((draft, operationId) => {
      ids.push(`${draft.text}:${operationId}`);
      if (fail) return Promise.resolve(false);
      return Promise.resolve(true);
    });
    act(() => view.guard().edit('u1', 'A', 'O'));
    await act(() => view.guard().commit());
    fail = false;
    act(() => view.guard().edit('u1', 'B', 'O'));
    await act(() => view.guard().commit());
    expect(ids.map((item) => item.split(':')[0])).toEqual(['A', 'B']);
    expect(ids[0]?.split(':')[1]).not.toBe(ids[1]?.split(':')[1]);
  });

  it('keeps unknown writes isolated from newer input and refuses discard', async () => {
    const calls: string[] = [];
    const view = mount((draft) => {
      calls.push(draft.text);
      return Promise.resolve('unknown');
    });
    act(() => view.guard().edit('u1', 'A', 'O'));
    await act(() => view.guard().commit());
    act(() => view.guard().edit('u1', 'O', 'O'));
    await act(() => view.guard().commit());
    await act(() => view.guard().discard());
    expect(calls).toEqual(['A']);
    expect(view.guard().draft?.text).toBe('O');
    expect(await act(() => view.guard().flushForClose())).toBe('unknown');
  });

  for (const inspection of ['committed', 'not-submitted'] as const) {
    it(`resolves unknown as ${inspection} before saving the newest input`, async () => {
      const writes: string[] = [];
      const view = mount(
        (draft) => {
          writes.push(draft.text);
          return Promise.resolve(writes.length === 1 ? 'unknown' : 'saved');
        },
        {
          persist: () => Promise.resolve(),
          discard: () => Promise.resolve(),
          inspect: () => Promise.resolve(inspection),
        },
      );
      act(() => view.guard().edit('u1', 'A', 'O'));
      await act(() => view.guard().commit());
      act(() => view.guard().edit('u1', 'B', 'O'));
      expect(await act(() => view.guard().flushForClose())).toBe('saved');
      expect(writes).toEqual(['A', 'B']);
      expect(view.guard().draft).toBeNull();
    });
  }

  it('inspects an unknown write before allowing an empty draft to be discarded', async () => {
    const writes: string[] = [];
    const view = mount(
      (draft) => {
        writes.push(draft.text);
        return Promise.resolve('unknown');
      },
      {
        persist: () => Promise.resolve(),
        discard: () => Promise.resolve(),
        inspect: () => Promise.resolve('committed'),
      },
    );
    act(() => view.guard().edit('u1', 'A', 'O'));
    await act(() => view.guard().commit());
    act(() => view.guard().edit('u1', '', 'O'));
    expect(await act(() => view.guard().flushForClose())).toBe('blocked');
    expect(writes).toEqual(['A']);
    expect(await act(() => view.guard().discard())).toBe(true);
    expect(view.guard().draft).toBeNull();
  });

  it('reports a failed close flush and keeps the draft', async () => {
    const view = mount(() => Promise.resolve(false));
    act(() => view.guard().edit('u1', '新', '旧'));
    expect(await act(() => view.guard().flushForClose())).toBe('failed');
    expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it('waits out a successful autosave before reporting the window saved', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const persisted: string[] = [];
      const discarded: string[] = [];
      const view = mount(pending.save, {
        persist: (row) => {
          persisted.push(`${row.unitId}:${row.rawInput}`);
          return Promise.resolve();
        },
        discard: (unitId) => {
          discarded.push(unitId);
          return Promise.resolve();
        },
      });
      act(() => view.guard().edit('u1', '新', '旧'));
      await settleAutosave(pending.resolvers);
      const close = await trackClose(view);
      expect(close.finished).toBe(false);
      expect(pending.saved.map((item) => item.text)).toEqual(['新']);
      await act(async () => {
        pending.resolvers[0]?.(true);
      });
      expect(close.finished).toBe(true);
      expect(close.result).toBe('saved');
      expect(view.guard().draft).toBeNull();
      expect(pending.saved).toHaveLength(1);
      expect(persisted).toContain('u1:新');
      expect(discarded).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a real autosave failure only after that write settles', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', '新', '旧'));
      await settleAutosave(pending.resolvers);
      const close = await trackClose(view);
      expect(close.finished).toBe(false);
      await act(async () => {
        pending.resolvers[0]?.(false);
      });
      expect(close.finished).toBe(true);
      expect(close.result).toBe('failed');
      expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
      expect(pending.saved).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves only after an in-flight autosave succeeds', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', '新', '旧'));
      await settleAutosave(pending.resolvers);
      let navigated = false;
      act(() => {
        view.guard().leave(() => {
          navigated = true;
        });
      });
      await flushMicrotasks();
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toBeNull();
      await act(async () => {
        pending.resolvers[0]?.(true);
      });
      expect(navigated).toBe(true);
      expect(view.guard().prompt).toBeNull();
      expect(view.guard().draft).toBeNull();
      expect(pending.saved.map((item) => item.text)).toEqual(['新']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the leave failure only after an in-flight autosave fails', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', '新', '旧'));
      await settleAutosave(pending.resolvers);
      let navigated = false;
      act(() => {
        view.guard().leave(() => {
          navigated = true;
        });
      });
      await flushMicrotasks();
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toBeNull();
      await act(async () => {
        pending.resolvers[0]?.(false);
      });
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toEqual({ failed: true });
      expect(view.router.state.location.pathname).toBe('/edit');
      expect(view.guard().draft).toEqual({ unitId: 'u1', text: '新' });
      expect(pending.saved).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves the newer text before leaving an in-flight autosave', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', 'A', 'O'));
      await settleAutosave(pending.resolvers);
      let navigated = false;
      act(() => {
        view.guard().leave(() => {
          navigated = true;
        });
      });
      act(() => view.guard().edit('u1', 'B', 'O'));
      await flushMicrotasks();
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toBeNull();
      await act(async () => {
        pending.resolvers[0]?.(true);
      });
      expect(navigated).toBe(false);
      expect(pending.saved.map((item) => item.text)).toEqual(['A', 'B']);
      expect(pending.saved[0]?.operationId).not.toBe(pending.saved[1]?.operationId);
      await act(async () => {
        pending.resolvers[1]?.(true);
      });
      expect(navigated).toBe(true);
      expect(view.guard().prompt).toBeNull();
      expect(view.guard().draft).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a failed in-flight autosave as saved when the user keeps typing', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', 'A', 'O'));
      await settleAutosave(pending.resolvers);
      let navigated = false;
      act(() => {
        view.guard().leave(() => {
          navigated = true;
        });
      });
      act(() => view.guard().edit('u1', 'B', 'O'));
      await act(async () => {
        pending.resolvers[0]?.(false);
      });
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toEqual({ failed: true });
      expect(view.router.state.location.pathname).toBe('/edit');
      expect(pending.saved.map((item) => item.text)).toEqual(['A']);
      expect(view.guard().draft).toEqual({ unitId: 'u1', text: 'B' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes as saved only after the text typed during an autosave is written', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', 'A', 'O'));
      await settleAutosave(pending.resolvers);
      act(() => view.guard().edit('u1', 'B', 'O'));
      const close = await trackClose(view);
      expect(close.finished).toBe(false);
      await act(async () => {
        pending.resolvers[0]?.(true);
      });
      expect(close.finished).toBe(false);
      expect(pending.saved.map((item) => item.text)).toEqual(['A', 'B']);
      expect(pending.saved[0]?.operationId).not.toBe(pending.saved[1]?.operationId);
      await act(async () => {
        pending.resolvers[1]?.(true);
      });
      expect(close.finished).toBe(true);
      expect(close.result).toBe('saved');
      expect(view.guard().draft).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for an in-flight autosave that is still unknown', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', 'A', 'O'));
      await settleAutosave(pending.resolvers);
      const close = await trackClose(view);
      expect(close.finished).toBe(false);
      let navigated = false;
      act(() => {
        view.guard().leave(() => {
          navigated = true;
        });
      });
      await act(async () => {
        pending.resolvers[0]?.('unknown');
      });
      expect(close.finished).toBe(true);
      expect(close.result).toBe('unknown');
      expect(navigated).toBe(false);
      expect(view.guard().prompt).toEqual({ failed: true });
      expect(view.guard().unknown).toBe(true);
      expect(await act(() => view.guard().discard())).toBe(false);
      expect(pending.saved.map((item) => item.text)).toEqual(['A']);
      expect(view.guard().draft).toEqual({ unitId: 'u1', text: 'A' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an in-flight refresh failure as saved without writing it again', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredSave();
      const view = mount(pending.save);
      act(() => view.guard().edit('u1', 'A', 'O'));
      await settleAutosave(pending.resolvers);
      const close = await trackClose(view);
      expect(close.finished).toBe(false);
      await act(async () => {
        pending.resolvers[0]?.('refresh-failed');
      });
      expect(close.finished).toBe(true);
      expect(close.result).toBe('saved');
      expect(view.guard().draft).toEqual({ unitId: 'u1', text: 'A' });
      expect(pending.saved).toHaveLength(1);
      expect(await act(() => view.guard().flushForClose())).toBe('saved');
      expect(pending.saved).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels beforeunload only while a draft is unsaved', () => {
    const view = mount(() => Promise.resolve(true));
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    act(() => view.guard().edit('u1', '新', '旧'));
    expect(unload()).toBe(true);
    act(() => view.guard().edit('u1', '旧', '旧'));
    expect(unload()).toBe(false);
  });
});
