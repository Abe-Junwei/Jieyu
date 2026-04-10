// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('./pages/WritingPage', () => ({ WritingPage: () => <div>writing-page</div> }));
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
    expect(screen.getAllByRole('link', { name: /Writing|写作/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Lexicon|词典/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Orthographies|正字法/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Orthography Bridges|正字法桥接/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/功能面板内容区|Feature panel content area/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Language Assets|语言资产/).length).toBeGreaterThan(0);
  });

  it('opens language metadata as a modal panel over the current page from the left rail button', async () => {
    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ })[0]!);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Orthography Bridges|正字法桥接/ })[0]!);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Orthographies|正字法/ })[0]!);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ })[0]!);
    expect(await screen.findByText('language-metadata-page')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Orthography Bridges|正字法桥接/ })[0]!);
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

    fireEvent.click(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ })[0]!);
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

    fireEvent.click(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ })[0]!);
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

    fireEvent.click(screen.getAllByRole('button', { name: /Orthographies|正字法/ })[0]!);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Language Metadata|语言元数据/ })[0]!);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Orthography Bridges|正字法桥接/ })[0]!);

    expect(screen.getAllByTestId('transcription-page')[0]?.textContent).toContain('transcription-ready');
    expect((await screen.findAllByText('orthography-bridge-workspace-page')).length).toBeGreaterThan(0);
    const dialog = screen.getAllByRole('dialog', { name: /Orthography Bridges|正字法桥接/ })[0];
    expect(dialog).toBeTruthy();
    expect(dialog!.className).toContain('dialog-card-wide');
  });

  it('persists locale preference and rerenders shell copy after toggling language', () => {
    const getter = vi.spyOn(navigator, 'language', 'get');
    getter.mockReturnValue('zh-CN');

    render(
      <MemoryRouter initialEntries={['/transcription']} future={ROUTER_FUTURE_FLAGS}>
        <App />
      </MemoryRouter>,
    );

    const localeToggle = screen.getByRole('button', { name: 'Switch to English' });
    fireEvent.click(localeToggle);

    expect(window.localStorage.getItem('jieyu.locale')).toBe('en-US');
    expect(screen.getAllByRole('link', { name: 'Transcription' }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Feature panel content area').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Switch to Chinese' }).length).toBeGreaterThan(0);

    getter.mockRestore();
  });

});
