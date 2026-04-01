// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import { FeatureAvailabilityPanel } from './FeatureAvailabilityPanel';

const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function SidePaneSnapshot() {
  const registration = useAppSidePaneRegistrationSnapshot();

  return (
    <>
      <div data-testid="side-pane-title">{registration?.title ?? ''}</div>
      <div data-testid="side-pane-subtitle">{registration?.subtitle ?? ''}</div>
      <div data-testid="side-pane-content">{registration?.content ?? null}</div>
    </>
  );
}

describe('FeatureAvailabilityPanel', () => {
  it('registers planned-workbench summary into the app side pane host', () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <FeatureAvailabilityPanel
              title="标注工作台未开放"
              summary="标注能力仍在收口阶段。"
              sidePaneTitle="标注工作台"
              sidePaneSubtitle="标注能力现状与规划覆盖范围"
              scope={['词切分与 token 级编辑', 'gloss 词库联动与批量修订']}
            />
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('side-pane-title').textContent).toBe('标注工作台');
    expect(screen.getByTestId('side-pane-subtitle').textContent).toBe('标注能力现状与规划覆盖范围');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('规划中');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('标注能力仍在收口阶段。');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('词切分与 token 级编辑');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('返回当前可用工作台');
  });
});
