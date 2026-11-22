/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOralNavigationGuard } from './oralNavigationGuard';

function Screen(props: { holding: boolean; leave: (go: () => void, cancel?: () => void) => void }) {
  useOralNavigationGuard(props.holding, props.leave);
  return <p>here</p>;
}

afterEach(() => {
  cleanup();
});

describe('oral navigation guard', () => {
  it('asks before a route change and before the window closes', async () => {
    const leave = vi.fn();
    const router = createMemoryRouter(
      [
        { path: '/', element: <Screen holding leave={leave} /> },
        { path: '/away', element: <p>away</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    await act(async () => {
      await router.navigate('/away');
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not block when nothing is open', async () => {
    const leave = vi.fn();
    function Idle() {
      const [holding] = useState(false);
      useOralNavigationGuard(holding, leave);
      return <p>idle</p>;
    }
    const router = createMemoryRouter(
      [
        { path: '/', element: <Idle /> },
        { path: '/away', element: <p>away</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    await act(async () => {
      await router.navigate('/away');
    });
    expect(leave).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/away');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
