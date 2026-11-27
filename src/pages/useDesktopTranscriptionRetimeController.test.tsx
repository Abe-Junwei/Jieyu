/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../contexts/ToastContext';
import {
  parseRetimeFields,
  useDesktopTranscriptionRetimeController,
} from './useDesktopTranscriptionRetimeController';

const retimeManuscript = vi.fn();

vi.mock('../app/desktopProjectReadPageAccess', () => ({
  createDesktopClient: () => ({ retimeManuscript }),
}));

function wrap({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('parseRetimeFields', () => {
  it('accepts integer offset and positive scale', () => {
    expect(parseRetimeFields('10', '1.5')).toEqual({ ok: true, offsetMs: 10, scale: 1.5 });
    expect(parseRetimeFields('-3', '1')).toEqual({ ok: true, offsetMs: -3, scale: 1 });
  });

  it('rejects non-integer offset or non-positive scale', () => {
    expect(parseRetimeFields('1.5', '1')).toEqual({ ok: false });
    expect(parseRetimeFields('0', '0')).toEqual({ ok: false });
    expect(parseRetimeFields('0', '-1')).toEqual({ ok: false });
    expect(parseRetimeFields('x', '1')).toEqual({ ok: false });
  });
});

describe('useDesktopTranscriptionRetimeController', () => {
  it('sends all-scope empty affected ids and skips when filtering', async () => {
    retimeManuscript.mockReset().mockResolvedValue({ count: 1 });
    const reload = vi.fn(async () => undefined);
    const writeScope = vi.fn(() => ({
      viewScope: { manuscriptId: 'ms', kind: 'all' as const },
      expectedAffectedUnitIds: [] as string[],
    }));
    const { result, rerender } = renderHook(
      (props: { filtering: boolean }) =>
        useDesktopTranscriptionRetimeController({
          locale: 'zh-CN',
          sessionId: 's1',
          manuscriptId: 'ms',
          desktopCall: vi.fn(),
          filtering: props.filtering,
          writeScope,
          reload,
        }),
      { initialProps: { filtering: false }, wrapper: wrap },
    );
    act(() => {
      result.current.ask();
    });
    expect(result.current.open).toBe(true);
    await act(async () => {
      await result.current.confirm();
    });
    expect(retimeManuscript).toHaveBeenCalledWith('s1', {
      manuscriptId: 'ms',
      offsetMs: 0,
      scale: 1,
      viewScope: { manuscriptId: 'ms', kind: 'all' },
      expectedAffectedUnitIds: [],
    });
    expect(reload).toHaveBeenCalled();

    retimeManuscript.mockClear();
    rerender({ filtering: true });
    act(() => {
      result.current.ask();
    });
    expect(result.current.open).toBe(false);
    expect(retimeManuscript).not.toHaveBeenCalled();
  });
});
