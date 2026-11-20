// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DesktopApp } from './DesktopApp';
import {
  forgetOpenProjectSession,
  readOpenProjectSession,
  rememberOpenProjectSession,
} from './desktop/openProjectSession';
import type { DesktopReadHost } from './desktop/projectReadHost';
import { clearActiveProjectTextId, getActiveProjectTextId } from './utils/transcriptionUrlDeepLink';

vi.mock('./pages/DesktopLexiconPage', () => ({
  DesktopLexiconPage: () => <div data-testid="desktop-lexicon-page">desktop-lexicon</div>,
}));
vi.mock('./pages/DesktopCatalogPage', () => ({
  DesktopCatalogPage: ({ section }: { section: string }) => (
    <div data-testid="desktop-catalog-page">{section}</div>
  ),
}));
vi.mock('./pages/DesktopAnnotationPage', () => ({
  DesktopAnnotationPage: () => <div data-testid="desktop-annotation-page">desktop-annotation</div>,
}));
vi.mock('./pages/DesktopProjectReadPage', () => ({
  DesktopProjectReadPage: () => <div data-testid="desktop-folder-page">folder</div>,
}));
vi.mock('./pages/DesktopTranscriptionWorkspacePage', () => ({
  DesktopTranscriptionWorkspacePage: () => (
    <div data-testid="desktop-transcription-workspace">desktop-transcription</div>
  ),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
});

beforeEach(() => {
  vi.stubEnv('VITE_LEGACY_WEB_SURFACE', '');
  window.localStorage.clear();
  forgetOpenProjectSession();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

afterEach(() => {
  cleanup();
  clearActiveProjectTextId();
  forgetOpenProjectSession();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
  vi.unstubAllEnvs();
});

function installDesktopHost(desktopCall: DesktopReadHost['desktopCall']): void {
  (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: () => Promise.resolve({ cancelled: true }),
    desktopCall,
    desktopMediaUrl: () => Promise.resolve({ url: 'media' }),
  };
}

describe('DesktopApp', () => {
  it('shows the desktop shell notice when the bridge is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect((await screen.findByTestId('desktop-unavailable')).textContent).toMatch(
      /请在解语桌面窗口中打开|Open this in the Jieyu desktop window/,
    );
    expect(screen.queryByTestId('app-dev-build-banner')).toBeNull();
  });

  it('opens the desktop home on the folder page', async () => {
    installDesktopHost(() => Promise.resolve([]));
    render(
      <MemoryRouter initialEntries={['/']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-folder-page')).toBeTruthy();
    expect(screen.getByRole('link', { name: /首页|Home/ }).className).toContain(
      'left-rail-btn-active',
    );
  });

  it('does not keep Home highlighted on the folder page', async () => {
    installDesktopHost(() => Promise.resolve([]));
    render(
      <MemoryRouter initialEntries={['/desktop-project']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-folder-page')).toBeTruthy();
    expect(screen.getByRole('link', { name: /首页|Home/ }).className).not.toContain(
      'left-rail-btn-active',
    );
  });

  it('highlights the transcription rail item on /transcription', async () => {
    installDesktopHost(() => Promise.resolve([]));
    render(
      <MemoryRouter initialEntries={['/transcription']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-transcription-workspace')).toBeTruthy();
    expect(screen.getByRole('link', { name: /转写|Transcription/ }).className).toContain(
      'left-rail-btn-active',
    );
  });

  it('keeps a desktop lexicon route without a session', async () => {
    const desktopCall = vi.fn(() => Promise.resolve([]));
    installDesktopHost(desktopCall);
    render(
      <MemoryRouter initialEntries={['/lexicon']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-lexicon-page')).toBeTruthy();
    expect(desktopCall).not.toHaveBeenCalled();
  });

  it.each([
    ['/assets/language-metadata', 'language'],
    ['/assets/orthographies', 'orthography'],
    ['/assets/orthography-bridges', 'bridge'],
    ['/assets/structural-profiles', 'structure'],
  ])('opens %s on the desktop catalog', async (path, section) => {
    rememberOpenProjectSession('session-1');
    installDesktopHost(() => Promise.resolve([]));
    render(
      <MemoryRouter initialEntries={[path]}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-catalog-page')).toHaveTextContent(section);
  });

  it('does not render the collaboration log', async () => {
    installDesktopHost(() => Promise.resolve([]));
    render(
      <MemoryRouter initialEntries={['/transcription']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-transcription-workspace')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Collaboration Cloud Workspace|协同云工作区/ }),
    ).toBeNull();
  });

  it('drops an expired desktop session and stays on the current route', async () => {
    rememberOpenProjectSession('stale');
    installDesktopHost(() => Promise.reject(new Error('project session expired')));
    render(
      <MemoryRouter initialEntries={['/annotation']}>
        <DesktopApp />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('desktop-annotation-page')).toBeTruthy();
    expect(readOpenProjectSession()).toBeNull();
    expect(getActiveProjectTextId()).toBe('');
  });
});
