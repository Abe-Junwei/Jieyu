// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';

const NOW = new Date().toISOString();

describe('TimelineTranslationAudioControls', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders record, play, delete when STT callback omitted', () => {
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

    const controls = screen.getByText(/已录音|Recorded/).closest('.timeline-translation-audio-controls') as HTMLElement;
    const buttons = within(controls).getAllByRole('button');

    const labels = buttons.map((button) => button.getAttribute('aria-label') ?? '');
    expect(labels[0]).toMatch(/开始录音翻译|Start recording translation/);
    expect(labels[1]).toMatch(/播放录音翻译|Play recorded translation/);
    expect(labels[2]).toMatch(/删除录音翻译|Delete recorded translation/);

    fireEvent.click(screen.getByRole('button', { name: /删除录音翻译|Delete recorded translation/ }));

    expect(onDeleteRecording).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('renders STT between play and delete when onTranscribeRecording is set', async () => {
    const onTranscribeRecording = vi.fn().mockResolvedValue(undefined);

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
        onStartRecording={vi.fn()}
        onTranscribeRecording={onTranscribeRecording}
        onDeleteRecording={vi.fn()}
      />,
    );

    const controls = screen.getByText(/已录音|Recorded/).closest('.timeline-translation-audio-controls') as HTMLElement;
    const buttons = within(controls).getAllByRole('button');
    const labels = buttons.map((button) => button.getAttribute('aria-label') ?? '');
    expect(labels[0]).toMatch(/开始录音翻译|Start recording translation/);
    expect(labels[1]).toMatch(/播放录音翻译|Play recorded translation/);
    expect(labels[2]).toMatch(/语音转文字|Transcribe recording/);
    expect(labels[3]).toMatch(/删除录音翻译|Delete recorded translation/);

    fireEvent.click(screen.getByRole('button', { name: /语音转文字|Transcribe recording/ }));
    await vi.waitFor(() => {
      expect(onTranscribeRecording).toHaveBeenCalledTimes(1);
    });
  });
});