// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import type { LexemeDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { LexiconPage } from './LexiconPage';

const { mockListLexemes } = vi.hoisted(() => ({
  mockListLexemes: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listLexemes: mockListLexemes,
  },
}));

function SidePaneSnapshot() {
  const registration = useAppSidePaneRegistrationSnapshot();

  return (
    <>
      <div data-testid="side-pane-title">{registration?.title ?? ''}</div>
      <div data-testid="side-pane-subtitle">{registration?.subtitle ?? ''}</div>
      <div data-testid="side-pane-content">{registration?.content ?? null}</div>
    </>
  );
}

describe('LexiconPage', () => {
  beforeEach(() => {
    mockListLexemes.mockReset();
    mockListLexemes.mockResolvedValue([
      {
        id: 'lex-dog',
        lemma: { default: 'dog' },
        citationForm: 'dog',
        senses: [{ gloss: { eng: 'canine' }, definition: { eng: 'domesticated canine' }, category: 'noun' }],
        language: 'eng',
        lexemeType: 'word',
        forms: [{ transcription: { default: 'dogs' } }],
        usageCount: 7,
        notes: { zho: '常见家养动物' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      {
        id: 'lex-run',
        lemma: { default: 'run' },
        senses: [{ gloss: { eng: 'move quickly' } }],
        language: 'eng',
        lexemeType: 'verb',
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
    ] satisfies LexemeDocType[]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the lexicon workspace, selects the first lexeme, and registers the side pane', async () => {
    render(
      <MemoryRouter initialEntries={['/lexicon']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/lexicon" element={<LexiconPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('dog').length).toBeGreaterThan(0);
      expect(screen.getByText('domesticated canine')).toBeTruthy();
    });

    expect(screen.getByTestId('side-pane-title').textContent).toBe('词典工作台');
    expect(screen.getByTestId('side-pane-subtitle').textContent).toBe('dog');
    expect(screen.getByTestId('side-pane-content').textContent).toContain('canine');
  });

  it('filters lexemes by search text and updates the current detail selection', async () => {
    render(
      <MemoryRouter initialEntries={['/lexicon']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/lexicon" element={<LexiconPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const searchInput = await screen.findByRole('searchbox', { name: '按词元、释义或语言筛选词条' });
    fireEvent.change(searchInput, { target: { value: 'move quickly' } });

    await waitFor(() => {
      expect(screen.getAllByText('run').length).toBeGreaterThan(0);
      expect(screen.queryByText('domesticated canine')).toBeNull();
      expect(screen.getAllByText('move quickly').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state and quick access when no lexemes exist', async () => {
    mockListLexemes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/lexicon']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/lexicon" element={<LexiconPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('当前词典里还没有词条；后续可从导入、标注回链或人工创建补齐。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '打开正字法工作台' }).getAttribute('href')).toBe('/lexicon/orthographies');
  });
});