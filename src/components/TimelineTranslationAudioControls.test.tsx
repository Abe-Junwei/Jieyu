// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';

const NOW = new Date().toISOString();

describe('TimelineTranslationAudioControls', () => {
  it('starts recording when the empty control is clicked outside the mic', () => {
    const onStartRecording = vi.fn();
    const { container } = render(
      <TimelineTranslationAudioControls compact onStartRecording={onStartRecording} />,
    );
    const controls = container.querySelector('.timeline-translation-audio-controls') as HTMLElement;
    expect(screen.queryByText(/未录音|Not recorded/)).toBeNull();
    fireEvent.click(controls);
    expect(onStartRecording).toHaveBeenCalledTimes(1);
  });

  it('shows the level while a take is open, without pause or delete', () => {
    render(<TimelineTranslationAudioControls compact isRecording level={0.8} />);
    expect(screen.getByRole('img', { name: /电平|Input level/ })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /暂停录音翻译|Pause recorded translation/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /删除录音翻译|Delete recorded translation/ }),
    ).toBeNull();
  });

  it('shows the saved clip length', () => {
    const { container } = render(<TimelineTranslationAudioControls compact audioSrc="blob:clip" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 14 });
    fireEvent(audio, new Event('loadedmetadata'));
    expect(screen.getByText('0:14')).toBeTruthy();
  });

  it('shows opening copy without the recording controls while the microphone is arming', () => {
    render(<TimelineTranslationAudioControls compact isArming />);
    expect(
      screen.getByRole('button', { name: /正在打开麦克风|Opening the microphone/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /电平|Input level/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /暂停录音翻译|Pause recorded translation/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /删除录音翻译|Delete recorded translation/ }),
    ).toBeNull();
  });

  it('hides the saved clip controls while a new take is open', () => {
    render(
      <TimelineTranslationAudioControls
        compact
        isRecording
        audioSrc="blob:old"
        onTranscribeRecording={vi.fn()}
        onDeleteRecording={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /播放录音翻译|Play recorded translation/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /语音转文字|Transcribe recording/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /删除录音翻译|Delete recorded translation/ }),
    ).toBeNull();
  });

  afterEach(() => {
    cleanup();
  });
  it('renders record, play, delete when STT callback omitted', () => {
    const onDeleteRecording = vi.fn();
    const onStartRecording = vi.fn();

    render(
      <TimelineTranslationAudioControls
        mediaItem={
          {
            id: 'media-1',
            textId: 't1',
            filename: 'demo.webm',
            url: 'blob:demo',
            isOfflineCached: true,
            timelineKind: 'acoustic',
            byteLocation: 'url',
            availability: 'available',
            details: { source: 'translation-recording', mimeType: 'audio/webm' },
            createdAt: NOW,
          } as never
        }
        onStartRecording={onStartRecording}
        onDeleteRecording={onDeleteRecording}
      />,
    );

    const controls = screen
      .getByText(/已录音|Recorded/)
      .closest('.timeline-translation-audio-controls') as HTMLElement;
    const buttons = within(controls).getAllByRole('button');

    const labels = buttons.map((button) => button.getAttribute('aria-label') ?? '');
    expect(labels[0]).toMatch(/开始录音翻译|Start recording translation/);
    expect(labels[1]).toMatch(/播放录音翻译|Play recorded translation/);
    expect(labels[2]).toMatch(/删除录音翻译|Delete recorded translation/);

    fireEvent.click(
      screen.getByRole('button', { name: /删除录音翻译|Delete recorded translation/ }),
    );

    expect(onDeleteRecording).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('renders STT between play and delete when onTranscribeRecording is set', async () => {
    const onTranscribeRecording = vi.fn().mockResolvedValue(undefined);

    render(
      <TimelineTranslationAudioControls
        mediaItem={
          {
            id: 'media-1',
            textId: 't1',
            filename: 'demo.webm',
            url: 'blob:demo',
            isOfflineCached: true,
            timelineKind: 'acoustic',
            byteLocation: 'url',
            availability: 'available',
            details: { source: 'translation-recording', mimeType: 'audio/webm' },
            createdAt: NOW,
          } as never
        }
        onStartRecording={vi.fn()}
        onTranscribeRecording={onTranscribeRecording}
        onDeleteRecording={vi.fn()}
      />,
    );

    const controls = screen
      .getByText(/已录音|Recorded/)
      .closest('.timeline-translation-audio-controls') as HTMLElement;
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

it('keeps busy until a delayed transcribe Promise settles and blocks repeat clicks (#457)', async () => {
  let resolveTranscribe!: () => void;
  const onTranscribeRecording = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveTranscribe = resolve;
      }),
  );

  const { container } = render(
    <TimelineTranslationAudioControls
      mediaItem={
        {
          id: 'media-1',
          textId: 't1',
          filename: 'demo.webm',
          url: 'blob:demo',
          isOfflineCached: true,
          timelineKind: 'acoustic',
          byteLocation: 'url',
          availability: 'available',
          details: { source: 'translation-recording', mimeType: 'audio/webm' },
          createdAt: NOW,
        } as never
      }
      onStartRecording={vi.fn()}
      onTranscribeRecording={onTranscribeRecording}
      onDeleteRecording={vi.fn()}
    />,
  );

  const controls = container.querySelector('.timeline-translation-audio-controls') as HTMLElement;
  const button = within(controls).getByRole('button', {
    name: /语音转文字|Transcribe recording/,
  });
  fireEvent.click(button);
  await vi.waitFor(() => {
    expect(onTranscribeRecording).toHaveBeenCalledTimes(1);
  });
  expect(controls.className).toContain('timeline-translation-audio-controls-transcribing');

  fireEvent.click(button);
  expect(onTranscribeRecording).toHaveBeenCalledTimes(1);

  resolveTranscribe();
  await vi.waitFor(() => {
    expect(controls.className).not.toContain('timeline-translation-audio-controls-transcribing');
  });
});

it('clears busy when the returned Promise rejects (#457)', async () => {
  const onTranscribeRecording = vi.fn().mockRejectedValue(new Error('stt failed'));

  const { container } = render(
    <TimelineTranslationAudioControls
      mediaItem={
        {
          id: 'media-1',
          textId: 't1',
          filename: 'demo.webm',
          url: 'blob:demo',
          isOfflineCached: true,
          timelineKind: 'acoustic',
          byteLocation: 'url',
          availability: 'available',
          details: { source: 'translation-recording', mimeType: 'audio/webm' },
          createdAt: NOW,
        } as never
      }
      onStartRecording={vi.fn()}
      onTranscribeRecording={onTranscribeRecording}
      onDeleteRecording={vi.fn()}
    />,
  );

  const controls = container.querySelector('.timeline-translation-audio-controls') as HTMLElement;
  const button = within(controls).getByRole('button', {
    name: /语音转文字|Transcribe recording/,
  });
  fireEvent.click(button);
  await vi.waitFor(() => {
    expect(onTranscribeRecording).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(controls.className).not.toContain('timeline-translation-audio-controls-transcribing');
  });
});

it('clears busy immediately if onTranscribeRecording returns undefined (parent must return Promise) (#457)', async () => {
  const onTranscribeRecording = vi.fn(() => {
    void undefined;
  });

  const { container } = render(
    <TimelineTranslationAudioControls
      mediaItem={
        {
          id: 'media-1',
          textId: 't1',
          filename: 'demo.webm',
          url: 'blob:demo',
          isOfflineCached: true,
          timelineKind: 'acoustic',
          byteLocation: 'url',
          availability: 'available',
          details: { source: 'translation-recording', mimeType: 'audio/webm' },
          createdAt: NOW,
        } as never
      }
      onStartRecording={vi.fn()}
      onTranscribeRecording={onTranscribeRecording}
      onDeleteRecording={vi.fn()}
    />,
  );

  const controls = container.querySelector('.timeline-translation-audio-controls') as HTMLElement;
  fireEvent.click(
    within(controls).getByRole('button', { name: /语音转文字|Transcribe recording/ }),
  );
  await vi.waitFor(() => {
    expect(onTranscribeRecording).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(controls.className).not.toContain('timeline-translation-audio-controls-transcribing');
  });
});
