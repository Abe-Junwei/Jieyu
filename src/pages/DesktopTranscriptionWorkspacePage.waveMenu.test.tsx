/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';

const mediaInput = vi.hoisted(() => ({
  onRegionContextMenu: undefined as ((regionId: string, x: number, y: number) => void) | undefined,
}));

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
      layers: [
        {
          id: 'layer-1',
          name: { zh: '转写' },
          contentType: 'transcription',
          tierType: 'time-aligned',
          units: [],
        },
      ],
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
    useDesktopTranscriptionMediaController: (input: {
      onRegionContextMenu?: (regionId: string, x: number, y: number) => void;
    }) => {
      mediaInput.onRegionContextMenu = input.onRegionContextMenu;
      return {
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
      };
    },
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

const desktopCall = vi.hoisted(() =>
  vi.fn(async (_session: string, _method: string, _input?: unknown): Promise<unknown> => null),
);

function renderWorkspace() {
  desktopCall.mockClear();
  (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
    desktopCall,
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
    expect(screen.queryByRole('menuitem', { name: '标记为跳过处理' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '删除句段' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '从这里播放' }));
    expect(playback.seekTo).toHaveBeenCalledWith(2.5);
    expect(playback.togglePlayback).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('desktop-wave-menu')).toBeNull();
  });

  it('asks to delete the segment under the waveform menu', async () => {
    const preview = {
      linkedTexts: 0,
      tokens: 0,
      morphemes: 0,
      notes: 0,
      lexemeLinks: 0,
      analysisCandidates: 0,
      customFieldValues: 0,
      drafts: 0,
      receptionRecords: 0,
    };
    desktopCall.mockImplementation(async (_session: string, method: string) =>
      method === 'units.deletePreview' ? preview : null,
    );
    renderWorkspace();
    act(() => {
      mediaInput.onRegionContextMenu?.('u-b', 120, 40);
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '删除句段' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('将删除这一段');
    expect(desktopCall).toHaveBeenCalledWith('session-1', 'units.deletePreview', { unitId: 'u-b' });
    fireEvent.click(screen.getByRole('button', { name: '删除句段' }));
    expect(desktopCall).toHaveBeenCalledWith(
      'session-1',
      'units.delete',
      expect.objectContaining({ unitId: 'u-b' }),
    );
  });

  it('offers skip processing from a waveform segment context menu', () => {
    renderWorkspace();
    expect(mediaInput.onRegionContextMenu).toBeTypeOf('function');
    act(() => {
      mediaInput.onRegionContextMenu?.('u-b', 120, 40);
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '标记为跳过处理' }));
    expect(desktopCall).toHaveBeenCalledWith('session-1', 'units.setSkipProcessing', {
      unitId: 'u-b',
      skip: true,
    });
  });

  it('offers skip processing on the highlighted waveform segment', () => {
    renderWorkspace();
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.contextMenu(screen.getByTestId('desktop-wave-body'), { clientX: 900, clientY: 40 });
    fireEvent.click(screen.getByRole('menuitem', { name: '标记为跳过处理' }));
    expect(desktopCall).toHaveBeenCalledWith('session-1', 'units.setSkipProcessing', {
      unitId: 'u-a',
      skip: true,
    });
  });

  it('marks the segment under the waveform click as skip processing', () => {
    renderWorkspace();
    fireEvent.contextMenu(screen.getByTestId('desktop-waveform'), { clientX: 50, clientY: 40 });
    fireEvent.click(screen.getByRole('menuitem', { name: '标记为跳过处理' }));
    expect(desktopCall).toHaveBeenCalledWith('session-1', 'units.setSkipProcessing', {
      unitId: 'u-a',
      skip: true,
    });
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
