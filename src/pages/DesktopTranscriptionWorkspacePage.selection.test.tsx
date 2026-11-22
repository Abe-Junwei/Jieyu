/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
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
    layers: [
      {
        id: 'layer-1',
        name: { zh: '转写' },
        contentType: 'transcription',
        tierType: 'time-aligned',
        units: [] as { id: string; startMs: number; endMs: number; text: string }[],
      },
    ] as {
      id: string;
      key?: string;
      name: Record<string, string>;
      contentType?: string;
      tierType?: string;
      sortOrder?: number;
      units: { id: string; startMs: number; endMs: number; text: string }[];
    }[],
    layerId: 'layer-1' as string | null,
    links: [] as {
      layerId: string;
      hostLayerId: string;
      isPreferred: boolean;
      sortOrder: number;
    }[],
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

const sidePaneContents: unknown[] = [];
vi.mock('../contexts/AppSidePaneContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AppSidePaneContext')>()),
  useRegisterAppSidePane: ({ content }: { content: unknown }) => {
    sidePaneContents.push(content);
  },
}));
vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn(() => ({
      on: vi.fn(),
      un: vi.fn(),
      load: vi.fn(() => Promise.resolve()),
      setVolume: vi.fn(),
      setPlaybackRate: vi.fn(),
      destroy: vi.fn(),
      getDecodedData: vi.fn(() => null),
      getDuration: vi.fn(() => 0),
      getCurrentTime: vi.fn(() => 0),
      isPlaying: vi.fn(() => false),
      zoom: vi.fn(),
      getScroll: vi.fn(() => 0),
    })),
  },
}));
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

  it('does not create units from drags before the timeline has a pixel scale', async () => {
    const calls: string[] = [];
    readState.model = { ...readState.base(), units: [] };
    renderWorkspace('/transcription', async (_sessionId, method) => {
      calls.push(method);
      if (method === 'units.readTimeDraft') return [];
      return null;
    });

    const waveform = screen.getByTestId('desktop-waveform');
    const track = document.querySelector('.desktop-tx-lane__track');
    if (!track) throw new Error('missing text track');
    for (const target of [waveform, track]) {
      fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 20 });
      fireEvent.pointerMove(window, { clientX: 300, clientY: 20 });
      fireEvent.pointerUp(window, { clientX: 300, clientY: 20 });
    }

    expect(calls).not.toContain('units.create');
  });

  it('shows the empty state when no layer remains, and the button creates a transcription layer', async () => {
    const calls: string[] = [];
    readState.model = { ...readState.base(), layers: [], layerId: null, units: [] };
    renderWorkspace('/transcription', async (_sessionId, method) => {
      calls.push(method);
      if (method === 'layers.listDeleted') return [];
      if (method === 'layers.create') return { id: 'layer-new' };
      return null;
    });

    expect(screen.getByRole('heading', { name: '还没有层' })).toBeTruthy();
    expect(screen.getByText('新建一个转写层后，可以在波形上拖出句段。')).toBeTruthy();
    expect(document.querySelector('.desktop-tx-lane')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新建转写层' }));
    await waitFor(() => expect(calls).toContain('layers.create'));
  });

  it('names the lane after the deep-linked layer and keeps that layer’s units', () => {
    readState.model = {
      ...readState.base(),
      layers: [
        { id: 'layer-tx', name: { zh: '转写' }, units: [] },
        { id: 'layer-tl', name: { zh: '翻译' }, units: [] },
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
        args: expect.objectContaining({ unitId: 'u-a', edge: 'end', time: 1500 }),
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
      expect(saveText).toHaveBeenCalledWith('u-a', 'alpha beta', expect.any(String), 'layer-1');
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
      expect(saveText).toHaveBeenCalledWith('u-a', '你', expect.any(String), 'layer-1');
    });
  });

  it('edits a linked layer row’s own text and guards switching away from it', async () => {
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        { id: 'layer-1', name: { zh: '转写' }, units: [] },
        {
          id: 'layer-tl',
          name: { zh: '翻译' },
          sortOrder: 1,
          units: [{ id: 'u-a', startMs: 0, endMs: 1000, text: 'gloss-a' }],
        },
      ],
    };
    renderWorkspace();
    const row = document.querySelector('[data-layer-id="layer-tl"]');
    expect(row?.querySelector('.desktop-tx-band-label')?.textContent).toBe('翻译');
    fireEvent.click(screen.getByText('gloss-a'));
    expect(annotation('gloss-a')?.classList.contains('timeline-annotation-selected')).toBe(true);
    fireEvent.click(screen.getByText('gloss-a'));
    const input = bodyInput();
    expect(input.value).toBe('gloss-a');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'gl' }, isComposing: true });
    fireEvent.click(screen.getByText('alpha'));
    expect(await screen.findByRole('dialog', { name: '正文还没保存' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '留在这里' }));
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'gloss A' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(saveText).toHaveBeenCalledWith('u-a', 'gloss A', expect.any(String), 'layer-tl');
    });
    expect(screen.getByText('alpha')).toBeTruthy();
  });

  it('moves the focus highlight from the main card to a linked layer row card', () => {
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        { id: 'layer-1', name: { zh: '转写' }, units: [] },
        {
          id: 'layer-tl',
          name: { zh: '翻译' },
          sortOrder: 1,
          units: [{ id: 'u-a', startMs: 0, endMs: 1000, text: 'gloss-a' }],
        },
      ],
    };
    renderWorkspace();
    const selectedClass = 'timeline-annotation-selected';
    fireEvent.click(screen.getByText('alpha'));
    expect(annotation('alpha')?.classList.contains(selectedClass)).toBe(true);
    fireEvent.click(screen.getByText('gloss-a'));
    expect(annotation('gloss-a')?.classList.contains(selectedClass)).toBe(true);
    expect(annotation('alpha')?.classList.contains(selectedClass)).toBe(false);
    fireEvent.click(screen.getByText('alpha'));
    expect(annotation('alpha')?.classList.contains(selectedClass)).toBe(true);
    expect(annotation('gloss-a')?.classList.contains(selectedClass)).toBe(false);
  });

  it('squeezes a layer to a strip from its menu and hands focus back to the main layer', async () => {
    window.localStorage.clear();
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        { id: 'layer-1', name: { zh: '转写' }, units: [] },
        {
          id: 'layer-tl',
          name: { zh: '翻译' },
          sortOrder: 1,
          units: [{ id: 'u-a', startMs: 0, endMs: 1000, text: 'gloss-a' }],
        },
      ],
    };
    renderWorkspace();
    fireEvent.click(screen.getByText('gloss-a'));
    const label = document.querySelector('[data-layer-id="layer-tl"] .desktop-tx-layer-label');
    fireEvent.contextMenu(label as Element);
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: '收起该层' }));
    expect(screen.getByRole('menuitem', { name: '收起该层' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '收起该层' }));
    await waitFor(() => {
      expect(
        document.querySelector('.desktop-tx-layer-strip[data-layer-id="layer-tl"]'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('gloss-a')).toBeNull();
    expect(annotation('alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /展开/ }));
    expect(screen.getByText('gloss-a')).toBeTruthy();
  });

  it('draws a tree line only for a linked layer and folds the host’s group', async () => {
    window.localStorage.clear();
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        { id: 'layer-1', name: { zh: '转写' }, units: [] },
        {
          id: 'layer-tl',
          name: { zh: '翻译' },
          sortOrder: 1,
          units: [{ id: 'u-a', startMs: 0, endMs: 1000, text: 'gloss-a' }],
        },
        { id: 'layer-loose', name: { zh: '备注' }, sortOrder: 2, units: [] },
      ],
      links: [{ layerId: 'layer-tl', hostLayerId: 'layer-1', isPreferred: true, sortOrder: 0 }],
    };
    renderWorkspace();
    const elbow = (id: string) => document.querySelector(`[data-layer-id="${id}"] .tree-elbow`);
    expect(elbow('layer-tl')).toBeTruthy();
    expect(elbow('layer-loose')).toBeNull();
    expect(
      document.querySelector('[data-layer-id="layer-1"]')?.classList.contains('is-group-mid'),
    ).toBe(true);
    expect(
      document.querySelector('[data-layer-id="layer-tl"]')?.classList.contains('is-group-mid'),
    ).toBe(false);
    expect(
      document.querySelector('[data-testid="desktop-readonly-timeline"] .tree-elbow'),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '收起 转写 的从属层' }));
    await waitFor(() => {
      expect(document.querySelector('[data-layer-id="layer-tl"]')).toBeNull();
    });
    expect(
      document.querySelector('[data-layer-id="layer-1"]')?.classList.contains('is-group-mid'),
    ).toBe(false);
    expect(screen.queryByText('gloss-a')).toBeNull();
    expect(screen.getByText('+1 层')).toBeTruthy();
    expect(document.querySelector('[data-layer-id="layer-loose"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '展开 转写 的从属层' }));
    expect(screen.getByText('gloss-a')).toBeTruthy();
    expect(elbow('layer-tl')).toBeTruthy();
    expect(screen.queryByText('+1 层')).toBeNull();
  });

  it('keeps the side pane content identical while typing a body', () => {
    renderWorkspace();
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.click(screen.getByText('alpha'));
    const input = bodyInput();
    const before = sidePaneContents[sidePaneContents.length - 1];
    fireEvent.change(input, { target: { value: 'alphax' } });
    fireEvent.change(input, { target: { value: 'alphaxy' } });
    expect(sidePaneContents[sidePaneContents.length - 1]).toBe(before);
  });
});

