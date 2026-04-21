// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionPageTimelineContent } from './TranscriptionPage.TimelineContent';

const { mediaLanesSpy, comparisonSpy } = vi.hoisted(() => ({
  mediaLanesSpy: vi.fn(),
  comparisonSpy: vi.fn(),
}));

vi.mock('../components/TranscriptionTimelineHorizontalMediaLanes', () => ({
  TranscriptionTimelineHorizontalMediaLanes: (props: unknown) => {
    mediaLanesSpy(props);
    return <div data-testid="media-lanes">media lanes</div>;
  },
}));

vi.mock('../components/TranscriptionTimelineVerticalView', () => ({
  TranscriptionTimelineVerticalView: (props: unknown) => {
    comparisonSpy(props);
    return <div data-testid="vertical-timeline-shell-mock">vertical timeline shell</div>;
  },
}));

describe('TranscriptionPageTimelineContent', () => {
  afterEach(() => {
    cleanup();
  });

  it('prefers text comparison content when comparison view is enabled', () => {
    render(
      <TranscriptionPageTimelineContent
        workspaceShell="waveform"
        workspaceAcousticPending={false}
        verticalComparisonEnabled
        mediaLanesProps={{} as never}
        textOnlyProps={{ verticalViewEnabled: true } as never}
        emptyStateProps={{ locale: 'zh-CN', layersCount: 2, hasSelectedMedia: true, onCreateTranscriptionLayer: vi.fn(), onOpenImportFile: vi.fn() }}
      />, 
    );

    expect(screen.getByTestId('vertical-timeline-shell-mock')).toBeTruthy();
    expect(screen.queryByTestId('media-lanes')).toBeNull();
  });

  it('enters comparison when layersCount is 0 but text-only props still carry transcription layers', () => {
    render(
      <TranscriptionPageTimelineContent
        workspaceShell="text-only"
        workspaceAcousticPending={false}
        verticalComparisonEnabled
        mediaLanesProps={{} as never}
        textOnlyProps={{
          verticalViewEnabled: true,
          transcriptionLayers: [{ id: 'layer-1' }] as never,
          translationLayers: [],
        } as never}
        emptyStateProps={{ locale: 'zh-CN', layersCount: 0, hasSelectedMedia: true, onCreateTranscriptionLayer: vi.fn(), onOpenImportFile: vi.fn() }}
      />,
    );

    expect(screen.getByTestId('vertical-timeline-shell-mock')).toBeTruthy();
  });
});
