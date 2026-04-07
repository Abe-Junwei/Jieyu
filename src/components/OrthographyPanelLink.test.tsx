// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { OrthographyPanelLink } from './OrthographyPanelLink';

function LocationStateProbe() {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: { pathname?: string; search?: string } } | null)?.backgroundLocation;

  return (
    <div data-testid="location-state-probe">
      {`${location.pathname}${location.search}|${backgroundLocation?.pathname ?? ''}${backgroundLocation?.search ?? ''}`}
    </div>
  );
}

describe('OrthographyPanelLink', () => {
  it('preserves the current route as modal background when opening the manager panel', () => {
    render(
      <MemoryRouter initialEntries={['/lexicon?filter=all']}>
        <Routes>
          <Route
            path="/lexicon"
            element={<OrthographyPanelLink>打开正字法管理器</OrthographyPanelLink>}
          />
          <Route path="/assets/orthographies" element={<LocationStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: '打开正字法管理器' }));

    expect(screen.getAllByTestId('location-state-probe')[0]?.textContent).toBe('/assets/orthographies|/lexicon?filter=all');
  });

  it('keeps orthography query params while preserving the background route', () => {
    cleanup();

    render(
      <MemoryRouter initialEntries={['/transcription?tab=layers']}>
        <Routes>
          <Route
            path="/transcription"
            element={(
              <OrthographyPanelLink orthographyId="orth-bridge" fromLayerId="layer_trc_bridge">
                打开正字法桥接工作台
              </OrthographyPanelLink>
            )}
          />
          <Route path="/assets/orthographies" element={<LocationStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: '打开正字法桥接工作台' }));

    expect(screen.getAllByTestId('location-state-probe')[0]?.textContent).toBe('/assets/orthographies?orthographyId=orth-bridge&fromLayerId=layer_trc_bridge|/transcription?tab=layers');
  });
});