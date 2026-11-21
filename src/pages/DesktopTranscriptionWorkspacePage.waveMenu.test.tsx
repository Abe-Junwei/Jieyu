/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';

const playback = vi.hoisted(() => ({
  seekTo: vi.fn(),
  togglePlayback: vi.fn(),
  isPlaying: false,
  waveformRef: { current: null as HTMLDivElement | null },
  spectrogramRef: { current: null as HTMLDivElement | null },
  instanceRef: { current: null },
}));

vi.mock('./useDesktopProjectReadController', () => ({
  useDesktopProjectReadController: () => ({
    sessionId: 'session-1',
    model: {
      manuscriptId: 'ms-1',
      manuscripts: [{ id: 'ms-1', title: { und: 'Story' }, timeMapping: null }],
      layers: [],
      layerId: 'layer-1',
      units: [
        { id: 'u-a', startMs: 0, endMs: 1000, text: 'alpha', speakerId: null },
        { id: 'u-b', startMs: 1000, endMs: 2000, text: 'beta', speakerId: null },
      ],
      audioUrl: 'blob:test-audio',
    },
    notes: [],
    projectTitle: 'Project',
    error: '',
    openFolder: vi.fn(),
    selectManuscript: vi.fn(),
    saveText: vi.fn(async () => true),
    persistTextDraft: vi.fn(async () => undefined),
    discardTextDraft: vi.fn(async () => undefined),
    inspectTextSave: vi.fn(async () => 'saved'),
    readTextDraft: vi.fn(async () => null),
    undoText: vi.fn(),
    refresh: vi.fn(async () => undefined),
    importRecording: vi.fn(),
  }),
}));

vi.mock('../contexts/AppSidePaneContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AppSidePaneContext')>()),
  useRegisterAppSidePane: () => undefined,
}));

vi.mock('./useDesktopTranscriptionMediaController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useDesktopTranscriptionMediaController')>();
  return {
    ...actual,
    useDesktopTranscriptionMediaController: () => ({
      waveformRef: playback.waveformRef,
      spectrogramRef: playback.spectrogramRef,
      instanceRef: playback.instanceRef,
      isReady: true,
      isPlaying: playback.isPlaying,
      duration: 8,
      waveWidth: 800,
      zoomPercent: 100,
      fitPxPerSec: 100,
      maxZoomPercent: 200,
      zoomPxPerSec: 100,
      scrollLeftPx: 0,
      rulerView: { start: 0, end: 8 },
      zoomToPercent: vi.fn(),
      zoomToUnit: vi.fn(),
      playbackRate: 1,
      volume: 1,
      loop: false,
      waveformDisplayMode: 'waveform' as const,
      waveformVisualStyle: 'balanced' as const,
      acousticOverlayMode: 'none' as const,
      setPlaybackRate: vi.fn(),
      setVolume: vi.fn(),
      setLoop: vi.fn(),
      setWaveformDisplayMode: vi.fn(),
      setWaveformVisualStyle: vi.fn(),
      setAcousticOverlayMode: vi.fn(),
      togglePlayback: playback.togglePlayback,
      playSegment: vi.fn(),
      seekBySeconds: vi.fn(),
      seekTo: playback.seekTo,
    }),
  };
});

import { DesktopTranscriptionWorkspacePage } from './DesktopTranscriptionWorkspacePage';

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
  playback.isPlaying = false;
  playback.seekTo.mockClear();
  playback.togglePlayback.mockClear();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

function renderWorkspace() {
  (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
    desktopCall: vi.fn(async () => {
      throw new Error('unused');
    }),
    desktopMediaUrl: vi.fn(async () => ({ url: '' })),
  };
  render(
    <LocaleProvider locale="zh-CN">
      <DesktopPageRouter initialEntries={['/transcription']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/transcription" element={<DesktopTranscriptionWorkspacePage />} />
        </Routes>
      </DesktopPageRouter>
    </LocaleProvider>,
  );
}

function openWaveMenu() {
  renderWorkspace();
  fireEvent.contextMenu(screen.getByTestId('desktop-waveform'), { clientX: 250, clientY: 40 });
  return screen.getByTestId('desktop-wave-menu');
}

describe('DesktopTranscriptionWorkspacePage waveform menu (#602)', () => {
  it('plays from the clicked time', () => {
    openWaveMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '从这里播放' }));
    expect(playback.seekTo).toHaveBeenCalledWith(2.5);
    expect(playback.togglePlayback).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('desktop-wave-menu')).toBeNull();
  });

  it('clears the selection when the empty waveform is clicked', () => {
    renderWorkspace();
    fireEvent.click(screen.getByText('alpha'));
    expect(
      document
        .querySelector('.timeline-annotation[title="alpha"]')
        ?.classList.contains('timeline-annotation-selected'),
    ).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('desktop-waveform'), {
      button: 0,
      clientX: 250,
      clientY: 40,
    });
    fireEvent.pointerUp(window);
    expect(
      document
        .querySelector('.timeline-annotation[title="alpha"]')
        ?.classList.contains('timeline-annotation-selected'),
    ).toBe(false);
    expect(screen.queryByRole('menuitem', { name: '清除选区' })).toBeNull();
  });
});
