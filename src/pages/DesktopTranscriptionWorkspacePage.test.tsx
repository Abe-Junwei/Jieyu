// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { LocaleProvider } from '../i18n';
import { forgetOpenProjectSession } from '../desktop/openProjectSession';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
import { DesktopTranscriptionWorkspacePage } from './DesktopTranscriptionWorkspacePage';

vi.mock('wavesurfer.js', () => ({ default: { create: vi.fn() } }));
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

describe('DesktopTranscriptionWorkspacePage', () => {
  it('keeps the slice-1 workspace behind a default-off flag', () => {
    expect(featureFlags.desktopTranscriptionWorkspaceEnabled).toBe(false);
  });

  it('renders the board-27 shell regions when a desktop host is present', () => {
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

    expect(screen.getByTestId('desktop-transcription-workspace')).toBeTruthy();
    expect(screen.queryByText('稿件与层')).toBeNull();
    expect(screen.queryByText('这个文件夹里还没有文稿')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开文件夹' })).toBeNull();
    expect(screen.queryByTestId('desktop-no-audio-bar')).toBeNull();
    expect(screen.getByTestId('desktop-no-audio')).toBeTruthy();
    expect(screen.getByText('还没有录音')).toBeTruthy();
    expect(screen.getByRole('button', { name: '导入录音…' })).toBeTruthy();
    expect(screen.queryByText('转写')).toBeNull();
    expect(screen.queryByTestId('desktop-waveform')).toBeNull();
    expect(screen.queryByText('片段检查器')).toBeNull();
  });

  it('registers a picked recording on a manuscript and a transcription layer', async () => {
    const calls: string[] = [];
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
      desktopCall: vi.fn(async (_session: string, method: string) => {
        calls.push(method);
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
      /\.desktop-tx-lane \.timeline-annotation\.timeline-annotation-selected[\s\S]*var\(--brand-tint\)[\s\S]*var\(--text-secondary\)[\s\S]*var\(--radius-md\)[\s\S]*rgb\(17 17 17 \/ 14%\)/,
    );
    expect(css).toMatch(/data-theme='dark'[\s\S]*rgb\(244 242 236 \/ 18%\)/);
    expect(css).toMatch(
      /\.desktop-tx-lane \.timeline-annotation-resize-handle[\s\S]*display:\s*none/,
    );
  });
});
