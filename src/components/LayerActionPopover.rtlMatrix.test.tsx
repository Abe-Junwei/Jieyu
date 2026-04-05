// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { LayerActionPopover } from './LayerActionPopover';
import { renderWithLocale } from '../test/localeTestUtils';

const {
  computeAdaptivePanelWidthMock,
  readPersistedUiFontScaleMock,
  resolveTextDirectionFromLocaleMock,
  mockUseOrthographies,
} = vi.hoisted(() => ({
  computeAdaptivePanelWidthMock: vi.fn<(input: { direction: 'ltr' | 'rtl'; baseWidth: number }) => number>(),
  readPersistedUiFontScaleMock: vi.fn<(locale: string, direction: 'ltr' | 'rtl') => number>(),
  resolveTextDirectionFromLocaleMock: vi.fn<(locale: string) => 'ltr' | 'rtl'>(),
  mockUseOrthographies: vi.fn(),
}));

vi.mock('../utils/panelAdaptiveLayout', () => ({
  UI_FONT_SCALE_LIMITS: {
    min: 0.85,
    max: 1.4,
    fallback: 1,
    storageKey: 'jieyu:ui-font-scale',
    changeEvent: 'jieyu:ui-font-scale-changed',
  },
  subscribeUiFontScalePreference: () => () => {},
  readUiFontScalePreferenceSnapshot: () => 'auto:1.0000',
  computeAdaptivePanelWidth: (input: { direction: 'ltr' | 'rtl'; baseWidth: number }) => computeAdaptivePanelWidthMock(input),
  readPersistedUiFontScale: (locale: string, direction: 'ltr' | 'rtl') => readPersistedUiFontScaleMock(locale, direction),
  resolveTextDirectionFromLocale: (locale: string) => resolveTextDirectionFromLocaleMock(locale),
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: (...args: unknown[]) => mockUseOrthographies(...args),
}));

const NOW = '2026-04-02T00:00:00.000Z';

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { zho: id },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

describe('LayerActionPopover RTL matrix', () => {
  beforeEach(() => {
    computeAdaptivePanelWidthMock.mockReset();
    readPersistedUiFontScaleMock.mockReset();
    resolveTextDirectionFromLocaleMock.mockReset();
    mockUseOrthographies.mockReset();

    computeAdaptivePanelWidthMock.mockImplementation((input) => input.baseWidth);
    readPersistedUiFontScaleMock.mockReturnValue(1.12);
    mockUseOrthographies.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    { direction: 'ltr' as const },
    { direction: 'rtl' as const },
  ])('applies direction + adaptive width channels in $direction mode', ({ direction }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[makeLayer('trc-base')]}
        createLayer={vi.fn(async () => false)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
      'en-US',
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('dir')).toBe(direction);
    expect(readPersistedUiFontScaleMock).toHaveBeenCalledWith('en-US', direction);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({
      direction,
      baseWidth: 360,
    }));
  });

  it.each([
    { direction: 'ltr' as const },
    { direction: 'rtl' as const },
  ])('keeps confirm/cancel/close interaction order stable in $direction mode', async ({ direction }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);

    const events: string[] = [];
    const createLayer = vi.fn(async () => {
      events.push('confirm');
      return true;
    });
    const onClose = vi.fn(() => {
      events.push('close');
    });

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[]}
        createLayer={createLayer}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={onClose}
      />,
      'en-US',
    );

    const languageCodeInput = screen.getByRole('textbox', { name: /language code/i });
    fireEvent.change(languageCodeInput, { target: { value: 'cmn' } });

    const createButton = screen.getByRole('button', { name: /^new transcription layer$/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const cancelButton = screen.getByRole('button', { name: /^new transcription layer cancel$/i });
    events.push('cancel-click');
    fireEvent.click(cancelButton);

    events.push('close-click');
    fireEvent.click(cancelButton);

    expect(events).toEqual(['confirm', 'close', 'cancel-click', 'close', 'close-click', 'close']);
  });
});
