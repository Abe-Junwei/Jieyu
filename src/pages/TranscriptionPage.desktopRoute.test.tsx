// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { TranscriptionPage } from './TranscriptionPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

afterEach(() => {
  cleanup();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

describe('TranscriptionPage desktop route', () => {
  it('returns before the language list loader when Electron has no usable host', () => {
    (globalThis as { jieyuDesktop?: { projectReadEnabled: boolean } }).jieyuDesktop = {
      projectReadEnabled: false,
    };
    render(
      <MemoryRouter initialEntries={['/transcription']}>
        <TranscriptionPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('desktop-unavailable')).toBeTruthy();
  });

  it('stays on the transcription route when the host is ready but no session is open', () => {
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => Promise.resolve({ cancelled: true }),
      desktopCall: () => Promise.resolve([]),
      desktopMediaUrl: () => Promise.resolve({ url: 'media' }),
    };
    render(
      <MemoryRouter initialEntries={['/transcription']}>
        <LocationProbe />
        <Routes>
          <Route path="/transcription" element={<TranscriptionPage />} />
          <Route path="/desktop-project" element={<div data-testid="folder-page" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('desktop-unavailable')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/transcription');
    expect(screen.queryByTestId('folder-page')).toBeNull();
  });
});
