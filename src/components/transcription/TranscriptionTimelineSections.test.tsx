// @vitest-environment jsdom

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineScrollSection } from './TranscriptionTimelineSections';

describe('TimelineScrollSection', () => {
  it('exposes an accessible named region when requested by the workspace', () => {
    render(
      <TimelineScrollSection
        containerRef={createRef<HTMLDivElement>()}
        onPointerDownCapture={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        onScroll={vi.fn()}
        role="region"
        aria-label="Transcription timeline"
      >
        <div />
      </TimelineScrollSection>,
    );

    expect(screen.getByRole('region', { name: 'Transcription timeline' })).toBeInTheDocument();
  });
});
