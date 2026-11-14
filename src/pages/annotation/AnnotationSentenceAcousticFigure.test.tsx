// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationSentenceAcousticFigure } from './AnnotationSentenceAcousticFigure';
const { create, load, destroy } = vi.hoisted(() => ({
  create: vi.fn(),
  load: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('wavesurfer.js', () => ({ default: { create } }));
vi.mock('wavesurfer.js/dist/plugins/spectrogram.esm.js', () => ({
  default: { create: vi.fn(() => ({})) },
}));

describe('AnnotationSentenceAcousticFigure retry', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });
  it.each([false, true])(
    'loads a valid replacement audio in the same failed instance (spectrum=%s)',
    async (showSpectrum) => {
      create.mockImplementation(() => ({ load, destroy }));
      load.mockRejectedValueOnce(new Error('invalid audio')).mockResolvedValue(undefined);
      const props = {
        figure: null,
        audioUrl: 'blob:bad',
        status: 'ready' as const,
        contentWidth: 320,
        showWave: true,
        showSpectrum,
        showPitch: false,
      };
      const view = render(<AnnotationSentenceAcousticFigure {...props} />);
      await waitFor(() =>
        expect(view.container.querySelector('.annotation-sentence-acoustic-status')).not.toBeNull(),
      );
      expect(load).toHaveBeenCalledWith('blob:bad');
      view.rerender(<AnnotationSentenceAcousticFigure {...props} audioUrl="blob:valid" />);
      await waitFor(() => expect(load).toHaveBeenCalledWith('blob:valid'));
      await waitFor(() =>
        expect(view.container.querySelector('.annotation-sentence-acoustic-status')).toBeNull(),
      );
      expect(view.getByTestId('annotation-sentence-wave').isConnected).toBe(true);
      expect(view.getByTestId('annotation-sentence-acoustic').hidden).toBe(false);
      expect(create).toHaveBeenCalledTimes(2);
      expect(destroy).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(destroy).toHaveBeenCalledTimes(2);
    },
  );
});
