// @vitest-environment jsdom

import { useMemo, useState } from 'react';
import { cleanup, render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppSidePaneProvider,
  useAppSidePaneRegistrationSnapshot,
  useRegisterAppSidePane,
} from './AppSidePaneContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function HostSnapshot() {
  const registration = useAppSidePaneRegistrationSnapshot();

  return (
    <>
      <div data-testid="title">{registration?.title ?? ''}</div>
      <div data-testid="subtitle">{registration?.subtitle ?? ''}</div>
      <div data-testid="content">{registration?.content ?? null}</div>
    </>
  );
}

function SidePaneProbe({ label }: { label: string }) {
  useRegisterAppSidePane({
    title: '测试面板',
    subtitle: '注册内容同步到壳层',
    content: <span>{label}</span>,
  });

  return null;
}

function StableSidePaneProbe() {
  const [tick, setTick] = useState(0);
  const content = useMemo(() => <span>稳定内容</span>, []);

  useRegisterAppSidePane({
    title: '稳定面板',
    subtitle: '无关重渲染不应重复广播',
    content,
  });

  return (
    <button type="button" onClick={() => setTick((prev) => prev + 1)}>
      重渲染 {tick}
    </button>
  );
}

function HostSnapshotWithRenderCount({ onRender }: { onRender: () => void }) {
  onRender();
  return <HostSnapshot />;
}

describe('AppSidePaneContext', () => {
  it('registers and clears side pane content through the shell host', async () => {
    const { rerender } = render(
      <AppSidePaneProvider>
        <HostSnapshot />
        <SidePaneProbe label="首屏内容" />
      </AppSidePaneProvider>,
    );

    // 首次挂载使用同步通知，立即可见 | First mount uses sync notification
    expect(screen.getByTestId('title').textContent).toBe('测试面板');
    expect(screen.getByTestId('subtitle').textContent).toBe('注册内容同步到壳层');
    expect(screen.getByTestId('content').textContent).toContain('首屏内容');

    rerender(
      <AppSidePaneProvider>
        <HostSnapshot />
        <SidePaneProbe label="更新后的内容" />
      </AppSidePaneProvider>,
    );

    // Content-only identity changes are stored silently (no shell notify) to avoid
    // update-depth storms from unstable ReactNode trees. Host still shows mount content.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByTestId('content').textContent).toContain('首屏内容');

    rerender(
      <AppSidePaneProvider>
        <HostSnapshot />
        {null}
      </AppSidePaneProvider>,
    );

    // 卸载使用同步通知，立即清空 | Unmount uses sync notification
    expect(screen.getByTestId('title').textContent).toBe('');
    expect(screen.getByTestId('subtitle').textContent).toBe('');
    expect(screen.getByTestId('content').textContent).toBe('');
  });

  it('does not re-notify snapshot subscribers on unrelated producer rerenders when payload is stable', async () => {
    const onHostRender = vi.fn();

    render(
      <AppSidePaneProvider>
        <HostSnapshotWithRenderCount onRender={onHostRender} />
        <StableSidePaneProbe />
      </AppSidePaneProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('稳定面板');
    });

    const renderCountAfterMount = onHostRender.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: '重渲染 0' }).click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByRole('button', { name: '重渲染 1' })).toBeTruthy();
    expect(onHostRender.mock.calls.length).toBe(renderCountAfterMount);
  });

  it('does not notify-loop when producer passes fresh elements with new callback identities', async () => {
    const onHostRender = vi.fn();

    function UnstableCallbackProbe() {
      const [tick, setTick] = useState(0);
      useRegisterAppSidePane({
        title: '回调面板',
        subtitle: 'callback identity churn',
        // Fresh element + fresh onClick each render; visible props stay stable.
        content: (
          <div>
            <span>payload</span>
            <button type="button" onClick={() => undefined}>
              noop
            </button>
          </div>
        ),
      });
      return (
        <button type="button" onClick={() => setTick((prev) => prev + 1)}>
          bump {tick}
        </button>
      );
    }

    render(
      <AppSidePaneProvider>
        <HostSnapshotWithRenderCount onRender={onHostRender} />
        <UnstableCallbackProbe />
      </AppSidePaneProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('回调面板');
    });

    const renderCountAfterMount = onHostRender.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: /^bump / }).click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      screen.getByRole('button', { name: /^bump / }).click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByRole('button', { name: 'bump 2' })).toBeTruthy();
    expect(onHostRender.mock.calls.length).toBe(renderCountAfterMount);
  });
});
