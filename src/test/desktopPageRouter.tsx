import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { connectDesktopInvalidation } from '../desktop/desktopQueryKeys';

const disconnects: (() => void)[] = [];

/**
 * Mounts desktop pages the way `main.tsx` does: a data router (for `useBlocker`), a fresh QueryClient, and the
 * desktop invalidation table. Call `resetDesktopPageRouters` in `afterEach`.
 */
export function DesktopPageRouter(props: { initialEntries?: string[]; children: ReactNode }) {
  const [router] = useState(() => {
    const queryClient = new QueryClient();
    disconnects.push(connectDesktopInvalidation(queryClient), () => queryClient.clear());
    return createMemoryRouter(
      [
        {
          path: '*',
          element: <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>,
        },
      ],
      { initialEntries: props.initialEntries ?? ['/'] },
    );
  });
  return <RouterProvider router={router} />;
}

export function resetDesktopPageRouters(): void {
  while (disconnects.length > 0) disconnects.pop()?.();
}
