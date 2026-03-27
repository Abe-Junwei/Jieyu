// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

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
  it('forwards shell search requests into the transcription route', async () => {
    render(
      <MemoryRouter initialEntries={['/analysis']}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    const page = await screen.findByTestId('transcription-page');
    expect(page.textContent).toBe('search:');
  });

  it('keeps only the transcription workbench in primary navigation', () => {
    render(
      <MemoryRouter initialEntries={['/transcription']}>
        <App />
      </MemoryRouter>,
    );

    const transcriptionLinks = screen.getAllByRole('link', { name: /Transcription|转写/ });
    expect(transcriptionLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '标注' })).toBeNull();
    expect(screen.queryByRole('link', { name: '分析' })).toBeNull();
  });
});