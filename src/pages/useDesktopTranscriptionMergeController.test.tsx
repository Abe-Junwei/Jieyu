/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import { keptOnFullestRow, type MergeClipView } from './DesktopTranscriptionMergeDialog';
import { mergeBody, nextMergeId, type MergeUnit } from './desktopTranscriptionMerge';
import { useDesktopTranscriptionMergeController } from './useDesktopTranscriptionMergeController';

const pair: MergeUnit[] = [
  { id: 'a', startMs: 0, endMs: 1000, speakerId: 's' },
  { id: 'b', startMs: 2000, endMs: 3000, speakerId: 's' },
  { id: 'c', startMs: 1200, endMs: 1500, speakerId: 'other' },
];

const preview = {
  keepId: 'a',
  removeId: 'b',
  gapMs: 1000,
  noteCount: 2,
  separator: ' ',
  baseline: 'hash',
  earlier: [],
  later: [],
};

function Host(props: {
  text: string;
  units?: readonly MergeUnit[];
  selected?: string | null;
  prepareText?: () => Promise<boolean>;
}) {
  const merge = useDesktopTranscriptionMergeController({
    locale: 'zh-CN',
    sessionId: 's',
    units: props.units ?? pair,
    selectedUnitId: props.selected === undefined ? 'a' : props.selected,
    textLayerId: 'layer',
    textOf: () => props.text,
    prepareText: props.prepareText ?? (async () => true),
    desktopCall: calls,
    reload: async () => undefined,
  });
  return (
    <div>
      <button type="button" onClick={() => void merge.ask('a')}>
        open
      </button>
      {merge.dialog}
    </div>
  );
}

const calls = vi.fn(async (sessionId: string, method: string) => {
  if (method === 'units.mergePreview') return preview;
  return { sessionId, method };
});

function clip(id: string, layerId: string, fileId: string): MergeClipView {
  return { id, unitId: 'u', layerId, fileId };
}

describe('keptOnFullestRow', () => {
  it('counts each target row after dropping duplicate files', () => {
    const earlier = [clip('a1', 'oral', 'f1'), clip('a2', 'oral', 'f2'), clip('a3', 'voice', 'f3')];
    const later = [clip('b1', 'oral', 'f1'), clip('b2', 'oral', 'f4'), clip('b3', 'voice', 'f5')];
    expect(keptOnFullestRow(earlier, later, [])).toBe(3);
    expect(keptOnFullestRow(earlier, later, ['a2', 'b2'])).toBe(2);
  });
});

describe('mergeBody', () => {
  const key = (layerId: string, unitId: string) => `${layerId}\u001f${unitId}`;
  const units = [
    { id: 'a', text: '甲', draftText: '甲草稿' },
    { id: 'b', text: '乙', draftText: '乙未完成' },
  ];

  it('uses memory input, then a saved draft, then the body', () => {
    const memory = { unitId: key('layer', 'a'), text: '甲输入' };
    expect(mergeBody('layer', 'a', memory, units, key)).toBe('甲输入');
    expect(mergeBody('layer', 'b', memory, units, key)).toBe('乙未完成');
    expect(mergeBody('layer', 'b', null, [{ id: 'b', text: '乙' }], key)).toBe('乙');
    expect(mergeBody('layer', 'b', null, [{ id: 'b', text: '乙', draftText: '' }], key)).toBe('');
  });
});

describe('nextMergeId', () => {
  it('picks the next same speaker and allows another speaker in the gap', () => {
    expect(nextMergeId(pair, 'a')).toBe('b');
    expect(nextMergeId(pair, 'b')).toBeNull();
    expect(
      nextMergeId(
        [
          { ...pair[0]!, speakerId: null },
          { ...pair[1]!, speakerId: 's' },
        ],
        'a',
      ),
    ).toBeNull();
  });
});

