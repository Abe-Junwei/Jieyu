// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';
import { DesktopTranscriptionWorkspacePage } from './DesktopTranscriptionWorkspacePage';

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
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
    expect(screen.getByText('转写工作区')).toBeTruthy();
    expect(screen.getByText('片段检查器')).toBeTruthy();
    expect(screen.getByText('稿件与层')).toBeTruthy();
  });

  it('does not import Dexie or ReadyWorkspace orchestrator modules', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/DesktopTranscriptionWorkspacePage.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"].*dexie/i);
    expect(source).not.toMatch(/readyWorkspace/i);
  });
});
