// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import {
  AppSidePaneProvider,
  useAppSidePaneRegistrationSnapshot,
} from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import { forgetOpenProjectSession } from '../desktop/openProjectSession';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
import { DesktopTranscriptionWorkspacePage } from './DesktopTranscriptionWorkspacePage';

vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn(() => ({
      on: vi.fn(),
      un: vi.fn(),
      load: vi.fn(() => Promise.resolve()),
      setVolume: vi.fn(),
      setPlaybackRate: vi.fn(),
      destroy: vi.fn(),
      getDecodedData: vi.fn(() => null),
      getDuration: vi.fn(() => 0),
      getCurrentTime: vi.fn(() => 0),
      isPlaying: vi.fn(() => false),
      zoom: vi.fn(),
      getScroll: vi.fn(() => 0),
    })),
  },
}));
vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => ({
  default: { create: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn(), clearRegions: vi.fn() })) },
}));

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
  forgetOpenProjectSession();
  vi.unstubAllGlobals();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

function SidePaneProbe() {
  const registration = useAppSidePaneRegistrationSnapshot();
  return <div data-testid="side-pane-probe">{registration === null ? 'absent' : 'registered'}</div>;
}

describe('DesktopTranscriptionWorkspacePage', () => {
  it('opens the transcription workspace unless the flag is forced off', () => {
    expect(featureFlags.desktopTranscriptionWorkspaceEnabled).toBe(true);
  });

  it('keeps the empty state when a legacy host exposes a sample opener', async () => {
    const openBundledSample = vi.fn(async () => ({ sessionId: 'sample-session' }));
    (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
      projectReadEnabled: true,
      chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
      openBundledSample,
      desktopCall: vi.fn(async () => {
        throw new Error('unused');
      }),
      desktopMediaUrl: vi.fn(async () => ({ url: '' })),
    };

    render(
      <AppSidePaneProvider>
        <LocaleProvider locale="zh-CN">
          <SidePaneProbe />
          <DesktopPageRouter initialEntries={['/transcription']}>
            <Routes>
              <Route path="/" element={<div>home</div>} />
              <Route path="/transcription" element={<DesktopTranscriptionWorkspacePage />} />
            </Routes>
          </DesktopPageRouter>
        </LocaleProvider>
      </AppSidePaneProvider>,
    );

    expect(screen.getByTestId('desktop-transcription-workspace')).toBeTruthy();
    expect(screen.queryByText('稿件与层')).toBeNull();
    expect(screen.queryByText('这个文件夹里还没有文稿')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开文件夹' })).toBeNull();
    expect(screen.queryByTestId('desktop-no-audio-bar')).toBeNull();
    expect(screen.getByTestId('desktop-no-audio')).toBeTruthy();
    expect(screen.getByText('还没有录音')).toBeTruthy();
    expect(screen.getByTestId('side-pane-probe').textContent).toBe('absent');
    expect(screen.getByRole('button', { name: '导入录音…' })).toBeTruthy();
    expect(screen.queryByText('转写')).toBeNull();
    expect(screen.queryByTestId('desktop-waveform')).toBeNull();
    expect(screen.queryByText('片段检查器')).toBeNull();
    await waitFor(() => expect(openBundledSample).not.toHaveBeenCalled());
  });

  it('registers a picked recording on a manuscript and leaves the layer list empty', async () => {
    const calls: string[] = [];
    let registered: unknown;
    class FakeAudio {
      duration = 2;
      preload = '';
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onloadedmetadata?.();
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
      projectReadEnabled: true,
      chooseDesktopFolder: vi.fn(async () => {
        throw new Error('folder picker');
      }),
      importRecording: vi.fn(async (sessionId: string | null) => {
        expect(sessionId).toBeNull();
        return {
          relpath: 'media/abc.wav',
          sha256: 'abc',
          filename: 'take.wav',
          url: 'jieyu-media://local/token',
          sessionId: 'session-1',
        };
      }),
      desktopCall: vi.fn(async (_session: string, method: string, args: unknown) => {
        calls.push(method);
        if (method === 'recordings.register') registered = args;
        if (method === 'media.list') return [];
        if (method === 'media.create') {
          return { id: 'media-1', relpath: 'media/abc.wav', sha256: 'abc', duration: 2 };
        }
        if (method === 'manuscripts.create') return { id: 'ms-1', mediaId: 'media-1' };
        if (method === 'layers.create') return { id: 'layer-1' };
        if (method === 'manuscripts.list') return [];
        if (method === 'layers.list') return [];
        if (method === 'units.list') return [];
        return null;
      }),
      desktopMediaUrl: vi.fn(async () => ({ url: 'jieyu-media://local/played' })),
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

    fireEvent.click(screen.getByRole('button', { name: '导入录音…' }));
    await waitFor(() => {
      expect(calls).toEqual(['media.list', 'recordings.register']);
    });
    expect(registered).toEqual({
      relpath: 'media/abc.wav',
      sha256: 'abc',
      duration: 2,
      title: { und: 'take' },
    });
  });

  it('selects the manuscript that already hangs the same recording', async () => {
    const calls: string[] = [];
    (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
      projectReadEnabled: true,
      chooseDesktopFolder: vi.fn(async () => {
        throw new Error('folder picker');
      }),
      importRecording: vi.fn(async () => ({
        relpath: 'media/abc.wav',
        sha256: 'abc',
        filename: 'take.wav',
        url: 'jieyu-media://local/token',
        sessionId: 'session-1',
      })),
      desktopCall: vi.fn(async (_session: string, method: string) => {
        calls.push(method);
        if (method === 'media.list') {
          return [{ id: 'media-1', relpath: 'media/abc.wav', sha256: 'abc', duration: 2 }];
        }
        if (method === 'manuscripts.list') {
          return [{ id: 'ms-1', title: { und: 'take' }, mediaId: 'media-1' }];
        }
        if (method === 'layers.list') return [];
        if (method === 'units.list') return [];
        return null;
      }),
      desktopMediaUrl: vi.fn(async () => ({ url: 'jieyu-media://local/played' })),
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

    fireEvent.click(screen.getByRole('button', { name: '导入录音…' }));
    await waitFor(() => {
      expect(calls).toEqual(['media.list', 'recordings.register']);
    });
    expect(calls).not.toContain('manuscripts.create');
  });

  it('does not import Dexie or ReadyWorkspace orchestrator modules', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/DesktopTranscriptionWorkspacePage.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"].*dexie/i);
    expect(source).not.toMatch(/readyWorkspace/i);
    const css = readFileSync(
      join(process.cwd(), 'src/styles/pages/desktop-transcription-workspace.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.desktop-tx-bar\s*\{[^}]*border-bottom:\s*1px solid var\(--divider-base\)/,
    );
    expect(css).not.toMatch(/\.desktop-tx-bar\s*\{[^}]*box-shadow/);
    expect(css).toMatch(
      /\.desktop-tx-lane \.timeline-annotation\.timeline-annotation-selected[\s\S]*var\(--surface-panel\)[\s\S]*var\(--desktop-tx-card-edge\)[\s\S]*var\(--radius-md\)[\s\S]*var\(--desktop-tx-card-lift\)/,
    );
    expect(css).not.toMatch(/\.desktop-tx-lane[^{]*timeline-annotation-selected[^{]*\{[^}]*rgb\(/);
    expect(css).toMatch(
      /\.desktop-tx-lane \.timeline-annotation-resize-handle[\s\S]*display:\s*none/,
    );
    expect(css).toMatch(
      /timeline-annotation-selected\s+\.timeline-annotation-resize-handle[\s\S]*display:\s*block/,
    );
    expect(css).toMatch(
      /\.desktop-tx-lane > \.desktop-tx-layer-label::after\s*\{[^}]*background:\s*var\(--border-subtle\)/,
    );
    expect(css).toMatch(
      /\.desktop-tx-lane > \.desktop-tx-layer-label:hover\s*\{[^}]*color-mix\(in srgb, var\(--text-primary\) 6%, var\(--surface-panel\)\)/,
    );
    expect(css).not.toMatch(
      /\.desktop-tx-lane > \.desktop-tx-layer-label:hover\s*\{[^}]*(font-size|font-weight)/,
    );
    expect(css).toMatch(
      /\.desktop-tx-lane > \.desktop-tx-layer-label:active\s*\{[^}]*color-mix\(in srgb, var\(--text-primary\) 8%, var\(--surface-panel\)\)/,
    );
    expect(css).toMatch(
      /\.desktop-tx-lane > \.desktop-tx-layer-label:focus-visible\s*\{[^}]*outline:\s*1\.5px solid var\(--focus-color\)/,
    );
    expect(css).toMatch(
      /\.desktop-tx-workspace\.is-header-folded \.desktop-tx-stage::before,\s*\.desktop-tx-workspace\.is-no-audio \.desktop-tx-stage::before\s*\{[^}]*content:\s*none/,
    );
    expect(css).toMatch(
      /\.desktop-tx-lane\.is-group-mid > \.desktop-tx-layer-label::after\s*\{[^}]*content:\s*none/,
    );
    expect(css).toMatch(/\.desktop-tx-lane \.timeline-annotation\s*\{[^}]*top:\s*4px/);
  });
});
