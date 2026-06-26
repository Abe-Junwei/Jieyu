// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithLocale } from '../test/localeTestUtils';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import { buildEmptyTimelinePolicy } from '../utils/emptyTimelinePolicy';

describe('TranscriptionPageTimelineEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders create transcription action from shared layer action labels', () => {
    const onCreateTranscriptionLayer = vi.fn();

    renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 0,
          hasSelectedMedia: false,
          currentMediaUnitCount: 0,
        })}
        onCreateTranscriptionLayer={onCreateTranscriptionLayer}
        onOpenImportFile={vi.fn()}
      />,
    );

    const createButton = screen.getByRole('button', { name: '新建转写层' });
    fireEvent.click(createButton);

    expect(onCreateTranscriptionLayer).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when policy hides empty chrome', () => {
    const { container } = renderWithLocale(
      <TranscriptionPageTimelineEmptyState
        locale="zh-CN"
        policy={buildEmptyTimelinePolicy({
          layersCount: 1,
          hasSelectedMedia: true,
          currentMediaUnitCount: 2,
        })}
        onCreateTranscriptionLayer={vi.fn()}
        onOpenImportFile={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
