// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import * as HomeProgress from '../utils/homeTranscriptionRecordProgress';
import { HomePage } from './HomePage';

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="zh-CN">
        <MemoryRouter>
          <AppSidePaneProvider>
            <div id="app-side-pane-body-slot" />
            <HomePage />
          </AppSidePaneProvider>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.spyOn(HomeProgress, 'loadAllHomeProjectProgressBundles').mockResolvedValue([
      {
        textId: 'text-demo',
        titleLabel: 'Demo 项目',
        updatedAt: '2024-06-01T12:00:00.000Z',
        languageCode: 'und',
        defaultTranscriptionLayerId: 'layer-tx',
        hasTranslationLayers: true,
        records: [
          {
            kind: 'transcription_record',
            mediaId: 'media-1',
            filename: 'field.wav',
            durationSec: 75,
            transcriptionRate: 0.5,
            translationRate: 0.25,
            annotationRate: 0.1,
            transcriptionUnitCount: 8,
            translationRowCount: 8,
            sentenceCount: 8,
            transcribedCount: 4,
            translatedCount: 2,
            annotatedCount: 1,
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists mocked project and deep-link to transcription', async () => {
    renderHome();

    const projectButton = await screen.findByRole('button', { name: 'Demo 项目' });
    expect(document.getElementById('app-side-pane-body-slot')?.contains(projectButton)).toBe(true);

    const recordLink = screen.getByRole('link', { name: 'field.wav' });
    expect(recordLink.getAttribute('href')).toContain('textId=text-demo');
    expect(recordLink.getAttribute('href')).toContain('mediaId=media-1');
  }, 20_000);
});
