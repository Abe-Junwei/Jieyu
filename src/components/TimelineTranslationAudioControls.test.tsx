// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetIconTips } from './ui/IconTip';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';

const NOW = new Date().toISOString();

describe('TimelineTranslationAudioControls', () => {
  afterEach(() => {
    cleanup();
    resetIconTips();
    vi.useRealTimers();
  });
  it('keeps the only microphone and live stop out of the collapsible saved actions', () => {
    const view = render(<TimelineTranslationAudioControls compact clipRow />);
    const mic = screen.getAllByRole('button', {
      name: /^(开始录音翻译|Start recording translation)$/,
    })[0]!;
    expect(mic.closest('.oral-clip-record')).toBeNull();
    view.rerender(<TimelineTranslationAudioControls compact clipRow isRecording />);
    expect(
      screen
        .getByRole('button', { name: /^(停止录音翻译|Stop recording translation)$/ })
        .closest('.oral-clip-record'),
    ).toBeNull();
    view.rerender(<TimelineTranslationAudioControls compact clipRow audioSrc="blob:clip" />);
    expect(
      screen
        .getByRole('button', { name: /^(再录一条|Record another)$/ })
        .closest('.oral-clip-record'),
    ).not.toBeNull();
  });

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

  it('pauses and resumes the same take without playing saved audio', () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const view = render(
      <TimelineTranslationAudioControls
        compact
        clipRow
        isRecording
        onPauseRecording={pause}
        onResumeRecording={resume}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^(暂停录音|Pause recording)$/ }));
    expect(pause).toHaveBeenCalledOnce();
    view.rerender(
      <TimelineTranslationAudioControls
        compact
        clipRow
        isRecording
        takePaused
        onPauseRecording={pause}
        onResumeRecording={resume}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^(继续录音|Resume recording)$/ }));
    expect(resume).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
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

  it('puts record-another between play and the playlist, with transcribe beside delete', () => {
    render(
      <TimelineTranslationAudioControls
        clipRow
        compact
        audioSrc="blob:clip"
        showRecord
        onStartRecording={vi.fn()}
        onDeleteRecording={vi.fn()}
        onTranscribeRecording={vi.fn()}
        leading={<span>第 2 条</span>}
        trailing={
          <button type="button" aria-label="清单">
            list
          </button>
        }
      />,
    );
    const labels = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(labels[0]).toMatch(/播放录音翻译|Play recorded translation/);
    expect(labels[1]).toMatch(/再录一条|Record another/);
    expect(labels[2]).toBe('清单');
    expect(labels[3]).toMatch(/语音转文字|Transcribe recording/);
    expect(labels[4]).toMatch(/删除录音翻译|Delete recorded translation/);
    const again = screen.getByRole('button', { name: /再录一条|Record another/ });
    expect(again.hasAttribute('title')).toBe(false);
    vi.useFakeTimers();
    fireEvent.pointerEnter(again);
    const label = again.getAttribute('aria-label') ?? '';
    expect(screen.queryByText(label)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const tip = screen.getByText(label);
    expect(tip.className).toBe('jieyu-icon-tip');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    vi.useRealTimers();
    expect(
      screen
        .getByRole('button', { name: /语音转文字|Transcribe recording/ })
        .querySelector('svg')
        ?.getAttribute('class'),
    ).toMatch(/lucide-captions/);
  });

  it('keeps the play icon when playback is not actually running', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const view = render(<TimelineTranslationAudioControls clipRow compact audioSrc="blob:one" />);
    fireEvent.click(screen.getByRole('button', { name: /播放录音翻译|Play recorded translation/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.queryByRole('button', { name: /暂停录音翻译|Pause recorded translation/ }),
    ).toBeNull();

    const audio = view.container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => false });
    fireEvent(audio, new Event('play'));
    expect(
      screen.getByRole('button', { name: /暂停录音翻译|Pause recorded translation/ }),
    ).toBeTruthy();
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => true });
    view.rerender(<TimelineTranslationAudioControls clipRow compact audioSrc="blob:two" />);
    expect(
      screen.getByRole('button', { name: /播放录音翻译|Play recorded translation/ }),
    ).toBeTruthy();
    play.mockRestore();
  });

  it('shows the current clip length, and a blank time before the file reports one', () => {
    const { container } = render(
      <TimelineTranslationAudioControls clipRow compact audioSrc="blob:clip" />,
    );
    expect(screen.getByText('—:—')).toBeTruthy();
    expect(screen.queryByText(/第 1 条|Clip 1/)).toBeNull();
    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { configurable: true, value: 12 });
    fireEvent(audio, new Event('loadedmetadata'));
    expect(screen.getByText('0:12', { exact: true })).toBeTruthy();
  });

  it('keeps another recording, transcribe, and delete in the more menu', () => {
    render(
      <TimelineTranslationAudioControls
        clipRow
        compact
        audioSrc="blob:clip"
        showRecord
        clipCount={5}
        clipNumber={2}
        onStartRecording={vi.fn()}
        onTranscribeRecording={vi.fn()}
        onDeleteRecording={vi.fn()}
      />,
    );
    expect(screen.getByText(/第 2 条|Clip 2/)).toBeTruthy();
    expect(screen.getByText(/2\/5/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /更多|More/ }));
    const items = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items[0]).toMatch(/再录一条|Record another/);
    expect(items.at(-1)).toMatch(/删除录音翻译|Delete recorded translation/);
  });

  it('disables another recording once five clips exist', () => {
    const onStartRecording = vi.fn();
    render(
      <TimelineTranslationAudioControls
        clipRow
        compact
        audioSrc="blob:clip"
        showRecord
        recordCapped
        clipCount={5}
        clipNumber={5}
        onStartRecording={onStartRecording}
      />,
    );
    const again = screen.getByRole('button', {
      name: /这一段已有五条录音|five recordings/,
    });
    expect(again.hasAttribute('disabled')).toBe(true);
    fireEvent.click(again);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('shows the take status beside the clip index and only a stop button', () => {
    render(
      <TimelineTranslationAudioControls
        clipRow
        compact
        isRecording
        elapsed={4}
        showRecord
        onStopRecording={vi.fn()}
        leading={<span>第 2 条</span>}
      />,
    );
    const labels = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      expect.stringMatching(/停止录音翻译|Stop recording translation/),
      '0:04',
    ]);
    expect(screen.getByText('0:04', { exact: true })).toBeTruthy();
    expect(screen.queryByText(/录音中 0:04|Recording 0:04/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /播放录音翻译|Play recorded translation/ }),
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
