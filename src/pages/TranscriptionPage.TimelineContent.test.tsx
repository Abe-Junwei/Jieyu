// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionPageTimelineContent } from './TranscriptionPage.TimelineContent';

const { mediaLanesSpy, textOnlySpy, comparisonSpy } = vi.hoisted(() => ({
  mediaLanesSpy: vi.fn(),
  textOnlySpy: vi.fn(),
  comparisonSpy: vi.fn(),
}));

vi.mock('../components/TranscriptionTimelineMediaLanes', () => ({
  TranscriptionTimelineMediaLanes: (props: unknown) => {
    mediaLanesSpy(props);
    return <div data-testid="media-lanes">media lanes</div>;
  },
}));

vi.mock('../components/TranscriptionTimelineTextOnly', () => ({
  TranscriptionTimelineTextOnly: (props: unknown) => {
    textOnlySpy(props);
    return <div data-testid="text-only">text only</div>;
  },
}));

vi.mock('../components/TranscriptionTimelineComparison', () => ({
  TranscriptionTimelineComparison: (props: unknown) => {
    comparisonSpy(props);
    return <div data-testid="comparison-view">comparison view</div>;
  },
}));

describe('TranscriptionPageTimelineContent', () => {
  afterEach(() => {
    cleanup();
  });

  it('prefers text comparison content when comparison view is enabled', () => {
    render(
      <TranscriptionPageTimelineContent
        selectedMediaUrl="blob:x"
        playerIsReady
        playerDuration={12}
        layersCount={2}
        mediaLanesProps={{} as never}
        textOnlyProps={{ comparisonViewEnabled: true } as never}
        emptyStateProps={{ locale: 'zh-CN', layersCount: 2, hasSelectedMedia: true, onCreateTranscriptionLayer: vi.fn(), onOpenImportFile: vi.fn() }}
      />, 
    );

    expect(screen.getByTestId('comparison-view')).toBeTruthy();
    expect(screen.queryByTestId('media-lanes')).toBeNull();
    expect(screen.queryByTestId('text-only')).toBeNull();
  });

  it('enters comparison when layersCount is 0 but text-only props still carry transcription layers', () => {
    render(
      <TranscriptionPageTimelineContent
        selectedMediaUrl="blob:x"
        playerIsReady
        playerDuration={12}
        layersCount={0}
        mediaLanesProps={{} as never}
        textOnlyProps={{
          comparisonViewEnabled: true,
          transcriptionLayers: [{ id: 'layer-1' }] as never,
          translationLayers: [],
        } as never}
        emptyStateProps={{ locale: 'zh-CN', layersCount: 0, hasSelectedMedia: true, onCreateTranscriptionLayer: vi.fn(), onOpenImportFile: vi.fn() }}
      />,
    );

    expect(screen.getByTestId('comparison-view')).toBeTruthy();
  });
});
