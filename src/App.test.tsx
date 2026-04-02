// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getAllByLabelText(/功能面板内容区|Feature panel content area/).length).toBeGreaterThan(0);
    expect(screen.queryByText('核心工作区')).toBeNull();
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