describe('DesktopTranscriptionWorkspacePage edge gaps (#562)', () => {
  function recordCalls(answer: (method: string, args: unknown) => unknown = () => null) {
    const calls: { method: string; args: unknown }[] = [];
    renderWorkspace('/transcription', async (_sessionId, method, args) => {
      calls.push({ method, args });
      return answer(method, args);
    });
    return calls;
  }

  it('cycles the current edge with E and nudges the shared boundary', async () => {
    const calls = recordCalls((method) => (method === 'units.readTimeDraft' ? [] : null));
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByTestId('desktop-edge-focus').textContent).toBe('当前边界：起点');
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByTestId('desktop-edge-focus').textContent).toBe('当前边界：终点');
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByTestId('desktop-edge-focus').textContent).toBe('当前边界：与下一段共用');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'units.moveSharedBoundary',
        args: expect.objectContaining({ leftId: 'u-a', rightId: 'u-b', time: 1010 }),
      });
    });
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByTestId('desktop-edge-focus').textContent).toBe('当前边界：起点');
  });

  it('shows a draft typed against an older time side by side and rechecks it on request', async () => {
    const calls = recordCalls((method) =>
      method === 'units.readTimeDraft'
        ? [
            {
              unitId: 'u-a',
              edge: 'end',
              rawInput: '00:00:01.500',
              baseMs: 900,
              issue: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentMs: 1000,
              conflict: true,
            },
          ]
        : null,
    );
    fireEvent.click(screen.getByText('alpha'));
    expect(await screen.findByText('现正式时间 00:00:01.000')).toBeTruthy();
    expect(screen.getByText('你的输入 00:00:01.500')).toBeTruthy();
    expect(calls.some((call) => call.method === 'units.moveEdge')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '按新时间重新校验并提交' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'units.moveEdge',
        args: expect.objectContaining({ unitId: 'u-a', edge: 'end', time: 1500 }),
      });
    });
    await waitFor(() => expect(screen.queryByText('现正式时间 00:00:01.000')).toBeNull());
  });

  it('keeps an unfinished conflicting draft on the new base, or discards it', async () => {
    const calls = recordCalls((method) =>
      method === 'units.readTimeDraft'
        ? [
            {
              unitId: 'u-a',
              edge: 'start',
              rawInput: '00:00:00.',
              baseMs: 200,
              issue: 'format',
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentMs: 0,
              conflict: true,
            },
          ]
        : null,
    );
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.click(await screen.findByRole('button', { name: '按新时间重新校验并提交' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'units.putTimeDraft',
        args: {
          unitId: 'u-a',
          edge: 'start',
          rawInput: '00:00:00.',
          baseMs: 0,
          issue: 'format',
        },
      });
    });
    expect(calls.some((call) => call.method === 'units.moveEdge')).toBe(false);

    cleanup();
    const again = recordCalls((method) =>
      method === 'units.readTimeDraft'
        ? [
            {
              unitId: 'u-a',
              edge: 'start',
              rawInput: '00:00:00.300',
              baseMs: 200,
              issue: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
              currentMs: 0,
              conflict: true,
            },
          ]
        : null,
    );
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.click(await screen.findByRole('button', { name: '放弃草稿' }));
    await waitFor(() => {
      expect(again).toContainEqual({
        method: 'units.discardTimeDraft',
        args: { unitId: 'u-a', edge: 'start' },
      });
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: '放弃草稿' })).toBeNull());
    expect(again.some((call) => call.method === 'units.moveEdge')).toBe(false);
  });

  it('confirms deletion in a modal that lists only non-empty children and returns focus on Escape', async () => {
    const calls = recordCalls((method) => {
      if (method === 'units.readTimeDraft') return [];
      if (method === 'units.deletePreview') {
        return {
          linkedTexts: 0,
          tokens: 2,
          morphemes: 0,
          notes: 1,
          lexemeLinks: 0,
          analysisCandidates: 0,
          customFieldValues: 0,
          drafts: 0,
          receptionRecords: 0,
        };
      }
      return null;
    });
    fireEvent.click(screen.getByText('alpha'));
    fireEvent.keyDown(window, { key: 'Delete' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('词注 2');
    expect(dialog.textContent).toContain('备注 1');
    expect(dialog.textContent).not.toContain('语素');
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => expect(document.activeElement).toBe(annotation('alpha')));
    expect(calls.some((call) => call.method === 'units.delete')).toBe(false);
  });

  it('keeps a stale undo step and drops it only when asked', async () => {
    const calls = recordCalls((method) => {
      if (method === 'units.undo') throw new Error('undo is stale');
      if (method === 'units.inspectEdit') return { status: 'not-submitted' };
      if (method === 'units.dropUndo') return { dropped: true };
      return null;
    });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    const notice = await screen.findByTestId('desktop-edge-stale');
    expect(notice.textContent).toContain('该语段之后又被改过，先处理后续修改');
    expect(calls.some((call) => call.method === 'units.dropUndo')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '放弃这一步撤销' }));
    await waitFor(() => {
      expect(calls).toContainEqual({ method: 'units.dropUndo', args: { manuscriptId: 'ms-1' } });
    });
    await waitFor(() => expect(screen.queryByTestId('desktop-edge-stale')).toBeNull());
  });
});

