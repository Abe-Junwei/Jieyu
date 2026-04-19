// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';

const {
  mockLoadTrackEntityStateMapFromDb,
  mockSaveTrackEntityStateToDb,
} = vi.hoisted(() => ({
  mockLoadTrackEntityStateMapFromDb: vi.fn(async () => ({})),
  mockSaveTrackEntityStateToDb: vi.fn(async () => undefined),
}));

vi.mock('../services/TrackEntityStore', async () => {
  const actual = await vi.importActual<typeof import('../services/TrackEntityStore')>('../services/TrackEntityStore');
  return {
    ...actual,
    loadTrackEntityStateMapFromDb: mockLoadTrackEntityStateMapFromDb,
    saveTrackEntityStateToDb: mockSaveTrackEntityStateToDb,
  };
});

interface HarnessProps {
  activeTextId: string | null;
  selectedTimelineMediaId: string | null;
}

function TrackEntityInitHarness(props: HarnessProps) {
  const [transcriptionTrackMode, setTranscriptionTrackMode] = useState<TranscriptionTrackDisplayMode>('single');
  const {
    laneLockMap,
    persistenceContext,
  } = useTrackEntityStateController({
    activeTextId: props.activeTextId,
    selectedTimelineMediaId: props.selectedTimelineMediaId,
    setTranscriptionTrackMode,
  });

  useTrackEntityPersistenceController({
    activeTextId: persistenceContext.activeTextId,
    trackEntityScopedKey: persistenceContext.trackEntityScopedKey,
    trackEntityStateByMediaRef: persistenceContext.trackEntityStateByMediaRef,
    trackEntityHydratedKeyRef: persistenceContext.trackEntityHydratedKeyRef,
    transcriptionTrackMode,
    effectiveLaneLockMap: laneLockMap,
  });

  return <div data-testid="track-mode">{transcriptionTrackMode}</div>;
}

describe('TranscriptionPage track entity initialization', () => {
  beforeEach(() => {
    mockLoadTrackEntityStateMapFromDb.mockReset();
    mockLoadTrackEntityStateMapFromDb.mockResolvedValue({});
    mockSaveTrackEntityStateToDb.mockReset();
    mockSaveTrackEntityStateToDb.mockResolvedValue(undefined);
  });

  it('hydrates and persists once during orchestrator-style initialization', async () => {
    const { rerender, getByTestId } = render(
      <TrackEntityInitHarness activeTextId="text-1" selectedTimelineMediaId="media-1" />,
    );

    await waitFor(() => {
      expect(mockLoadTrackEntityStateMapFromDb).toHaveBeenCalledTimes(1);
      expect(mockLoadTrackEntityStateMapFromDb).toHaveBeenCalledWith('text-1');
      expect(mockSaveTrackEntityStateToDb).toHaveBeenCalledTimes(1);
      expect(mockSaveTrackEntityStateToDb).toHaveBeenCalledWith(
        'text-1',
        'text-1::media-1',
        expect.objectContaining({ mode: 'single', laneLockMap: {} }),
      );
      expect(getByTestId('track-mode').textContent).toBe('single');
    });

    rerender(<TrackEntityInitHarness activeTextId="text-1" selectedTimelineMediaId="media-1" />);

    await waitFor(() => {
      expect(mockLoadTrackEntityStateMapFromDb).toHaveBeenCalledTimes(1);
      expect(mockSaveTrackEntityStateToDb).toHaveBeenCalledTimes(1);
    });
  });
});