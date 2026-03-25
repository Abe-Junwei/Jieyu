// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveState } from '../hooks/transcriptionTypes';
import { ToastController } from './TranscriptionPage.ToastController';

const showToast = vi.fn<(message: string, variant?: string, autoDismissMs?: number) => void>();
const showSaveState = vi.fn<(state: SaveState) => void>();
const showVoiceState = vi.fn<(mode: string | null, isListening?: boolean) => void>();

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast,
    showSaveState,
    showVoiceState,
    dismiss: vi.fn(),
  }),
}));

const baseProps = {
  voiceAgent: {
    agentState: 'idle',
    mode: 'idle',
    listening: false,
    isRecording: false,
  },
  saveState: { kind: 'idle' } as SaveState,
  recording: false,
  recordingUtteranceId: null,
  recordingError: null,
  tf: (key: string) => key,
};

describe('ToastController overlap cycle toast', () => {
  afterEach(() => {
    showToast.mockClear();
    showSaveState.mockClear();
    showVoiceState.mockClear();
  });

  it('shows lightweight toast when overlap cycle payload updates', () => {
    const { rerender } = render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
      />,
    );

    expect(showToast).not.toHaveBeenCalledWith('重叠候选 2/4', 'info', 1200);

    rerender(
      <ToastController
        {...baseProps}
        overlapCycleToast={{ index: 2, total: 4, nonce: Date.now() }}
      />,
    );

    expect(showToast).toHaveBeenCalledWith('重叠候选 2/4', 'info', 1200);
  });

  it('does not show overlap cycle toast when payload is absent', () => {
    render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
      />,
    );

    const overlapCalls = showToast.mock.calls.filter((call) => String(call[0]).includes('重叠候选'));
    expect(overlapCalls.length).toBe(0);
  });

  it('shows lock conflict toast when payload updates', () => {
    render(
      <ToastController
        {...baseProps}
        overlapCycleToast={null}
        lockConflictToast={{ count: 2, speakers: ['甲', '乙'], nonce: Date.now() }}
      />,
    );

    expect(showToast).toHaveBeenCalledWith('锁定冲突 2 项：甲、乙', 'info', 2200);
  });
});
