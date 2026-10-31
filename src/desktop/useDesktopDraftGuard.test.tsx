// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useDesktopDraftGuard, type DesktopTextDraft } from './useDesktopDraftGuard';

afterEach(cleanup);

type Guard = ReturnType<typeof useDesktopDraftGuard>;

function mount(save: (draft: DesktopTextDraft) => Promise<boolean>) {
  const seen: { guard: Guard | null; navigate: ((to: string) => void) | null } = {
    guard: null,
    navigate: null,
  };
  function Editor() {
    seen.guard = useDesktopDraftGuard(save);
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
    act(() => view.guard().discard());
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
