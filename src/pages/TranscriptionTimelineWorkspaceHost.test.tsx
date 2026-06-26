// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionTimelineWorkspaceHost } from './TranscriptionTimelineWorkspaceHost';

vi.mock('../components/TranscriptionTimelineHorizontalMediaLanes', () => ({
  TranscriptionTimelineHorizontalMediaLanes: (props: {
    timelineChromeClassNames?: readonly string[];
  }) => (
    <div
      data-testid="workspace-host-waveform"
      data-chrome-classes={(props.timelineChromeClassNames ?? []).join(' ')}
    >
      waveform
    </div>
  ),
}));

vi.mock('../components/TranscriptionTimelineVerticalView', () => ({
  TranscriptionTimelineVerticalView: () => (
    <div data-testid="workspace-host-vertical">vertical</div>
  ),
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
        workspaceAcousticChromeState="playable"
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
        workspaceAcousticChromeState="no_media"
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform')).toBeTruthy();
    expect(screen.getByTestId('workspace-host-waveform').getAttribute('data-chrome-classes')).toBe(
      '',
    );
  });

  it('passes mapper chrome classes when text-only shell and global chrome is pending_decode', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="text-only"
        workspaceAcousticChromeState="pending_decode"
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform').getAttribute('data-chrome-classes')).toBe(
      'timeline-content-text-only timeline-content-acoustic-pending',
    );
  });

  it('text-only contract shell + global playable: no tier pending chrome', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="text-only"
        workspaceAcousticChromeState="playable"
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-waveform').getAttribute('data-chrome-classes')).toBe(
      '',
    );
  });

  it('renders empty shell fallback', () => {
    render(
      <TranscriptionTimelineWorkspaceHost
        verticalComparisonEnabled={false}
        shell="empty"
        workspaceAcousticChromeState="no_media"
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
        workspaceAcousticChromeState="playable"
        mediaLanesProps={{} as never}
        textOnlyProps={{} as never}
        emptyStateProps={{} as never}
      />,
    );

    expect(screen.getByTestId('workspace-host-vertical')).toBeTruthy();
    expect(screen.queryByTestId('workspace-host-waveform')).toBeNull();
  });
});
