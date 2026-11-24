/** @vitest-environment jsdom */
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { textKey } from './desktopTranscriptionTextKey';
import {
  splitOpen,
  useDesktopTranscriptionSplitController,
} from './useDesktopTranscriptionSplitController';

const unit = {
  timeMs: 500,
  startMs: 0,
  endMs: 1000,
  unitId: 'u',
  activeLayerId: 'tx',
  activeSource: '原文句子',
};

describe('splitOpen', () => {
  it('cuts the active layer at the editor caret', () => {
    expect(
      splitOpen({
        ...unit,
        caret: { layerId: 'tx', unitId: 'u', index: 2, source: '原文句子' },
      }),
    ).toEqual({ ok: true, textLayerId: 'tx', source: '原文句子', cutIndex: 2 });
  });

  it('keeps the whole active text on the left when this unit has no caret', () => {
    expect(splitOpen({ ...unit, caret: null })).toEqual({
      ok: true,
      textLayerId: 'tx',
      source: '原文句子',
      cutIndex: 4,
    });
  });

  it('uses the caret layer and its text, not the layer that became active later', () => {
    expect(
      splitOpen({
        ...unit,
        activeLayerId: 'tl',
        activeSource: '后来的层',
        caret: { layerId: 'tx', unitId: 'u', index: 1, source: '原文句子' },
      }),
    ).toEqual({ ok: true, textLayerId: 'tx', source: '原文句子', cutIndex: 1 });
  });

  it('says the playhead is outside before it says the cut is too close', () => {
    expect(splitOpen({ ...unit, timeMs: 2000, caret: null }).ok).toBe(false);
    expect(splitOpen({ ...unit, timeMs: 2000, caret: null })).toMatchObject({ reason: 'outside' });
    expect(splitOpen({ ...unit, timeMs: 5, caret: null })).toMatchObject({ reason: 'too-close' });
  });
});

const segment = { id: 'u', startTime: 0, endTime: 2, text: '原文句子' };

function mount(overrides: {
  text?: string;
  draft?: { unitId: string; text: string } | null;
  desktopCall?: ReturnType<typeof vi.fn>;
}) {
  const desktopCall = overrides.desktopCall ?? vi.fn(async () => ({}));
  const reload = vi.fn(async () => undefined);
  const rendered = renderHook(
    () =>
      useDesktopTranscriptionSplitController({
        locale: 'zh-CN',
        sessionId: 's',
        textLayerId: 'tx',
        units: [{ ...segment, ...(overrides.text === undefined ? {} : { text: overrides.text }) }],
        draft: overrides.draft ?? null,
        desktopCall: desktopCall as (
          sessionId: string,
          method: string,
          args: unknown,
        ) => Promise<unknown>,
        playheadSec: () => 0.5,
        reload,
      }),
    { wrapper: ToastProvider },
  );
  return { ...rendered, desktopCall, reload };
}

describe('split ask', () => {
  afterEach(() => cleanup());

  it('writes the split at once when the segment has text', async () => {
    const { result, desktopCall, reload } = mount({});
    await act(async () => {
      await result.current.ask('u', 'playhead');
    });
    expect(desktopCall).toHaveBeenCalledTimes(2);
    expect(desktopCall).toHaveBeenCalledWith(
      's',
      'units.split',
      expect.objectContaining({ unitId: 'u', time: 500, rawInput: '原文句子', cutIndex: 4 }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/录音已完整保留/)).toBeNull();
  });

  it('reports retained recordings only when the split carries them', async () => {
    const { result } = mount({ desktopCall: vi.fn(async () => ({ recordingCount: 5 })) });
    await act(async () => {
      await result.current.ask('u', 'playhead');
    });
    expect(screen.getByText('5 条录音已完整保留在左段。')).toBeTruthy();
  });

  it('splits an empty segment at a valid time', async () => {
    const { result, desktopCall } = mount({ text: '' });
    await act(async () => {
      await result.current.ask('u', 'playhead');
    });
    expect(desktopCall).toHaveBeenCalledWith(
      's',
      'units.split',
      expect.objectContaining({ time: 500, rawInput: '', cutIndex: 0 }),
    );
  });

  it('stores unsaved text as a draft before splitting it', async () => {
    const { result, desktopCall } = mount({
      text: '',
      draft: { unitId: textKey('tx', 'u'), text: '新的句子' },
    });
    await act(async () => {
      await result.current.ask('u', 'playhead');
    });
    expect(desktopCall.mock.calls.map((call) => call[1])).toEqual([
      'units.splitPreview',
      'units.putTextDraft',
      'units.split',
    ]);
    expect(desktopCall).toHaveBeenNthCalledWith(
      2,
      's',
      'units.putTextDraft',
      expect.objectContaining({ rawInput: '新的句子', baseBody: '', textLayerId: 'tx' }),
    );
    expect(desktopCall).toHaveBeenNthCalledWith(
      3,
      's',
      'units.split',
      expect.objectContaining({ rawInput: '新的句子', cutIndex: 4 }),
    );
  });
});
