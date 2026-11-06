// @vitest-environment jsdom
/**
 * #498: after scrolling with no preview, mounting a sub-select preview must apply the current scroll offset.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WaveformOverlayDecorations } from './WaveformOverlayDecorations';

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: 'en-US' as const,
    waveformGuideOverlayWidth: 800,
    waveformGuideOverlayHeight: 120,
    waveformGuideLabelY: 10,
    waveformGuideHotspotTopY: 20,
    waveformGuideHotspotBottomY: 100,
    shouldRenderSelectedHotspot: false,
    selectedHotspotLeftPx: null,
    snapGuideLeftPx: null,
    snapGuideRightPx: null,
    snapGuideNearSideValue: null,
    acousticOverlayMode: 'none' as const,
    acousticOverlayViewportWidth: 800,
    acousticOverlayF0Path: null,
    acousticOverlayIntensityPath: null,
    acousticOverlayVisibleSummary: null,
    acousticOverlayLoading: false,
    hasActiveReadout: false,
    waveLassoOverlay: null,
    subSelectPreviewPx: null as { leftPx: number; widthPx: number } | null,
    waveformOverlayTranslateX: -400,
    waveformNoteIndicators: [],
    onOpenWaveformNotePopover: () => {},
    ...overrides,
  };
}

describe('WaveformOverlayDecorations sub-select preview scroll (#498)', () => {
  afterEach(() => {
    cleanup();
  });

  it('applies the current translateX when the preview mounts after a scroll', () => {
    const { rerender, container } = render(
      <WaveformOverlayDecorations {...baseProps({ subSelectPreviewPx: null })} />,
    );

    expect(container.querySelector('.waveform-subselect-preview-layer')).toBeNull();

    rerender(
      <WaveformOverlayDecorations
        {...baseProps({
          // Scroll offset unchanged; only the preview appears.
          waveformOverlayTranslateX: -400,
          subSelectPreviewPx: { leftPx: 120, widthPx: 80 },
        })}
      />,
    );

    const layer = container.querySelector(
      '.waveform-subselect-preview-layer',
    ) as HTMLDivElement | null;
    expect(layer).not.toBeNull();
    expect(layer!.style.transform).toBe('translateX(-400px)');
  });
});
