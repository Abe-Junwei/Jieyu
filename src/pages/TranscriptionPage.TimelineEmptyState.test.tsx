// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../test/localeTestUtils';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

describe('TranscriptionPageTimelineEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders create transcription action from shared layer action labels', () => {
    const onCreateTranscriptionLayer = vi.fn();

    renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        layersCount={0}
        hasSelectedMedia={false}
        onCreateTranscriptionLayer={onCreateTranscriptionLayer}
        onOpenImportFile={vi.fn()}
      />,
    );

    const createButton = screen.getByRole('button', { name: '新建转写层' });
    fireEvent.click(createButton);

    expect(onCreateTranscriptionLayer).toHaveBeenCalledTimes(1);
  });
});