/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';

const saveText = vi.fn(async () => true);
const persistTextDraft = vi.fn(async () => undefined);

const readState = vi.hoisted(() => {
  const base = () => ({
    manuscriptId: 'ms-1',
    manuscripts: [{ id: 'ms-1', title: { und: 'Story' }, timeMapping: null }],
    layers: [] as { id: string; name: Record<string, string> }[],
    layerId: null as string | null,
    units: [
      { id: 'u-a', startMs: 0, endMs: 1000, text: 'alpha', speakerId: null as string | null },
      { id: 'u-b', startMs: 1000, endMs: 2000, text: 'beta', speakerId: null as string | null },
    ],
    audioUrl: 'blob:test-audio',
  });
  return { model: base(), base };
});

vi.mock('./useDesktopProjectReadController', () => ({
  useDesktopProjectReadController: () => ({
    sessionId: 'session-1',
    model: readState.model,
    notes: [],
    projectTitle: 'Project',
    error: '',
    openFolder: vi.fn(),
    selectManuscript: vi.fn(),
    saveText,
    persistTextDraft,
    discardTextDraft: vi.fn(async () => undefined),
    inspectTextSave: vi.fn(async () => 'saved'),
    readTextDraft: vi.fn(async () => null),
    undoText: vi.fn(),
    refresh: vi.fn(async () => undefined),
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
  readState.model = readState.base();
  resetDesktopPageRouters();
  cleanup();
  saveText.mockClear();
  persistTextDraft.mockClear();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

function annotation(text: string): Element | null {
  return document.querySelector(`.timeline-annotation[title="${text}"]`);
}

function bodyInput(): HTMLInputElement {
  const input = document.querySelector('.timeline-annotation-input');
  if (!(input instanceof HTMLInputElement)) throw new Error('missing body input');
  return input;
}

function renderWorkspace(
  entry = '/transcription',
  desktopCall: (
    sessionId: string,
    method: string,
    args: unknown,
  ) => Promise<unknown> = async () => {
    throw new Error('unused');
  },
) {
  (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
    desktopCall: vi.fn(desktopCall),
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
    expect(screen.getByRole('textbox', { name: '起点' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '结束时间' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: '片段检查器' })).toBeNull();

    fireEvent.click(screen.getByText('beta'));
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(true);
    expect(annotation('alpha')?.classList.contains('timeline-annotation-selected')).toBe(false);
    expect(saveText).not.toHaveBeenCalled();
  });

  it('names the lane after the deep-linked layer and keeps that layer’s units', () => {
    readState.model = {
      ...readState.base(),
      layers: [
        { id: 'layer-tx', name: { zh: '转写' } },
        { id: 'layer-tl', name: { zh: '翻译' } },
      ],
      layerId: 'layer-tl',
      units: [{ id: 'u-tl', startMs: 0, endMs: 1000, text: '译文', speakerId: null }],
    };
    renderWorkspace('/transcription?manuscriptId=ms-1&layerId=layer-tl');
    const lane = screen.getByTestId('desktop-readonly-timeline');
    expect(lane.querySelector('.desktop-tx-band-label')?.textContent).toBe('翻译');
    expect(lane.textContent).not.toContain('转写');
    expect(screen.getByText('译文')).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('replaces a deep-linked unit when another unit is clicked', () => {
    renderWorkspace('/transcription?manuscriptId=ms-1&layerId=layer-1&unitId=u-b');
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(true);
    fireEvent.click(screen.getByText('alpha'));
    expect(annotation('alpha')?.classList.contains('timeline-annotation-selected')).toBe(true);
    expect(annotation('beta')?.classList.contains('timeline-annotation-selected')).toBe(false);
  });

  it('writes a finished end time on blur and keeps an unfinished one as a draft', async () => {
    const calls: { method: string; args: unknown }[] = [];
    renderWorkspace('/transcription', async (_sessionId, method, args) => {
      calls.push({ method, args });
      if (method === 'units.readTimeDraft') return [];
      return null;
    });
    fireEvent.click(screen.getByText('alpha'));
    const end = screen.getByRole('textbox', { name: '结束时间' });
    expect(end).toHaveValue('00:00:01.000');
    fireEvent.change(end, { target: { value: '00:00:01.500' } });
    expect(calls.some((call) => call.method === 'units.moveEdge')).toBe(false);
    fireEvent.blur(end);
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'units.moveEdge',
        args: { unitId: 'u-a', edge: 'end', time: 1500 },
      });
    });
    await waitFor(() => expect(end).toHaveValue('00:00:01.000'));

    fireEvent.change(end, { target: { value: '00:00:01.' } });
    fireEvent.blur(end);
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'units.putTimeDraft')).toBe(true);
    });
    expect(calls.filter((call) => call.method === 'units.moveEdge')).toHaveLength(1);
  });

  it('edits the selected body, restores it on escape, and saves a finished edit on blur', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByText('alpha'));
    expect(document.querySelector('.timeline-annotation-input')).toBeNull();
    fireEvent.click(screen.getByText('alpha'));
    const input = bodyInput();
    expect(input.value).toBe('alpha');
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'alpha!' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('.timeline-annotation-input')).toBeNull();
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(saveText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('alpha'));
    const again = bodyInput();
    fireEvent.change(again, { target: { value: '' } });
    fireEvent.blur(again);
    expect(saveText).not.toHaveBeenCalled();
    expect(persistTextDraft).toHaveBeenCalled();
    expect(screen.getByText('草稿已保存，尚未生效')).toBeTruthy();

    fireEvent.change(again, { target: { value: 'alpha beta' } });
    fireEvent.blur(again);
    await waitFor(() => {
      expect(saveText).toHaveBeenCalledWith('u-a', 'alpha beta', expect.any(String));
    });
  });

  it('saves when an IME composition ends and holds the leave dialog while it is open', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.click(screen.getByText('alpha'));
    const input = bodyInput();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ni' }, isComposing: true });
    fireEvent.click(screen.getByText('beta'));
    expect(await screen.findByRole('dialog', { name: '正文还没保存' })).toBeTruthy();
    expect(saveText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '留在这里' }));
    fireEvent.change(input, { target: { value: '你' }, isComposing: true });
    fireEvent.compositionEnd(input);
    await waitFor(() => {
      expect(saveText).toHaveBeenCalledWith('u-a', '你', expect.any(String));
    });
  });
});
