// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionTimelineWorkspaceHost } from './TranscriptionTimelineWorkspaceHost';

vi.mock('../components/TranscriptionTimelineHorizontalMediaLanes', () => ({
  TranscriptionTimelineHorizontalMediaLanes: (props: { acousticShellPending?: boolean }) => (
    <div
      data-testid="workspace-host-waveform"
      data-acoustic-shell-pending={props.acousticShellPending ? '1' : '0'}
    >
      waveform
    </div>
  ),
}));

vi.mock('../components/TranscriptionTimelineVerticalView', () => ({
  TranscriptionTimelineVerticalView: () => <div data-testid="workspace-host-vertical">vertical</div>,
}));

vi.mock('./TranscriptionPage.TimelineEmptyState', () => ({
  TranscriptionPageTimelineEmptyState: () => <div data-testid="workspace-host-empty">empty</div>,
}));

describe('TranscriptionTimelineWorkspaceHost', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders waveform shell', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="waveform"
        acousticPending={false}
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform')).toBeTruthy();
  });

  it('routes text-only shell into unified host lanes', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="text-only"
        acousticPending={false}
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform')).toBeTruthy();
    expect(screen.getByTestId('workspace-host-waveform').getAttribute('data-acoustic-shell-pending')).toBe('0');
  });

  it('passes acousticShellPending when text-only shell and decode pending', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="text-only"
        acousticPending
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform').getAttribute('data-acoustic-shell-pending')).toBe('1');
  });

  it('renders empty shell fallback', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="empty"
        acousticPending={false}
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-empty')).toBeTruthy();
  });

  it('prefers vertical comparison view when enabled', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled
        shell="waveform"
        acousticPending={false}
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-vertical')).toBeTruthy();
    expect(screen.queryByTestId('workspace-host-waveform')).toBeNull();
  });
});
