// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AppSidePaneProvider,
  useAppSidePaneRegistrationSnapshot,
  useRegisterAppSidePane,
} from './AppSidePaneContext';

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

describe('AppSidePaneContext', () => {
  it('registers and clears side pane content through the shell host', () => {
    const { rerender } = render(
      <AppSidePaneProvider>
        <HostSnapshot />
        <SidePaneProbe label="首屏内容" />
      </AppSidePaneProvider>,
    );

    expect(screen.getByTestId('title').textContent).toBe('测试面板');
    expect(screen.getByTestId('subtitle').textContent).toBe('注册内容同步到壳层');
    expect(screen.getByTestId('content').textContent).toContain('首屏内容');

    rerender(
      <AppSidePaneProvider>
        <HostSnapshot />
        <SidePaneProbe label="更新后的内容" />
      </AppSidePaneProvider>,
    );

    expect(screen.getByTestId('content').textContent).toContain('更新后的内容');

    rerender(
      <AppSidePaneProvider>
        <HostSnapshot />
        {null}
      </AppSidePaneProvider>,
    );

    expect(screen.getByTestId('title').textContent).toBe('');
    expect(screen.getByTestId('subtitle').textContent).toBe('');
    expect(screen.getByTestId('content').textContent).toBe('');
  });
});