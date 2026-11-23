/** @vitest-environment jsdom */
import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useDesktopProjectReadQueries } from './useDesktopProjectReadQueries';

afterEach(cleanup);

it('marks the previous layer as pending while a newly selected layer is still loading', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delay = false;
  const layers = [
    { id: 'a', tierType: 'time-aligned', contentType: 'transcription' },
    { id: 'b', tierType: 'time-aligned', contentType: 'transcription' },
  ];
  const host = {
    projectReadEnabled: true,
    desktopCall: async (_sessionId: string, method: string) => {
      if (method === 'manuscripts.list') return [{ id: 'm', mediaId: null }];
      if (method === 'layers.list') {
        if (delay) await pending;
        return layers;
      }
      if (method === 'layers.listLinks' || method === 'notes.list') return [];
      if (method === 'units.list') return [];
      if (method === 'project.get') return { title: { und: 'Story' } };
      throw new Error(`unexpected ${method}`);
    },
    desktopMediaUrl: async () => ({ url: '' }),
    chooseDesktopFolder: async () => ({ cancelled: true as const }),
  } as DesktopReadHost;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useDesktopProjectReadQueries(host, 'session', false, {
        manuscriptId: 'm',
        layerId: 'a',
      }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.model?.layerId).toBe('a'));
  delay = true;
  act(() => result.current.selectManuscript('m', 'b'));
  expect(result.current.model?.layerId).toBe('a');
  expect(result.current.selectionPending).toBe(true);
  release();
  await waitFor(() => expect(result.current.model?.layerId).toBe('b'));
  expect(result.current.selectionPending).toBe(false);
});
