// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { NotePanel } from './NotePanel';
import { ShortcutsPanel } from './ShortcutsPanel';
import { SidePaneActionModal } from './SidePaneActionModal';

const {
  computeAdaptivePanelWidthMock,
  readPersistedUiFontScaleMock,
  resolveTextDirectionFromLocaleMock,
} = vi.hoisted(() => ({
  computeAdaptivePanelWidthMock: vi.fn<(input: { baseWidth: number; direction: 'ltr' | 'rtl' }) => number>(),
  readPersistedUiFontScaleMock: vi.fn<(locale: string, direction: 'ltr' | 'rtl') => number>(),
  resolveTextDirectionFromLocaleMock: vi.fn<(locale: string) => 'ltr' | 'rtl'>(),
}));

vi.mock('../utils/panelAdaptiveLayout', () => ({
  computeAdaptivePanelWidth: (input: { baseWidth: number; direction: 'ltr' | 'rtl' }) => computeAdaptivePanelWidthMock(input),
  readPersistedUiFontScale: (locale: string, direction: 'ltr' | 'rtl') => readPersistedUiFontScaleMock(locale, direction),
  resolveTextDirectionFromLocale: (locale: string) => resolveTextDirectionFromLocaleMock(locale),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  computeAdaptivePanelWidthMock.mockReset();
  readPersistedUiFontScaleMock.mockReset();
  resolveTextDirectionFromLocaleMock.mockReset();
  readPersistedUiFontScaleMock.mockReturnValue(1);
});

describe('Adaptive panel RTL interaction matrix', () => {
  it.each([
    { direction: 'ltr' as const, width: 380 },
    { direction: 'rtl' as const, width: 440 },
  ])('keeps NotePanel direction and add interaction stable in $direction mode', async ({ direction, width }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);
    computeAdaptivePanelWidthMock.mockReturnValue(width);

    const onAdd = vi.fn(async () => undefined);

    const view = render(
      <LocaleProvider locale="en-US">
        <NotePanel
          isOpen
          notes={[]}
          targetLabel="U1"
          onClose={vi.fn()}
          onAdd={onAdd}
          onUpdate={vi.fn(async () => undefined)}
          onDelete={vi.fn(async () => undefined)}
        />
      </LocaleProvider>,
    );

    const panel = view.container.querySelector('.note-panel') as HTMLDivElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('dir')).toBe(direction);

    const addInput = view.container.querySelector('.note-panel-add .note-panel-textarea') as HTMLTextAreaElement;
    const addButton = view.container.querySelector('.note-panel-btn-add') as HTMLButtonElement;
    fireEvent.change(addInput, { target: { value: 'rtl matrix note' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ default: 'rtl matrix note' }, undefined);
    });

    expect(resolveTextDirectionFromLocaleMock).toHaveBeenCalledWith('en-US');
    expect(readPersistedUiFontScaleMock).toHaveBeenCalledWith('en-US', direction);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ direction }));
  });

  it.each([
    { direction: 'ltr' as const, width: 480 },
    { direction: 'rtl' as const, width: 520 },
  ])('keeps ShortcutsPanel direction and escape close stable in $direction mode', ({ direction, width }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);
    computeAdaptivePanelWidthMock.mockReturnValue(width);

    const onClose = vi.fn();

    render(
      <LocaleProvider locale="en-US">
        <ShortcutsPanel onClose={onClose} />
      </LocaleProvider>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('dir')).toBe(direction);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ direction }));
  });

  it.each([
    { direction: 'ltr' as const, compactWidth: 340, speakerWidth: 560 },
    { direction: 'rtl' as const, compactWidth: 420, speakerWidth: 700 },
  ])('keeps SidePaneActionModal sizing and close interaction stable in $direction mode', ({ direction, compactWidth, speakerWidth }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);
    computeAdaptivePanelWidthMock.mockImplementation((input) => {
      if (input.baseWidth === 560) return speakerWidth;
      return compactWidth;
    });

    const onCloseStandard = vi.fn();
    const standard = render(
      <LocaleProvider locale="en-US">
        <SidePaneActionModal ariaLabel="Standard" onClose={onCloseStandard}>
          <div>content</div>
        </SidePaneActionModal>
      </LocaleProvider>,
    );

    const standardDialog = screen.getByRole('dialog', { name: 'Standard' }) as HTMLDivElement;
    expect(standardDialog.style.width).toBe(`${compactWidth}px`);
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    expect(onCloseStandard).toHaveBeenCalledTimes(1);

    standard.unmount();

    const onCloseSpeaker = vi.fn();
    render(
      <LocaleProvider locale="en-US">
        <SidePaneActionModal
          ariaLabel="Speaker"
          onClose={onCloseSpeaker}
          className="transcription-side-pane-action-popover-speaker-centered"
        >
          <div>content</div>
        </SidePaneActionModal>
      </LocaleProvider>,
    );

    const speakerDialog = screen.getByRole('dialog', { name: 'Speaker' }) as HTMLDivElement;
    expect(speakerDialog.style.width).toBe(`${speakerWidth}px`);

    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({
      baseWidth: 340,
      direction,
    }));
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({
      baseWidth: 560,
      direction,
    }));
  });
});
