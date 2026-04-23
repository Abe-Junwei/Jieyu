// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock('./pages/TranscriptionPage', () => ({
  TranscriptionPage: ({ appSearchRequest }: { appSearchRequest?: { query?: string } | null }) => (
    <div data-testid="transcription-page">{appSearchRequest ? `search:${appSearchRequest.query ?? ''}` : 'transcription-ready'}</div>
  ),
}));

vi.mock('./pages/AnnotationPage', () => ({ AnnotationPage: () => <div>annotation-page</div> }));
vi.mock('./pages/AnalysisPage', () => ({ AnalysisPage: () => <div>analysis-page</div> }));
vi.mock('./pages/CorpusLibraryPage', () => ({ CorpusLibraryPage: () => <div>corpus-library-page</div> }));
vi.mock('./pages/LexiconPage', () => ({ LexiconPage: () => <div>lexicon-page</div> }));
vi.mock('./pages/LanguageMetadataWorkspacePage', () => ({
  LanguageMetadataWorkspacePage: ({ onClose }: { onClose?: () => void }) => (
    <>
      <button type="button" aria-label="Close" onClick={() => onClose?.()}>close</button>
      <div>language-metadata-page</div>
    </>
  ),
}));
vi.mock('./pages/OrthographyManagerPage', () => ({
  OrthographyManagerPage: ({ onClose }: { onClose?: () => void }) => (
    <>
      <button type="button" aria-label="Close" onClick={() => onClose?.()}>close</button>
      <div>orthography-manager-page</div>
    </>
  ),
}));
vi.mock('./pages/OrthographyBridgeWorkspacePage', () => ({
  OrthographyBridgeWorkspacePage: ({ onClose }: { onClose?: () => void }) => (
    <>
      <button type="button" aria-label="Close" onClick={() => onClose?.()}>close</button>
      <div>orthography-bridge-workspace-page</div>
    </>
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

  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function getLeftRailResourcesButton(): HTMLElement {
  return screen.getByRole('button', { name: /Language assets and resources|语言资产与资源/ });
}

function openLanguageAssetFromMenu(name: RegExp): void {
  fireEvent.click(getLeftRailResourcesButton());
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

describe('App shell', () => {
  it('removes shell search/theme/shortcut controls', async () => {
    render(
      <MemoryRouter initialEntries={['/analysis']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: '搜索' })).toBeNull();
    expect(screen.queryByRole('button', { name: /切换.*模式/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '快捷键' })).toBeNull();
  });

  it('renders the current multi-workbench shell navigation', () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    const transcriptionLinks = screen.getAllByRole('link', { name: /Transcription|转写/ });
    expect(transcriptionLinks.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Annotation|标注/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Analysis|分析/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Corpus library|语料库/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Lexicon|词典/ }).length).toBeGreaterThan(0);
    fireEvent.click(getLeftRailResourcesButton());
    expect(screen.getByRole('menuitem', { name: /Language Metadata|语言元数据/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Orthographies|正字法/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Orthography Bridges|正字法桥接/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByLabelText(/功能面板内容区|Feature panel content area/).length).toBeGreaterThan(0);
    expect(within(getLeftRailResourcesButton()).getByText(/Assets|资源/)).toBeTruthy();
  });

  it('opens language metadata as a modal panel over the current page from the left rail button', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Language Metadata|语言元数据/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect(await screen.findByText('language-metadata-page')).toBeTruthy();
    expect(screen.getAllByRole('dialog', { name: /Language Metadata|语言元数据/ }).length).toBeGreaterThan(0);
  });

  it('opens orthography bridges as a modal panel over the current page from the left rail button', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Orthography Bridges|正字法桥接/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect(await screen.findByText('orthography-bridge-workspace-page')).toBeTruthy();
    expect(screen.getAllByRole('dialog', { name: /Orthography Bridges|正字法桥接/ }).length).toBeGreaterThan(0);
  });

  it('opens orthography manager as a modal panel over the current page from the left rail button', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Orthographies|正字法/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect(await screen.findByText('orthography-manager-page')).toBeTruthy();
    expect(screen.getAllByRole('dialog', { name: /Orthographies|正字法/ }).length).toBeGreaterThan(0);
  });

  it('closes language-asset modal directly to background page after modal-to-modal navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Language Metadata|语言元数据/);
    expect(await screen.findByText('language-metadata-page')).toBeTruthy();

    openLanguageAssetFromMenu(/Orthography Bridges|正字法桥接/);
    expect(await screen.findByText('orthography-bridge-workspace-page')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Close|关闭/ }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Orthography Bridges|正字法桥接/ })).toBeNull();
      expect(screen.queryByRole('dialog', { name: /Language Metadata|语言元数据/ })).toBeNull();
    });
    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
  });

  it('closes language-asset modal when pressing Escape', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Language Metadata|语言元数据/);
    expect(await screen.findByText('language-metadata-page')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Language Metadata|语言元数据/ })).toBeNull();
    });
  });

  it('closes language-asset modal when clicking overlay backdrop and keeps shared overlay style', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Language Metadata|语言元数据/);
    expect(await screen.findByText('language-metadata-page')).toBeTruthy();

    const overlay = document.querySelector('.dialog-overlay') as HTMLElement | null;
    expect(overlay).toBeTruthy();
    expect(overlay?.className.includes('dialog-overlay-opaque')).toBe(false);

    if (overlay) {
      fireEvent.click(overlay);
    }

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Language Metadata|语言元数据/ })).toBeNull();
    });
  });

  it('opens orthography manager as a modal over the transcription page and applies wide variant', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Orthographies|正字法/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect((await screen.findAllByText('orthography-manager-page')).length).toBeGreaterThan(0);
    const dialog = screen.getAllByRole('dialog', { name: /Orthographies|正字法/ })[0];
    expect(dialog).toBeTruthy();
    expect(dialog!.className).toContain('dialog-card-wide');
  });

  it('opens language metadata as a modal over the transcription page and applies wide variant', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Language Metadata|语言元数据/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect((await screen.findAllByText('language-metadata-page')).length).toBeGreaterThan(0);
    const dialog = screen.getAllByRole('dialog', { name: /Language Metadata|语言元数据/ })[0];
    expect(dialog).toBeTruthy();
    expect(dialog!.className).toContain('dialog-card-wide');
  });

  it('opens orthography bridges as a modal over the transcription page and applies wide variant', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    openLanguageAssetFromMenu(/Orthography Bridges|正字法桥接/);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect((await screen.findAllByText('orthography-bridge-workspace-page')).length).toBeGreaterThan(0);
    const dialog = screen.getAllByRole('dialog', { name: /Orthography Bridges|正字法桥接/ })[0];
    expect(dialog).toBeTruthy();
    expect(dialog!.className).toContain('dialog-card-wide');
  });

  it('persists locale preference and rerenders shell copy after toggling language', async () => {
    const getter = vi.spyOn(navigator, 'language', 'get');
    getter.mockReturnValue('zh-CN');

    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    const settingsDialog = await screen.findByRole('dialog', { name: '设置' });
    fireEvent.click(within(settingsDialog).getByRole('tab', { name: '语言' }));
    fireEvent.click(within(settingsDialog).getByRole('button', { name: /^English$/ }));

    expect(window.localStorage.getItem('jieyu.locale')).toBe('en-US');
    expect(screen.getAllByRole('link', { name: 'Transcription' }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Feature panel content area').length).toBeGreaterThan(0);

    getter.mockRestore();
  });

});
