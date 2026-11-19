/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';

const saveText = vi.fn(async () => true);

vi.mock('./useDesktopProjectReadController', () => ({
  useDesktopProjectReadController: () => ({
    sessionId: 'session-1',
    model: {
      manuscriptId: 'ms-1',
      manuscripts: [{ id: 'ms-1', title: { und: 'Story' }, timeMapping: null }],
      units: [
        { id: 'u-a', startMs: 0, endMs: 1000, text: 'alpha', speakerId: null },
        { id: 'u-b', startMs: 1000, endMs: 2000, text: 'beta', speakerId: null },
      ],
      audioUrl: 'blob:test-audio',
    },
    notes: [],
    projectTitle: 'Project',
    error: '',
    openFolder: vi.fn(),
    selectManuscript: vi.fn(),
    saveText,
    persistTextDraft: vi.fn(async () => undefined),
    discardTextDraft: vi.fn(async () => undefined),
    inspectTextSave: vi.fn(async () => 'saved'),
    readTextDraft: vi.fn(async () => null),
    undoText: vi.fn(),
    splitUnit: vi.fn(),
    mergeUnits: vi.fn(),
    moveBoundary: vi.fn(),
    saveMapping: vi.fn(),
    saveUnitNote: vi.fn(),
    saveTierNote: vi.fn(),
  }),
}));

import {
  desktopSegmentFrame,
  DesktopTranscriptionWorkspacePage,
} from './DesktopTranscriptionWorkspacePage';

vi.mock('wavesurfer.js', () => ({ default: { create: vi.fn() } }));
vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => ({
  default: { create: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn(), clearRegions: vi.fn() })) },
}));

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
  saveText.mockClear();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

function annotation(text: string): Element | null {
  return screen.getByText(text).closest('.timeline-annotation');
}

function renderWorkspace(entry = '/transcription') {
  (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
    desktopCall: vi.fn(async () => {
      throw new Error('unused');
    }),
    desktopMediaUrl: vi.fn(async () => ({ url: '' })),
  };
  render(
    <LocaleProvider locale="zh-CN">
      <DesktopPageRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/transcription" element={<DesktopTranscriptionWorkspacePage />} />
        </Routes>
      </DesktopPageRouter>
    </LocaleProvider>,
  );
}

describe('desktopSegmentFrame', () => {
  const unit = { id: 'u', startTime: 1, endTime: 3, text: 'a' };

  it('uses pixels once the viewport is zoomed', () => {
    expect(desktopSegmentFrame(unit, 10, 0, 1, 50)).toEqual({ left: 50, width: 100 });
  });

  it('uses the full duration before a pixel width exists', () => {
    expect(desktopSegmentFrame(unit, 10, 0, 1, 0)).toEqual({ left: '10%', width: '20%' });
  });
});

describe('DesktopTranscriptionWorkspacePage playback bar', () => {
  it('shows current time and duration after the volume control', () => {
    renderWorkspace();
    const bar = screen.getByTestId('desktop-playback-bar');
    const volume = bar.querySelector('.desktop-tx-volume');
    const readout = screen.getByTestId('desktop-playback-readout');
    expect(volume).toBeTruthy();
    expect(
      volume!.compareDocumentPosition(readout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(readout.querySelector('.desktop-tx-readout__current')?.textContent).toBe('00:00:00.000');
    expect(readout.querySelector('.desktop-tx-readout__total')?.textContent).toMatch(/^\/ /);
  });
});

describe('DesktopTranscriptionWorkspacePage selection (#550)', () => {
  it('selects a segment from the read-only timeline without opening an inspector', () => {
    renderWorkspace();
    expect(screen.queryByRole('complementary', { name: '片段检查器' })).toBeNull();
    expect(screen.queryByText('Project')).toBeNull();
    expect(screen.getByTestId('desktop-playback-bar')).toBeTruthy();
    expect(document.querySelector('.transcription-wave-toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: '只播本段' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByText('alpha'));
    expect(annotation('alpha')?.classList.contains('timeline-annotation-selected')).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByText('beta'));
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(true);
    expect(annotation('alpha')?.classList.contains('timeline-annotation-selected')).toBe(false);
    expect(saveText).not.toHaveBeenCalled();
  });

  it('replaces a deep-linked unit when another unit is clicked', () => {
    renderWorkspace('/transcription?manuscriptId=ms-1&layerId=layer-1&unitId=u-b');
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(true);
    fireEvent.click(screen.getByText('alpha'));
    expect(annotation('alpha')?.classList.contains('timeline-annotation-selected')).toBe(true);
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(false);
  });
});