describe('DesktopTranscriptionWorkspacePage layers (#597)', () => {
  it('lists both layers and creates a translation layer on the transcription host', async () => {
    const calls: { method: string; args: unknown }[] = [];
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        {
          id: 'layer-1',
          key: 'tx',
          name: { zh: '转写' },
          contentType: 'transcription',
          tierType: 'time-aligned',
          units: [],
        },
        {
          id: 'layer-tl',
          key: 'tl',
          name: { zh: '翻译' },
          contentType: 'translation',
          tierType: 'symbolic-association',
          units: [{ id: 'u-a', startMs: 0, endMs: 1000, text: 'gloss-a' }],
        },
      ],
    };
    renderWorkspace('/transcription', async (_sessionId, method, args) => {
      calls.push({ method, args });
      return { id: 'new-layer' };
    });
    expect(screen.getAllByRole('button', { name: '调整层高' }).length).toBeGreaterThan(0);
    const pane = sidePaneContents.at(-1);
    if (pane === undefined) throw new Error('missing context column');
    render(pane as ReactElement);
    fireEvent.click(screen.getByRole('button', { name: /^层\d+$/ }));
    expect(screen.getByRole('button', { name: /^译文翻译$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新建翻译层' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'layers.create',
        args: expect.objectContaining({
          contentType: 'translation',
          tierType: 'symbolic-association',
          hosts: [{ hostLayerId: 'layer-1', preferred: true }],
        }),
      });
    });
  });

  it('hosts a new translation layer on the current transcription layer', async () => {
    const calls: { method: string; args: unknown }[] = [];
    readState.model = {
      ...readState.base(),
      layerId: 'layer-tl',
      links: [{ layerId: 'layer-tl', hostLayerId: 'layer-2', isPreferred: true, sortOrder: 0 }],
      layers: [
        {
          id: 'layer-1',
          key: 'tx',
          name: { zh: '转写' },
          contentType: 'transcription',
          tierType: 'time-aligned',
          units: [],
        },
        {
          id: 'layer-2',
          key: 'tx-2',
          name: { zh: '转写二' },
          contentType: 'transcription',
          tierType: 'time-aligned',
          units: [],
        },
        {
          id: 'layer-tl',
          key: 'tl',
          name: { zh: '翻译' },
          contentType: 'translation',
          tierType: 'symbolic-association',
          units: [],
        },
      ],
    };
    renderWorkspace('/transcription', async (_sessionId, method, args) => {
      calls.push({ method, args });
      return { id: 'new-layer' };
    });
    const pane = sidePaneContents.at(-1);
    if (pane === undefined) throw new Error('missing context column');
    render(pane as ReactElement);
    fireEvent.click(screen.getByRole('button', { name: /^层\d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: '新建翻译层' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'layers.create',
        args: expect.objectContaining({
          hosts: [{ hostLayerId: 'layer-2', preferred: true }],
        }),
      });
    });
  });

  it('skips a deleted layer key when creating the next translation layer', async () => {
    const calls: { method: string; args: unknown }[] = [];
    readState.model = {
      ...readState.base(),
      layerId: 'layer-1',
      layers: [
        {
          id: 'layer-1',
          key: 'tx',
          name: { zh: '转写' },
          contentType: 'transcription',
          tierType: 'time-aligned',
          units: [],
        },
      ],
    };
    renderWorkspace('/transcription', async (_sessionId, method, args) => {
      calls.push({ method, args });
      if (method === 'layers.listDeleted') {
        return [{ manuscriptId: 'ms-1', key: 'tl-2' }];
      }
      return { id: 'new-layer' };
    });
    const pane = sidePaneContents.at(-1);
    if (pane === undefined) throw new Error('missing context column');
    render(pane as ReactElement);
    fireEvent.click(screen.getByRole('button', { name: /^层\d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: '新建翻译层' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'layers.create',
        args: expect.objectContaining({ key: 'tl-3' }),
      });
    });
  });
});