describe('merge dialog', () => {
  afterEach(() => {
    cleanup();
    calls.mockReset();
    calls.mockImplementation(async (sessionId: string, method: string) => {
      if (method === 'units.mergePreview') return preview;
      return { sessionId, method };
    });
  });

  it('waits for the editor save before capturing the merge baseline', async () => {
    let release: (saved: boolean) => void = () => undefined;
    const prepareText = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });
    render(
      <ToastProvider>
        <Host text="甲" prepareText={prepareText} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(calls).not.toHaveBeenCalled();
    await act(async () => {
      release(true);
    });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('does not offer a merge when the editor cannot finish saving', async () => {
    render(
      <ToastProvider>
        <Host text="甲" prepareText={async () => false} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });

  it('does not write when cancel is chosen', async () => {
    render(
      <ToastProvider>
        <Host text="甲" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('取消'));
    expect(calls.mock.calls.map((call) => call[1])).toEqual(['units.mergePreview']);
  });

  it('refreshes the open dialog after the text changes and submits the new text', async () => {
    const view = render(
      <ToastProvider>
        <Host text="甲" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    view.rerender(
      <ToastProvider>
        <Host text="甲乙" />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(calls.mock.calls.filter((call) => call[1] === 'units.mergePreview')).toHaveLength(2);
    });
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    await waitFor(() => {
      expect(calls.mock.calls.some((call) => call[1] === 'units.merge')).toBe(true);
    });
    const submitted = (
      calls.mock.calls.find((call) => call[1] === 'units.merge') as unknown[] | undefined
    )?.[2];
    expect(submitted).toMatchObject({
      textLayerId: 'layer',
      keepText: '甲乙',
      removeText: '甲乙',
    });
  });

  it('does not open from ⌘M when there is no next segment', () => {
    render(
      <ToastProvider>
        <Host text="甲" units={[pair[1]!]} selected="b" />
      </ToastProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'm', metaKey: true, bubbles: true }),
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });

  it('does not submit the old text when the editor changes during the preview', async () => {
    let release: (value: typeof preview) => void = () => undefined;
    let previews = 0;
    calls.mockImplementation(async (sessionId: string, method: string) => {
      if (method !== 'units.mergePreview') return { sessionId, method };
      previews += 1;
      if (previews === 1) return preview;
      if (previews === 2) {
        return new Promise<typeof preview>((resolve) => {
          release = resolve;
        });
      }
      return preview;
    });
    const view = render(
      <ToastProvider>
        <Host text="甲" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    view.rerender(
      <ToastProvider>
        <Host text="甲乙" />
      </ToastProvider>,
    );
    await act(async () => {
      release(preview);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        calls.mock.calls.filter((call) => call[1] === 'units.mergePreview').length,
      ).toBeGreaterThan(2);
    });
    expect(calls.mock.calls.map((call) => call[1])).not.toContain('units.merge');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not merge when cancel arrives while the preview is still running', async () => {
    let release: (value: typeof preview) => void = () => undefined;
    let previews = 0;
    calls.mockImplementation(async (sessionId: string, method: string) => {
      if (method !== 'units.mergePreview') return { sessionId, method };
      previews += 1;
      if (previews === 1) return preview;
      return new Promise<typeof preview>((resolve) => {
        release = resolve;
      });
    });
    render(
      <ToastProvider>
        <Host text="甲" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    fireEvent.click(screen.getByText('取消'));
    await act(async () => {
      release(preview);
      await Promise.resolve();
    });
    expect(calls.mock.calls.map((call) => call[1])).not.toContain('units.merge');
  });

  it('does not merge when the saved baseline no longer matches', async () => {
    let previews = 0;
    calls.mockImplementation(async (sessionId: string, method: string) => {
      if (method !== 'units.mergePreview') return { sessionId, method };
      previews += 1;
      return previews === 1 ? preview : { ...preview, baseline: 'changed' };
    });
    render(
      <ToastProvider>
        <Host text="甲" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '合并' }));
    expect(await screen.findByText('文字变了，这次合并不再提交')).toBeTruthy();
    expect(calls.mock.calls.map((call) => call[1])).not.toContain('units.merge');
  });
});
