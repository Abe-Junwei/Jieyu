// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionTimelineWorkspaceHost } from './TranscriptionTimelineWorkspaceHost';

vi.mock('../components/TranscriptionTimelineHorizontalMediaLanes', () => ({
  TranscriptionTimelineHorizontalMediaLanes: () => <div data-testid="workspace-host-waveform">waveform</div>,
}));

vi.mock('../components/TranscriptionTimelineTextOnly', () => ({
  TranscriptionTimelineTextOnly: (props: { acousticPending?: boolean }) => (
    <div data-testid="workspace-host-text-only" data-acoustic-pending={props.acousticPending ? '1' : '0'}>
      text-only
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

  it('renders text-only shell with acoustic pending flag', () => {
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

    const node = screen.getByTestId('workspace-host-text-only');
    expect(node.getAttribute('data-acoustic-pending')).toBe('1');
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
