// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';

const NOW = new Date().toISOString();

describe('TimelineTranslationAudioControls', () => {
  it('renders buttons in record, play, delete order and calls delete handler', () => {
    const onDeleteRecording = vi.fn();
    const onStartRecording = vi.fn();

    render(
      <TimelineTranslationAudioControls
        mediaItem={{
          id: 'media-1',
          textId: 't1',
          filename: 'demo.webm',
          url: 'blob:demo',
          isOfflineCached: true,
          details: { source: 'translation-recording', mimeType: 'audio/webm' },
          createdAt: NOW,
        } as never}
        onStartRecording={onStartRecording}
        onDeleteRecording={onDeleteRecording}
      />,
    );

    const controls = screen.getByText('已录音').closest('.timeline-translation-audio-controls') as HTMLElement;
    const buttons = within(controls).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '开始录音翻译',
      '播放录音翻译',
      '删除录音翻译',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '删除录音翻译' }));

    expect(onDeleteRecording).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });
});